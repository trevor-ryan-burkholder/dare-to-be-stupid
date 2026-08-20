/**
 * Driver-owned source acquisition (`DESIGN.md` §3.8.6, `PLAN.md` item 49).
 *
 * Fetches the source a citation names and writes the captured package §3.8.4 reads back. Every
 * property here exists because this request is unusual in three ways at once: the **URL is chosen
 * by a model**, the **request originates on the operator's machine**, and the **result becomes
 * evidence**. Each of those needs a different defence.
 *
 * ## The URL is chosen by a model — so the network boundary is enforced, not trusted
 *
 * `scripts/address-policy.mjs` holds the rules. What lives here is the part a policy module cannot
 * do: making sure the connection actually goes to the address that was judged.
 *
 * **The check and the connection must be the same act.** Resolving a name, approving the address,
 * and then handing the *name* to the socket leaves a window in which the second resolution returns
 * something else — DNS rebinding, and it is not exotic; it is a TTL of zero and two A records. So
 * the lookup is performed once, judged, and then supplied to the request as its `lookup` function,
 * which is what the socket connects to. There is no second resolution to disagree with the first.
 *
 * **Every redirect hop is re-judged from scratch.** A public URL that 302s to
 * `http://169.254.169.254/` is the standard bypass of a first-hop-only check, and automatic
 * redirect following is exactly the feature that makes it invisible. Node does not follow
 * redirects on its own, and this module does it manually so each `Location` goes back through the
 * whole policy — scheme, port, credentials, resolution, address.
 *
 * ## The request originates here — so it carries nothing of the operator's
 *
 * No cookies, no `Authorization`, no proxy credentials, no client certificate. A URL carrying
 * credentials is refused by the policy rather than stripped, because fetching the anonymous
 * version of an authenticated page captures a *different document* than the one cited and reports
 * success. This is the same rule §6.1 states for reviewer supply, arriving at the network.
 *
 * ## The result becomes evidence — so it is bounded, inert and digested
 *
 * An absolute deadline covering **all hops together**, a body cap applied *while receiving*
 * (REVIEW F4's finding: a server writing one byte every 50ms is never inactive), markup reduced
 * to inert text rather than retained as something that could be rendered, and a `sha256` over the
 * captured text so §3.8.4 can notice a package edited after capture.
 *
 * Everything fails closed. There is no path through this module that returns a partial capture, a
 * capture from an unjudged address, or a package without a digest.
 */

import { createHash } from 'node:crypto';
import dns from 'node:dns';
import https from 'node:https';
import { clearTimeout, setTimeout } from 'node:timers';

import { addressAllowed, urlAllowed } from './address-policy.mjs';

/** How much captured text is ever kept. A source document, not a diagnostic. */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

/** How many hops before a redirect chain is a loop by another name. */
export const MAX_REDIRECTS = 5;

/** The default ceiling for a whole acquisition, every hop included. */
export const DEFAULT_DEADLINE_MS = 20_000;

/** The handful of entities that appear in ordinary prose. Anything else becomes a space. */
/** @type {Record<string, string>} */
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };

/**
 * Reduce markup to the text a reader would see.
 *
 * **Inert by construction, not by sanitizing.** Nothing here tries to make markup safe to render;
 * it throws the markup away and keeps text. Script and style elements are removed *with their
 * contents* first — stripping only the tags would leave the script body sitting in the captured
 * text as though it were prose, and a citation could then "resolve" against a line of JavaScript.
 *
 * @param {string} body
 * @returns {string}
 */
export function inertText(body) {
  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    // An unclosed script element would otherwise survive the pass above and keep its body.
    .replace(/<(script|style|template|noscript)\b[\s\S]*$/i, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a hostname and return only addresses this policy permits.
 *
 * Every resolved address is judged, not just the first. A name answering with one public address
 * and one loopback address is a rebinding attempt with the work already done, and picking whichever
 * came first would make the outcome a coin flip.
 *
 * @param {string} hostname
 * @param {typeof dns.promises.lookup} [lookup] injected so tests can drive resolution without a
 *   network or a hosts file, which is the only way the rebinding case is reachable at all
 * @returns {Promise<{ ok: true, addresses: { address: string, family: number }[] } | { ok: false, reason: string }>}
 */
export async function resolvePermitted(hostname, lookup = dns.promises.lookup) {
  /** @type {{ address: string, family: number }[]} */
  let resolved;
  try {
    const answer = await lookup(hostname, { all: true });
    resolved = Array.isArray(answer) ? answer : [answer];
  } catch (error) {
    return { ok: false, reason: `${hostname} did not resolve: ${error instanceof Error ? error.message : error}` };
  }
  if (resolved.length === 0) return { ok: false, reason: `${hostname} resolved to no addresses` };

  for (const entry of resolved) {
    const verdict = addressAllowed(entry.address);
    if (!verdict.allowed) {
      // **One bad address condemns the name.** Filtering to the permitted subset and proceeding
      // would let a host publish one public address and one internal one and still be reachable —
      // and which address a later connection picks is not this module's decision to rely on.
      return { ok: false, reason: `${hostname} resolves to a refused address: ${verdict.reason}` };
    }
  }
  return { ok: true, addresses: resolved };
}

/**
 * @typedef {{ status: number, headers: Record<string, string | string[] | undefined>, body: string,
 *   truncated: boolean }} HopResponse
 */

/**
 * One HTTPS request to an already-judged address, with an absolute deadline.
 *
 * The deadline covers headers and body alike, and `aborted`, `error` and a premature `close` are
 * all failures rather than silence — REVIEW F4's finding, which was that a socket inactivity
 * timeout is not a deadline when the server keeps writing.
 *
 * @param {{ target: URL, addresses: { address: string, family: number }[], deadlineMs: number,
 *   budgetMs?: number, request?: typeof https.request }} options
 *   `deadlineMs` is what is left of the acquisition's budget and is what the timer runs on.
 *   `budgetMs` is what the **operator** set, and is what the message says — on hop four of a chain
 *   the remaining slice is a number nobody chose, and reporting it would read as a ceiling that was
 *   never configured.
 * @returns {Promise<{ ok: true, response: HopResponse } | { ok: false, reason: string }>}
 */
export function fetchHop(options) {
  return new Promise((resolve) => {
    let settled = false;
    /** @type {import('node:http').ClientRequest | null} */
    let request = null;
    /** @param {{ ok: true, response: HopResponse } | { ok: false, reason: string }} result */
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request?.destroy();
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        settle({
          ok: false,
          reason: `acquiring ${options.target.href} exceeded ${options.budgetMs ?? options.deadlineMs}ms`,
        }),
      options.deadlineMs,
    );

    try {
      const send = options.request ?? https.request;
      request = send(
        {
          protocol: options.target.protocol,
          hostname: options.target.hostname.replace(/^\[|\]$/g, ''),
          port: 443,
          path: `${options.target.pathname}${options.target.search}`,
          method: 'GET',
          // **The judged addresses, handed to the socket.** This is what closes the rebinding
          // window: there is no second resolution that could return something else.
          lookup: (/** @type {string} */ _host, /** @type {any} */ opts, /** @type {any} */ callback) => {
            const chosen = options.addresses[0];
            if (opts?.all === true) callback(null, options.addresses);
            else callback(null, chosen.address, chosen.family);
          },
          headers: {
            // Nothing of the operator's. No cookie jar, no Authorization, no proxy credentials.
            accept: 'text/html, text/plain, application/xhtml+xml',
            'user-agent': 'meeseeks-source-acquisition',
          },
        },
        (response) => {
          /** @type {Buffer[]} */
          const chunks = [];
          let bytes = 0;
          let truncated = false;
          response.on('data', (chunk) => {
            const buffer = Buffer.from(chunk);
            if (bytes >= MAX_SOURCE_BYTES) {
              truncated = true;
              return;
            }
            chunks.push(buffer.subarray(0, MAX_SOURCE_BYTES - bytes));
            if (bytes + buffer.length > MAX_SOURCE_BYTES) truncated = true;
            bytes += buffer.length;
          });
          response.on('end', () =>
            settle({
              ok: true,
              response: {
                status: response.statusCode ?? 0,
                headers: response.headers,
                body: Buffer.concat(chunks).toString('utf8'),
                truncated,
              },
            }),
          );
          response.on('aborted', () => settle({ ok: false, reason: `${options.target.href} was aborted before it ended` }));
          response.on('error', (error) => settle({ ok: false, reason: error.message }));
          response.on('close', () => settle({ ok: false, reason: `${options.target.href} closed before it ended` }));
        },
      );
    } catch (error) {
      settle({ ok: false, reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    request.on('error', (error) => settle({ ok: false, reason: error.message }));
    request.end();
  });
}

/**
 * @typedef {{ ok: true, source: { id: string, origin: string, retrievedAt: string, digest: string,
 *   text: string, chain: string[], truncated: boolean } }
 *   | { ok: false, reason: string }} AcquireResult
 */

/**
 * Acquire one source, following redirects with every hop re-judged.
 *
 * @param {{ id: string, url: string, now: string, deadlineMs?: number,
 *   lookup?: typeof dns.promises.lookup, request?: typeof https.request }} options
 *   `now` is supplied rather than read, so a capture's recorded retrieval time comes from the run's
 *   clock and a test can assert on it.
 * @returns {Promise<AcquireResult>}
 */
export async function acquireSource(options) {
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  // **Absolute, and shared across every hop.** A per-hop deadline multiplies by the redirect limit,
  // so a chain of five slow hops would take five times the ceiling the operator set.
  const expiresAt = Date.now() + deadlineMs;

  /** @type {string[]} */
  const chain = [];
  let current = options.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return { ok: false, reason: `acquiring ${options.url} exceeded ${deadlineMs}ms` };

    // The whole policy, on every hop. Not the first one only, which is the bypass this exists for.
    const permitted = urlAllowed(current);
    if (!permitted.ok) return { ok: false, reason: `hop ${hop + 1}: ${permitted.reason}` };
    const resolution = await resolvePermitted(permitted.target.hostname.replace(/^\[|\]$/g, ''), options.lookup);
    if (!resolution.ok) return { ok: false, reason: `hop ${hop + 1}: ${resolution.reason}` };

    chain.push(permitted.target.href);
    const hopResult = await fetchHop({
      target: permitted.target,
      addresses: resolution.addresses,
      deadlineMs: Math.max(1, expiresAt - Date.now()),
      budgetMs: deadlineMs,
      request: options.request,
    });
    if (!hopResult.ok) return { ok: false, reason: `hop ${hop + 1}: ${hopResult.reason}` };

    const { status, headers, body, truncated } = hopResult.response;
    if (status >= 300 && status < 400) {
      const location = headers.location;
      if (typeof location !== 'string' || location.trim() === '') {
        return { ok: false, reason: `hop ${hop + 1}: ${status} with no usable Location header` };
      }
      // Resolved against the current URL so a relative redirect is handled, and then judged from
      // scratch on the next pass rather than trusted for being a continuation.
      try {
        current = new URL(location, permitted.target).href;
      } catch {
        return { ok: false, reason: `hop ${hop + 1}: ${status} to an unparseable Location` };
      }
      continue;
    }

    if (status < 200 || status >= 300) {
      return { ok: false, reason: `hop ${hop + 1}: the source answered ${status}` };
    }
    // A truncated body is a **failure**, not a short capture. A citation resolving against the
    // first two megabytes of a document while the quotation sits at the end would be a false pass,
    // and there is no way to tell that case from a complete capture after the fact.
    if (truncated) {
      return { ok: false, reason: `${options.url} is larger than the ${MAX_SOURCE_BYTES}-byte capture limit` };
    }

    const text = inertText(body);
    if (text === '') return { ok: false, reason: `${options.url} carried no text to capture` };
    return {
      ok: true,
      source: {
        id: options.id,
        origin: chain[chain.length - 1],
        retrievedAt: options.now,
        digest: `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`,
        text,
        chain,
        truncated: false,
      },
    };
  }

  return { ok: false, reason: `${options.url} redirected more than ${MAX_REDIRECTS} times` };
}
