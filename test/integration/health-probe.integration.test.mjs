/**
 * Tier 2 — the health probe against a real `npm start` (DESIGN.md §4 line 4, §11.1).
 *
 * The unit tests point `probeHealth` at hand-written servers started directly with `node`.
 * That leaves untested the part the driver actually does: spawning a **shell** command that
 * runs **npm**, which runs a script, which starts a server — and then taking that whole tree
 * down again. Three processes, a shell, and a process group.
 *
 * HANDOFF.md listed this as outstanding and named the failure mode to watch for: an
 * application that ignores `PORT`. There is a test for exactly that below, because the probe
 * choosing a free port is worthless if the application binds its own anyway.
 *
 * No network beyond loopback, no API, no money. Just node and npm.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { startCommand } from '../../scripts/driver.mjs';
import { probeHealth, runSmoke } from '../../scripts/health-probe.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A minimal application that declares `npm start`, exactly as a generated one would.
 *
 * @param {{ server: string, start?: string }} parts
 * @returns {string}
 */
function makeApp(parts) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-health-integration-'));
  temporaryDirs.push(dir);
  const manifest = { name: 'probe-target', private: true, scripts: { start: parts.start ?? 'node server.js' } };
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(dir, 'server.js'), parts.server, 'utf8');
  return dir;
}

/** A server that does what a generated application is supposed to do. */
const HEALTHY = `
const http = require('node:http');
const port = Number(process.env.PORT);
http
  .createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(port, '127.0.0.1');
`;

const TIMEOUT = 20_000;

describe('the health probe against a real npm start', () => {
  it('finds the start command the way the driver does, then uses it', async () => {
    const app = makeApp({ server: HEALTHY });
    // Not hard-coded: this is the same lookup the observability gate performs, through the
    // toolchain, against a real manifest.
    assert.equal(startCommand(app), 'npm start');

    const result = await probeHealth({ command: 'npm start', path: '/health', timeout: TIMEOUT, cwd: app });
    assert.equal(result.ok, true, result.detail);
  });

  it('fails when the application ignores PORT, rather than hanging or passing', async () => {
    // The failure mode HANDOFF.md named. The probe picks a free port and passes it in the
    // environment; an application that binds its own is unreachable, and the gate must say so
    // instead of timing out into ambiguity.
    const app = makeApp({ server: HEALTHY.replace('Number(process.env.PORT)', '0') });
    const result = await probeHealth({ command: 'npm start', path: '/health', timeout: 6_000, cwd: app });
    assert.equal(result.ok, false);
    assert.equal(result.detail.length > 0, true, 'a failed probe must say what happened');
  });

  it('fails when the start script exits immediately, and reports its output', async () => {
    const app = makeApp({ server: 'console.error("boom: cannot start");\nprocess.exit(1);\n' });
    const result = await probeHealth({ command: 'npm start', path: '/health', timeout: TIMEOUT, cwd: app });
    assert.equal(result.ok, false);
    // The operator needs the application's own words, not just an exit code.
    assert.equal(result.detail.includes('boom'), true, `lost the child's output: ${result.detail}`);
  });

  it('fails a server that answers everything with 404, including /health', async () => {
    // The reason this gate asks rather than greps: a route registered after the 404 handler
    // is invisible to a source scan and obvious to a request.
    const app = makeApp({ server: HEALTHY.replace("req.url === '/health'", 'false') });
    const result = await probeHealth({ command: 'npm start', path: '/health', timeout: TIMEOUT, cwd: app });
    assert.equal(result.ok, false);
  });

  it('leaves nothing listening once it is done', async () => {
    // Three processes and a shell. If the group teardown is wrong the port stays held, and
    // the next iteration's probe fails for a reason that has nothing to do with the code.
    const app = makeApp({ server: HEALTHY });
    const first = await probeHealth({ command: 'npm start', path: '/health', timeout: TIMEOUT, cwd: app });
    assert.equal(first.ok, true, first.detail);
    const second = await probeHealth({ command: 'npm start', path: '/health', timeout: TIMEOUT, cwd: app });
    assert.equal(second.ok, true, `a second probe failed, so the first left something behind: ${second.detail}`);
  });
});

// ---------------------------------------------------------------------------
// Remote smoke mode against a real listening server (0.62.0, DESIGN.md §10.1)
// ---------------------------------------------------------------------------

describe('runSmoke against a real server', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let base;

  before(async () => {
    server = http.createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"status":"ok"}');
      } else if (request.url === '/sick') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"status":"down"}');
      } else if (request.url === '/empty') {
        response.writeHead(200);
        response.end('');
      } else {
        response.writeHead(404);
        response.end('');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
  });

  after(() => new Promise((resolve) => server.close(() => resolve(undefined))));

  it('passes when every expectation is met', async () => {
    const outcome = await runSmoke({ url: base, checks: [{ path: '/health', status: 200 }, { path: '/nope', status: 404 }], timeout: 3_000 });
    assert.equal(outcome.ok, true, outcome.detail);
    assert.match(outcome.detail, /2 smoke check\(s\) passed/);
  });

  it('fails on a wrong status and names both numbers', async () => {
    const outcome = await runSmoke({ url: base, checks: [{ path: '/nope', status: 200 }], timeout: 3_000 });
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /expected 200, answered 404/);
  });

  it('fails a 200 that reports its own distress', async () => {
    // The reason this reuses judgeHealthResponse rather than only comparing numbers.
    const outcome = await runSmoke({ url: base, checks: [{ path: '/sick', status: 200 }], timeout: 3_000 });
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /down/);
  });

  it('fails an empty 200, which is what a catch-all route returns', async () => {
    const outcome = await runSmoke({ url: base, checks: [{ path: '/empty', status: 200 }], timeout: 3_000 });
    assert.equal(outcome.ok, false);
  });

  it('fails, rather than hanging forever, when nothing is listening', async () => {
    const outcome = await runSmoke({ url: 'http://127.0.0.1:1', checks: [{ path: '/health', status: 200 }], timeout: 700 });
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /health/);
  });

  it('refuses to report success when it was given nothing to check', async () => {
    // A deploy verified by an empty list is the stub again, reporting a pass over nothing.
    const outcome = await runSmoke({ url: base, checks: [], timeout: 1_000 });
    assert.equal(outcome.ok, false);
  });
});
