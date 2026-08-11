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
import { after, describe, it } from 'node:test';

import { startCommand } from '../../scripts/driver.mjs';
import { probeHealth } from '../../scripts/health-probe.mjs';

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
