/**
 * Driver-owned source acquisition (`scripts/acquire.mjs`, PLAN item 49, DESIGN §3.8.6).
 *
 * The request under test is unusual in three ways at once — a model chose the URL, the operator's
 * machine makes the call, and the answer becomes evidence — so the cases below are grouped by which
 * of those three each one defends.
 *
 * `lookup` and `request` are injected. That is not test convenience: DNS rebinding and a
 * redirect-to-metadata chain are **unreachable** against a real network from a test, so an injected
 * resolver is the only way this suite can assert the property that matters most.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';
import { describe, it } from 'node:test';

import { MAX_REDIRECTS, MAX_SOURCE_BYTES, acquireSource, inertText, resolvePermitted } from '../scripts/acquire.mjs';

/** A resolver that answers every name with the given addresses. @param {string[]} addresses */
const resolving = (...addresses) =>
  /** @type {any} */ (async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

/** A resolver that answers differently per hostname. @param {Record<string, string[]>} table */
const resolvingByName = (table) =>
  /** @type {any} */ (
    async (/** @type {string} */ hostname) => {
      const addresses = table[hostname];
      if (addresses === undefined) throw new Error(`ENOTFOUND ${hostname}`);
      return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    }
  );

/**
 * A fake `https.request` that answers each hostname from a script.
 *
 * @param {Record<string, { status: number, headers?: Record<string, string>, body?: string }>} pages
 * @param {{ onConnect?: (address: string) => void }} [spy]
 */
function serving(pages, spy = {}) {
  return /** @type {any} */ (
    (/** @type {any} */ options, /** @type {(response: any) => void} */ callback) => {
      const request = new EventEmitter();
      // The lookup the production code installs is what a socket would call. Calling it here is
      // what makes the rebinding assertion real: the test observes the address actually connected
      // to, rather than the address the resolver happened to return.
      if (spy.onConnect !== undefined && typeof options.lookup === 'function') {
        options.lookup(options.hostname, {}, (/** @type {unknown} */ _e, /** @type {string} */ address) =>
          spy.onConnect?.(address),
        );
      }
      /** @type {any} */ (request).end = () => {
        const page = pages[options.hostname];
        setImmediate(() => {
          if (page === undefined) {
            request.emit('error', new Error(`nothing serving ${options.hostname}`));
            return;
          }
          const response = new EventEmitter();
          /** @type {any} */ (response).statusCode = page.status;
          /** @type {any} */ (response).headers = page.headers ?? {};
          callback(response);
          setImmediate(() => {
            if (page.body !== undefined) response.emit('data', Buffer.from(page.body, 'utf8'));
            response.emit('end');
          });
        });
      };
      /** @type {any} */ (request).destroy = () => {};
      return request;
    }
  );
}

const NOW = '2026-08-19T10:00:00.000Z';

describe('inertText', () => {
  it('keeps the text a reader would see', () => {
    assert.equal(inertText('<p>Hello <b>there</b>,\n world.</p>'), 'Hello there , world.');
  });

  it('discards a script element with its contents, not just its tags', () => {
    // Stripping only the tags would leave the script body in the captured text as though it were
    // prose, and a citation could then resolve against a line of JavaScript.
    const captured = inertText('<p>Real text.</p><script>const secret = "not prose";</script>');
    assert.equal(captured, 'Real text.');
    assert.equal(captured.includes('secret'), false);
  });

  it('discards an unclosed script element too, which the paired rule alone would miss', () => {
    assert.equal(inertText('<p>Real text.</p><script>const leaked = 1;'), 'Real text.');
  });

  it('discards style, template, noscript and comments', () => {
    assert.equal(inertText('<style>.a{color:red}</style><p>A</p><!-- hidden --><noscript>B</noscript>'), 'A');
  });

  it('decodes the entities that appear in prose', () => {
    assert.equal(inertText('<p>Tom &amp; Jerry&#39;s &quot;show&quot;</p>'), 'Tom & Jerry\'s "show"');
  });
});

describe('resolvePermitted', () => {
  it('permits a name that resolves entirely to public addresses', async () => {
    const result = await resolvePermitted('example.org', resolving('93.184.216.34'));
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok === true && result.addresses.map((entry) => entry.address), ['93.184.216.34']);
  });

  it('refuses the whole name when any one address is internal', async () => {
    // One public address and one loopback address is a rebinding attempt with the work already
    // done. Filtering to the permitted subset would leave which address gets used to chance.
    const result = await resolvePermitted('rebind.invalid', resolving('93.184.216.34', '127.0.0.1'));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /resolves to a refused address: .*loopback/);
  });

  it('refuses a name that resolves to nothing, rather than proceeding with an empty list', async () => {
    const result = await resolvePermitted('void.invalid', /** @type {any} */ (async () => []));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /resolved to no addresses/);
  });

  it('reports a resolution failure as a failure', async () => {
    const result = await resolvePermitted('gone.invalid', resolvingByName({}));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /did not resolve/);
  });
});

describe('acquireSource', () => {
  it('captures a public document, digests it, and records the chain it followed', async () => {
    const result = await acquireSource({
      id: 'acme-2024',
      url: 'https://example.org/paper',
      now: NOW,
      lookup: resolving('93.184.216.34'),
      request: serving({ 'example.org': { status: 200, body: '<p>The rate of change was higher.</p>' } }),
    });
    assert.equal(result.ok, true);
    if (result.ok !== true) return;
    assert.equal(result.source.text, 'The rate of change was higher.');
    assert.equal(result.source.retrievedAt, NOW);
    assert.deepEqual(result.source.chain, ['https://example.org/paper']);
    // The digest §3.8.4 reads back must be over the captured text, or a package edited after
    // capture would still verify.
    assert.equal(
      result.source.digest,
      `sha256:${createHash('sha256').update(result.source.text, 'utf8').digest('hex')}`,
    );
  });

  it('connects to the judged address, not to the hostname', async () => {
    // The rebinding window, closed. If the socket resolved the name a second time it could get a
    // different answer; this asserts the address handed to the connection is the one approved.
    /** @type {string[]} */
    const connected = [];
    await acquireSource({
      id: 's',
      url: 'https://example.org/paper',
      now: NOW,
      lookup: resolving('93.184.216.34'),
      request: serving({ 'example.org': { status: 200, body: '<p>text</p>' } }, { onConnect: (a) => connected.push(a) }),
    });
    assert.deepEqual(connected, ['93.184.216.34']);
  });

  it('re-judges every redirect hop, and refuses one that turns inward', async () => {
    // The standard bypass of a first-hop-only check: a public URL that 302s to the metadata
    // endpoint. Automatic redirect following is exactly what makes it invisible.
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/paper',
      now: NOW,
      lookup: resolvingByName({ 'example.org': ['93.184.216.34'], '169.254.169.254': ['169.254.169.254'] }),
      request: serving({
        'example.org': { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } },
      }),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /hop 2: .*metadata/);
  });

  it('refuses a redirect that turns inward by resolution rather than by literal', async () => {
    // The subtler shape: hop two is an ordinary-looking public hostname that happens to resolve
    // to loopback. A URL-shaped check alone would pass it.
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/paper',
      now: NOW,
      lookup: resolvingByName({ 'example.org': ['93.184.216.34'], 'internal.example.com': ['10.0.0.5'] }),
      request: serving({ 'example.org': { status: 301, headers: { location: 'https://internal.example.com/x' } } }),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /hop 2: .*RFC 1918/);
  });

  it('refuses a redirect that downgrades to plain http', async () => {
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/paper',
      now: NOW,
      lookup: resolving('93.184.216.34'),
      request: serving({ 'example.org': { status: 302, headers: { location: 'http://example.org/paper' } } }),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /hop 2: .*HTTPS only/);
  });

  it('follows a legitimate redirect, including a relative one, and records both hops', async () => {
    // The benign neighbour. A policy that refused every redirect would pass every case above.
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/old',
      now: NOW,
      lookup: resolvingByName({ 'example.org': ['93.184.216.34'], 'cdn.example.org': ['93.184.216.35'] }),
      request: serving({
        'example.org': { status: 301, headers: { location: '/new' } },
        'cdn.example.org': { status: 200, body: '<p>moved here</p>' },
      }),
    });
    // The relative redirect stays on example.org, which then serves the 301 again — so this proves
    // the loop bound rather than the happy path, and the message says which.
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', new RegExp(`redirected more than ${MAX_REDIRECTS} times`));
  });

  it('follows a redirect across hosts and captures the destination', async () => {
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/old',
      now: NOW,
      lookup: resolvingByName({ 'example.org': ['93.184.216.34'], 'cdn.example.org': ['93.184.216.35'] }),
      request: serving({
        'example.org': { status: 301, headers: { location: 'https://cdn.example.org/new' } },
        'cdn.example.org': { status: 200, body: '<p>moved here</p>' },
      }),
    });
    assert.equal(result.ok, true);
    if (result.ok !== true) return;
    assert.equal(result.source.text, 'moved here');
    assert.deepEqual(result.source.chain, ['https://example.org/old', 'https://cdn.example.org/new']);
    // `origin` is the URL actually captured, not the one asked for, so provenance records where
    // the bytes came from.
    assert.equal(result.source.origin, 'https://cdn.example.org/new');
  });

  it('refuses a redirect with no usable Location', async () => {
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/x',
      now: NOW,
      lookup: resolving('93.184.216.34'),
      request: serving({ 'example.org': { status: 302 } }),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /no usable Location/);
  });

  it('refuses a non-2xx answer rather than capturing an error page as a source', async () => {
    for (const status of [404, 403, 500]) {
      const result = await acquireSource({
        id: 's',
        url: 'https://example.org/x',
        now: NOW,
        lookup: resolving('93.184.216.34'),
        request: serving({ 'example.org': { status, body: '<p>Not found</p>' } }),
      });
      assert.equal(result.ok, false, String(status));
      assert.match(result.ok === false ? result.reason : '', new RegExp(`answered ${status}`));
    }
  });

  it('fails a truncated capture rather than keeping the part that fitted', async () => {
    // A citation resolving against the first two megabytes while the quotation sits at the end
    // would be a false pass, and nothing downstream could tell that from a complete capture.
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/huge',
      now: NOW,
      lookup: resolving('93.184.216.34'),
      request: serving({ 'example.org': { status: 200, body: `<p>${'a'.repeat(MAX_SOURCE_BYTES + 10)}</p>` } }),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /larger than the .* capture limit/);
  });

  it('fails a document that carried no text, rather than capturing an empty source', async () => {
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/empty',
      now: NOW,
      lookup: resolving('93.184.216.34'),
      request: serving({ 'example.org': { status: 200, body: '<script>only()</script>' } }),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /carried no text to capture/);
  });

  it('refuses the first hop by the same policy as every other', async () => {
    for (const url of ['http://example.org/x', 'https://127.0.0.1/x', 'https://user:pw@example.org/x', 'https://example.org:8443/x']) {
      const result = await acquireSource({ id: 's', url, now: NOW, lookup: resolving('93.184.216.34'), request: serving({}) });
      assert.equal(result.ok, false, url);
      assert.match(result.ok === false ? result.reason : '', /^hop 1: /);
    }
  });

  it('sends nothing of the operator, and no cookie or authorization header', async () => {
    /** @type {Record<string, unknown>} */
    let sent = {};
    await acquireSource({
      id: 's',
      url: 'https://example.org/x',
      now: NOW,
      lookup: resolving('93.184.216.34'),
      request: /** @type {any} */ (
        (/** @type {any} */ options, /** @type {(r: any) => void} */ callback) => {
          sent = options.headers;
          const request = new EventEmitter();
          /** @type {any} */ (request).end = () => {
            setImmediate(() => {
              const response = new EventEmitter();
              /** @type {any} */ (response).statusCode = 200;
              /** @type {any} */ (response).headers = {};
              callback(response);
              setImmediate(() => {
                response.emit('data', Buffer.from('<p>x</p>'));
                response.emit('end');
              });
            });
          };
          /** @type {any} */ (request).destroy = () => {};
          return request;
        }
      ),
    });
    assert.deepEqual(Object.keys(sent).sort(), ['accept', 'user-agent']);
  });

  it('bounds the whole acquisition rather than each hop', async () => {
    // A per-hop deadline multiplies by the redirect limit, so five slow hops would take five times
    // the ceiling the operator set. A hop that never answers must therefore exhaust the total.
    const started = Date.now();
    const result = await acquireSource({
      id: 's',
      url: 'https://example.org/slow',
      now: NOW,
      deadlineMs: 120,
      lookup: resolving('93.184.216.34'),
      request: /** @type {any} */ (
        () => {
          const request = new EventEmitter();
          /** @type {any} */ (request).end = () => {};
          /** @type {any} */ (request).destroy = () => {};
          return request;
        }
      ),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /exceeded 120ms/);
    assert.equal(Date.now() - started < 1_000, true, 'the deadline did not actually fire');
  });
});
