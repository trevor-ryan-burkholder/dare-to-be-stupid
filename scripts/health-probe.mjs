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
 * One request. Resolves with the outcome and never rejects, because a refused connection is
 * the expected answer while a server is still starting.
 *
 * @param {{ port: number, path: string }} options
 * @returns {Promise<{ ok: boolean, status: number, body: string, error: string }>}
 */
function requestOnce(options) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port: options.port, path: options.path, timeout: 2_000 },
      (response) => {
        /** @type {Buffer[]} */
        const chunks = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () =>
          resolve({
            ok: true,
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8').slice(0, 500),
            error: '',
          }),
        );
      },
    );
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, status: 0, body: '', error: 'request timed out' });
    });
    request.on('error', (error) => resolve({ ok: false, status: 0, body: '', error: error.message }));
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
      last = await requestOnce({ port, path: options.path });
      if (last.ok) return judgeHealthResponse(last);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    return {
      ok: false,
      detail:
        `${options.path} did not answer on port ${port} within ${options.timeout}ms (last error: ${last.error}). ` +
        `Output: ${output.join('').trim().slice(-500) || '(none)'}`,
    };
  } finally {
    await stop(child);
  }
}

async function main() {
  const options = parseProbeArgs(process.argv.slice(2));
  /** @type {{ ok: boolean, detail: string }} */
  let outcome;
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
