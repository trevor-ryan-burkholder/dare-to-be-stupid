#!/usr/bin/env node
/**
 * The health gate, as a behaviour rather than a grep (DESIGN.md §4 line 4).
 *
 * DoD line 4 says a health endpoint *responds*. Searching the source for the string
 * `/health` establishes that somebody typed it, which is a different claim: a route
 * registered after the 404 handler, a handler that throws, a server that cannot boot at all
 * — every one of those passes a text search and fails a request.
 *
 * So this starts the application, asks it, and kills it.
 *
 * It is a separate program rather than a function because the driver's gates are
 * synchronous exit codes, and starting a server, polling it and reaping it is not. Run it
 * with `execFileSync` and read the exit code like any other gate: 0 is a healthy response,
 * anything else is a failure with the reason on stdout.
 *
 * The application is always killed, including when this program itself fails. A gate that
 * leaks a listening server poisons every later iteration with a port conflict, and the
 * symptom of that looks nothing like its cause.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

/** How long to wait for the application to start answering, in milliseconds. */
const DEFAULT_TIMEOUT = 30_000;

/** How often to re-ask while waiting. */
const POLL_INTERVAL = 250;

/** How long the application gets to exit politely before it is killed outright. */
const KILL_GRACE = 2_000;

/**
 * @param {string[]} argv
 * @returns {{ command: string, path: string, timeout: number, port: number }}
 */
export function parseProbeArgs(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
    flags[key] = value;
  }
  const timeout = Number(flags.timeout);
  const port = Number(flags.port);
  return {
    command: flags.command ?? '',
    path: flags.path ?? '/health',
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT,
    port: Number.isInteger(port) && port > 0 ? port : 0,
  };
}

/**
 * Ask the operating system for a port nobody is using.
 *
 * @returns {Promise<number>}
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => (port === 0 ? reject(new Error('could not obtain a port')) : resolve(port)));
    });
  });
}

/**
 * How much of a response body is ever kept, and the cap is applied *while receiving* (REVIEW F4).
 *
 * The body is a diagnostic — it goes into a failure message — so 500 characters is all anyone reads.
 * Accumulating megabytes and slicing afterwards means a server that streams forever also fills
 * memory forever, which is a second failure hiding behind the first.
 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * One HTTP attempt with an absolute wall-clock deadline (REVIEW F4).
 *
 * **The old deadline was not a deadline.** Both request helpers resolved a successful response only
 * on `end`, and the only bound was Node's socket *inactivity* timeout — so a server that kept
 * writing a byte every 50 ms was never inactive, the request promise never settled, and the outer
 * probe loop never got to look at its own clock. Measured: a health endpoint that sent `200` and
 * then wrote forever was not bounded by the configured probe deadline at all; when the fixture was
 * killed, Node reported an unsettled top-level await instead of a probe result. The next bound
 * outwards is `gateTimeoutMs` — **45 minutes** — and with no outer ceiling, none.
 *
 * So the timer here is absolute and covers the whole attempt, headers and body alike, and
 * `aborted`, `error` and a premature `close` are ordinary failed attempts rather than silence. A
 * request that is destroyed settles; that is the entire point.
 *
 * @param {{
 *   get: () => import('node:http').ClientRequest,
 *   deadlineMs: number,
 *   describe: string,
 * }} options
 * @returns {Promise<{ ok: boolean, status: number, body: string, error: string }>}
 */
function attempt(options) {
  return new Promise((resolve) => {
    let settled = false;
    /** @type {import('node:http').ClientRequest | null} */
    let request = null;
    /** @param {{ ok: boolean, status: number, body: string, error: string }} result */
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Destroyed on every path out, including the successful one: a response that ended still
      // leaves a socket this probe has no further use for.
      request?.destroy();
      resolve(result);
    };
    const timer = setTimeout(
      () => settle({ ok: false, status: 0, body: '', error: `${options.describe} exceeded ${options.deadlineMs}ms` }),
      options.deadlineMs,
    );
    try {
      request = options.get();
    } catch (error) {
      settle({ ok: false, status: 0, body: '', error: String(error) });
      return;
    }
    request.on('response', (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        // Capped as it arrives. Past the cap the bytes are dropped rather than buffered, and the
        // response is still read to completion so an ordinary short body is unaffected.
        if (bytes >= MAX_BODY_BYTES) return;
        const buffer = Buffer.from(chunk);
        chunks.push(buffer.subarray(0, MAX_BODY_BYTES - bytes));
        bytes += buffer.length;
      });
      response.on('end', () =>
        settle({
          ok: true,
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8').slice(0, 500),
          error: '',
        }),
      );
      // A response that stops without ending has not answered. Reporting it as a failed attempt is
      // what lets the poll loop try again or give up on its own clock.
      response.on('aborted', () =>
        settle({ ok: false, status: 0, body: '', error: `${options.describe} was aborted before it ended` }),
      );
      response.on('error', (error) => settle({ ok: false, status: 0, body: '', error: error.message }));
      response.on('close', () => {
        settle({ ok: false, status: 0, body: '', error: `${options.describe} closed before it ended` });
      });
    });
    request.on('timeout', () => settle({ ok: false, status: 0, body: '', error: 'request timed out' }));
    request.on('error', (error) => settle({ ok: false, status: 0, body: '', error: error.message }));
  });
}

/**
 * One local request. Resolves with the outcome and never rejects, because a refused connection is
 * the expected answer while a server is still starting.
 *
 * @param {{ port: number, path: string, deadlineMs?: number }} options
 * @returns {Promise<{ ok: boolean, status: number, body: string, error: string }>}
 */
function requestOnce(options) {
  const deadlineMs = typeof options.deadlineMs === 'number' && options.deadlineMs > 0 ? options.deadlineMs : 2_000;
  return attempt({
    get: () => http.get({ host: '127.0.0.1', port: options.port, path: options.path, timeout: deadlineMs }),
    deadlineMs,
    describe: `${options.path} on port ${options.port}`,
  });
}

/**
 * What counts as healthy.
 *
 * Deliberately minimal, and deliberately not nothing. A 2xx is required, because a health
 * endpoint answering 500 is still answering. A non-empty body is required, because an empty
 * 200 is what a catch-all route returns. And a body that says in so many words that it is
 * unhealthy fails whatever its status code — an endpoint reporting its own distress should
 * not pass the gate that exists to notice distress.
 *
 * @param {{ status: number, body: string }} response
 * @returns {{ ok: boolean, detail: string }}
 */
export function judgeHealthResponse(response) {
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, detail: `health endpoint answered ${response.status}` };
  }
  if (response.body.trim() === '') {
    return { ok: false, detail: 'health endpoint answered 2xx with an empty body' };
  }
  try {
    const parsed = JSON.parse(response.body);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = /** @type {Record<string, unknown>} */ (parsed);
      const declared = [record.status, record.state, record.health].find((value) => typeof value === 'string');
      if (typeof declared === 'string' && /^(down|error|unhealthy|fail(ed|ing)?)$/i.test(declared.trim())) {
        return { ok: false, detail: `health endpoint reported itself as ${JSON.stringify(declared)}` };
      }
      if (record.ok === false || record.healthy === false) {
        return { ok: false, detail: 'health endpoint reported itself as not healthy' };
      }
    }
  } catch {
    // A non-JSON body is fine. `OK` is a perfectly good health response.
  }
  return { ok: true, detail: `health endpoint answered ${response.status}` };
}

/**
 * The port the application's own output announces, or null when it announces none.
 *
 * The match is deliberately narrow — an explicit `host:port` in the output — because acting on
 * a wrong port is worse than acting on none. Shared by the poll loop (which probes this port
 * when it disagrees with the assigned one) and {@link portContractHint} (which explains the
 * disagreement on failure): two copies of this regex would drift.
 *
 * @param {string} output everything the application printed
 * @returns {number | null}
 */
export function detectBoundPort(output) {
  const bound = output.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/);
  if (bound === null) return null;
  const port = Number(bound[1]);
  return Number.isInteger(port) && port > 0 ? port : null;
}

/**
 * Is something already answering on this port?
 *
 * **The half of ownership a probe can actually establish** (REVIEW F3). Nothing portable ties a
 * listening socket to a process tree — `lsof` and `ss` are optional binaries with different flags
 * on every platform, and a gate that cannot run is a failure rather than a skip, so making the
 * health gate depend on one would trade a false pass for an unrunnable gate. What *is* portable is
 * asking, before the application starts, whether the port it is about to be given is already
 * occupied. If it is, no later response on that port can be attributed to the application, and the
 * probe refuses rather than measuring somebody else's server.
 *
 * A connection that is refused, or that never completes, means nothing is listening. Anything else
 * — including a socket that accepts and says nothing — counts as occupied, because the question is
 * whether the port is free, not whether whatever holds it is well.
 *
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export function portIsOccupied(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    let settled = false;
    /** @param {boolean} answer */
    const done = (answer) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * When the application's own output names a different port than the probe polled, say the
 * contract out loud.
 *
 * The Tallyho smoke (DOGFOOD.md, 15 Aug) is why: the probe has always started the app with
 * `PORT` set to a free port and polled that port, but nothing ever *told the builder*, so it
 * hardcoded `next start -p 3210`, the app bound 3210 while the probe polled its own choice, and
 * the failure said only "did not answer" — naming the symptom while the contract stayed
 * invisible. The builder then spent two iterations guessing (it invented a `fuser -k` prestart
 * before the run's budget died). A failure message that teaches the fix is the difference
 * between one repair iteration and a stall.
 *
 * With the poll loop now probing the announced port directly, this hint survives for the
 * remaining failure shape: the app announced a port and STILL did not answer on it (crashed
 * after binding, or bound a port someone else holds).
 *
 * @param {string} output everything the application printed
 * @param {number} probedPort the port the probe set as PORT
 * @returns {string} a sentence ending in a space, or the empty string
 */
export function portContractHint(output, probedPort) {
  const boundPort = detectBoundPort(output);
  if (boundPort === null || boundPort === probedPort) return '';
  return (
    `The application bound port ${boundPort} while the probe set PORT=${probedPort} in its environment ` +
    'and polled that port: the start command must honor the PORT environment variable ' +
    '(for example `next start -p ${PORT:-3000}`). '
  );
}

// ---------------------------------------------------------------------------
// Remote smoke mode (DESIGN.md §10.1)
// ---------------------------------------------------------------------------

/**
 * Read `--url <base> --expect <path>=<status> ...`.
 *
 * Deliberately a second parser rather than a widened `parseProbeArgs`. That one builds a
 * flag record, so a repeated flag overwrites — three smoke checks would silently become one,
 * and a gate reporting a clean pass over less than it was asked to check is the failure mode
 * this whole file exists to avoid.
 *
 * @param {string[]} argv
 * @returns {{ url: string, checks: { path: string, status: number }[], timeout: number }}
 */
export function parseSmokeArgs(argv) {
  let url = '';
  let timeout = DEFAULT_TIMEOUT;
  /** @type {{ path: string, status: number }[]} */
  const checks = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') url = argv[i + 1] ?? '';
    else if (argv[i] === '--timeout') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) timeout = value;
    } else if (argv[i] === '--expect') {
      const raw = argv[i + 1] ?? '';
      const at = raw.lastIndexOf('=');
      const path_ = at === -1 ? '' : raw.slice(0, at);
      const status = Number(raw.slice(at + 1));
      // An unparseable expectation throws rather than being skipped. Skipping it would
      // reduce the checks silently, which reads exactly like a deploy that passed them.
      if (path_ === '' || !Number.isInteger(status) || status <= 0) {
        throw new Error(`--expect must be <path>=<status>, got ${JSON.stringify(raw)}`);
      }
      checks.push({ path: path_, status });
    }
  }
  if (url === '') throw new Error('--url is required: there is no host to ask');
  return { url, checks, timeout };
}

/**
 * Judge one smoke response against the status the operator asked for.
 *
 * The expected status is exact, because the contract being checked is the deployed
 * application's own — a `404` that was asked for is a pass, and "everything must be 200"
 * would make it impossible to smoke-test an error path.
 *
 * A 2xx additionally goes through `judgeHealthResponse`, so an empty body or an endpoint
 * reporting its own distress fails even when the number is right. Below 2xx and above 3xx
 * those rules do not apply: an empty 404 is ordinary.
 *
 * @param {{ status: number, body: string }} response
 * @param {number} expected
 * @returns {{ ok: boolean, detail: string }}
 */
export function judgeSmokeResponse(response, expected) {
  if (response.status !== expected) {
    return { ok: false, detail: `expected ${expected}, answered ${response.status}` };
  }
  if (expected >= 200 && expected < 300) return judgeHealthResponse(response);
  return { ok: true, detail: `answered ${response.status} as expected` };
}

/**
 * One request against an absolute URL, over http or https.
 *
 * @param {string} base
 * @param {string} path_
 * @param {number} timeout
 * @returns {Promise<{ ok: boolean, status: number, body: string, error: string }>}
 */
function requestUrl(base, path_, timeout) {
  /** @type {URL} */
  let target;
  try {
    target = new URL(path_, base);
  } catch (error) {
    return Promise.resolve({ ok: false, status: 0, body: '', error: `bad url: ${String(error)}` });
  }
  const client = target.protocol === 'https:' ? https : http;
  // The remote smoke check gets the same absolute deadline as the local one. A host that streams
  // forever is a host that streams forever whichever side of the network it is on.
  return attempt({ get: () => client.get(target, { timeout }), deadlineMs: timeout, describe: `${path_}` });
}

/**
 * Run every smoke check against a deployed host.
 *
 * **A transport failure is retried; a response never is.** A refused connection while a
 * service restarts is expected and worth waiting through. A wrong status is a real answer,
 * and re-asking until it becomes the right one is how a check that should fail passes.
 *
 * @param {{ url: string, checks: { path: string, status: number }[], timeout: number }} options
 * @param {{ now?: () => number, request?: typeof requestUrl }} [effects]
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function runSmoke(options, effects = {}) {
  if (options.checks.length === 0) return { ok: false, detail: 'no smoke checks were given, so nothing was verified' };
  const now = effects.now ?? Date.now;
  const request = effects.request ?? requestUrl;
  const deadline = now() + options.timeout;
  /** @type {string[]} */
  const failures = [];
  for (const check of options.checks) {
    let response = await request(options.url, check.path, 2_000);
    while (!response.ok && now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      response = await request(options.url, check.path, 2_000);
    }
    if (!response.ok) {
      failures.push(`${check.path}: ${response.error}`);
      continue;
    }
    const verdict = judgeSmokeResponse(response, check.status);
    if (!verdict.ok) failures.push(`${check.path}: ${verdict.detail}`);
  }
  if (failures.length > 0) {
    return { ok: false, detail: `${failures.length} of ${options.checks.length} smoke check(s) failed - ${failures.join('; ')}` };
  }
  return { ok: true, detail: `${options.checks.length} smoke check(s) passed against ${options.url}` };
}

/**
 * Signal the whole process group, not just the process we hold.
 *
 * `shell: true` means the child is a shell and the application is its child. Killing the
 * shell leaves the application running: still listening, still holding the stdout pipe we
 * are reading. That orphan outlives the gate, holds the port against every later
 * iteration, and — because the pipe never closes — can keep the calling process alive
 * indefinitely. Observed exactly once, as a test run that hung for five minutes.
 *
 * The child is spawned detached so it leads its own group; a negative pid signals that
 * group. Windows has no process groups, so it falls back to the direct kill.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {NodeJS.Signals} signal
 * @returns {void}
 */
function killTree(child, signal) {
  if (typeof child.pid === 'number' && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The group is already gone, or was never created. Fall through.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // Already gone.
  }
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<void>}
 */
function stop(child) {
  return new Promise((resolve) => {
    /** Drop the pipes as well: a surviving grandchild holds them open otherwise. */
    const done = () => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve();
    };

    if (child.exitCode !== null || child.signalCode !== null) {
      done();
      return;
    }
    const forced = setTimeout(() => {
      killTree(child, 'SIGKILL');
      done();
    }, KILL_GRACE);
    child.once('exit', () => {
      clearTimeout(forced);
      // The shell has gone; the application it started may not have. Take the group too.
      killTree(child, 'SIGKILL');
      done();
    });
    killTree(child, 'SIGTERM');
  });
}

/**
 * Start the application, ask whether it is well, and stop it.
 *
 * @param {{ command: string, path: string, timeout: number, port?: number, cwd: string }} options
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function probeHealth(options) {
  if (options.command.trim() === '') {
    return { ok: false, detail: 'no start command was given, so nothing could be probed' };
  }
  const port = options.port !== undefined && options.port > 0 ? options.port : await freePort();

  // **Before anything starts** (REVIEW F3). A stale development server, a leaked grandchild from a
  // previous iteration or an unrelated service already holding this port would answer every later
  // request, and a child that then exited or failed to bind would sail through a required ship
  // gate on somebody else's health endpoint. Asked here rather than inferred later, because after
  // the application starts the two are indistinguishable from the outside.
  if (await portIsOccupied(port)) {
    return {
      ok: false,
      detail:
        `port ${port} was already answering before the start command ran, so nothing answering there ` +
        'afterwards could be attributed to the application under test. Stop whatever is holding it ' +
        '(a leaked development server from an earlier run is the usual cause) and try again.',
    };
  }

  const child = spawn(options.command, {
    cwd: options.cwd,
    shell: true,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so `stop` can take the application down with the shell that
    // started it. Without this the shell dies and the server it launched does not.
    detached: process.platform !== 'win32',
  });

  /** @type {string[]} */
  const output = [];
  child.stdout?.on('data', (chunk) => output.push(String(chunk)));
  child.stderr?.on('data', (chunk) => output.push(String(chunk)));

  /** @type {number | null} */
  let exited = null;
  child.once('exit', (code) => {
    exited = code ?? 0;
  });
  // A command that cannot be spawned at all is a failed gate, not an unhandled event.
  child.once('error', () => {
    exited = -1;
  });

  try {
    const deadline = Date.now() + options.timeout;
    /** @type {{ ok: boolean, status: number, body: string, error: string }} */
    let last = { ok: false, status: 0, body: '', error: 'never attempted' };

    while (Date.now() < deadline) {
      if (exited !== null) {
        return {
          ok: false,
          detail:
            `the start command exited with code ${exited} before answering ${options.path}. ` +
            `Output: ${output.join('').trim().slice(-500) || '(none)'}`,
        };
      }
      // **The assigned port, and only the assigned port** (REVIEW F3). Between 0.113.0 and this
      // version the probe followed the port the application's own *output* announced, to settle
      // the Tallyho smoke's fourth machine finding: the probe demanded "honor ephemeral PORT"
      // while a Playwright `webServer` config wanted a fixed URL, and builders oscillated the
      // start script between `-p ${PORT:-3210}` and `-p 3210` across six iterations.
      //
      // That fix promoted a hint to evidence, and the reproduction is unambiguous: a decoy HTTP
      // server was started locally, and a probe child that opened no socket at all — it only
      // printed the decoy's URL and stayed alive — was reported healthy. Printed output
      // establishes no ownership of a listener, and this is a required ship gate.
      //
      // The two masters are reconciled the other way now: `--port` lets the *driver or operator*
      // name a fixed port, which is a contract neither the application nor its stdout can forge,
      // and `portContractHint` below still teaches an app that ignored `PORT` exactly what to fix.
      // Bounded by the attempt's own ceiling *and* by what is left of the probe's, so a server
      // that streams forever cannot spend more than the deadline the operator configured
      // (REVIEW F4).
      last = await requestOnce({
        port,
        path: options.path,
        deadlineMs: Math.max(1, Math.min(2_000, deadline - Date.now())),
      });
      if (last.ok) {
        // Re-checked after the response, not only before the request. A start command that died
        // while the request was in flight cannot be the thing that answered it, and accepting the
        // response would let a startup failure race a listener into a pass.
        if (exited !== null) {
          return {
            ok: false,
            detail:
              `${options.path} answered on port ${port}, but the start command had already exited with code ` +
              `${exited}, so the response was not its own. Output: ${output.join('').trim().slice(-500) || '(none)'}`,
          };
        }
        return judgeHealthResponse(last);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    return {
      ok: false,
      detail:
        `${options.path} did not answer on port ${port} within ${options.timeout}ms (last error: ${last.error}). ` +
        portContractHint(output.join(''), port) +
        `Output: ${output.join('').trim().slice(-500) || '(none)'}`,
    };
  } finally {
    await stop(child);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  /** @type {{ ok: boolean, detail: string }} */
  let outcome;
  // Two modes, one program, dispatched on `--url`. Local mode starts the application and
  // asks it; remote mode asks a host somebody else started. They share the judging and
  // nothing else — remote allocates no port, spawns nothing, and reaps nothing.
  if (argv.includes('--url')) {
    try {
      outcome = await runSmoke(parseSmokeArgs(argv));
    } catch (error) {
      outcome = { ok: false, detail: `smoke check failed: ${/** @type {Error} */ (error).message}` };
    }
    process.stdout.write(`${outcome.detail}\n`);
    process.exitCode = outcome.ok ? 0 : 1;
    return;
  }
  const options = parseProbeArgs(argv);
  try {
    outcome = await probeHealth({ ...options, cwd: process.cwd() });
  } catch (error) {
    // An exception here is a failed gate, not a crash to be interpreted later.
    outcome = { ok: false, detail: `health probe failed: ${/** @type {Error} */ (error).message}` };
  }
  process.stdout.write(`${outcome.detail}\n`);
  process.exitCode = outcome.ok ? 0 : 1;
}

const invokedDirectly = typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
