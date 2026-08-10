/**
 * Tests for the health gate (DESIGN.md §4 line 4).
 *
 * DoD line 4 says a health endpoint *responds*. The check this replaced searched the source
 * for the string `/health`, which is satisfied by a route registered after the 404 handler,
 * by a handler that throws, and by a server that cannot boot. So the tests that matter are
 * the ones where the source would have passed and the request does not.
 *
 * The probe starts real processes, so one of these also proves it stops them.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { judgeHealthResponse, parseProbeArgs, probeHealth } from '../scripts/health-probe.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-health-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a one-file server and return the command that starts it.
 *
 * @param {string} handler the body of the request handler, given `request` and `response`
 * @returns {{ cwd: string, command: string }}
 */
function serverThat(handler) {
  const cwd = makeTempDir();
  writeFileSync(
    path.join(cwd, 'server.mjs'),
    [
      "import http from 'node:http';",
      'const server = http.createServer((request, response) => {',
      handler,
      '});',
      'server.listen(Number(process.env.PORT), "127.0.0.1");',
    ].join('\n'),
    'utf8',
  );
  return { cwd, command: 'node server.mjs' };
}

describe('judgeHealthResponse', () => {
  it('accepts a 2xx with a body', () => {
    assert.deepStrictEqual(judgeHealthResponse({ status: 200, body: 'OK' }), {
      ok: true,
      detail: 'health endpoint answered 200',
    });
  });

  it('rejects a non-2xx, because answering 500 is still answering', () => {
    assert.equal(judgeHealthResponse({ status: 500, body: 'boom' }).ok, false);
    assert.equal(judgeHealthResponse({ status: 404, body: 'nope' }).ok, false);
  });

  it('rejects an empty 200, which is what a catch-all route returns', () => {
    const verdict = judgeHealthResponse({ status: 200, body: '   ' });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.detail.includes('empty body'), true);
  });

  it('rejects a body that reports its own distress', () => {
    // An endpoint saying it is unhealthy should not pass the gate that exists to notice.
    assert.equal(judgeHealthResponse({ status: 200, body: JSON.stringify({ status: 'down' }) }).ok, false);
    assert.equal(judgeHealthResponse({ status: 200, body: JSON.stringify({ ok: false }) }).ok, false);
    assert.equal(judgeHealthResponse({ status: 200, body: JSON.stringify({ healthy: false }) }).ok, false);
  });

  it('accepts a body that reports itself well, in either shape', () => {
    assert.equal(judgeHealthResponse({ status: 200, body: JSON.stringify({ status: 'ok' }) }).ok, true);
    assert.equal(judgeHealthResponse({ status: 200, body: JSON.stringify({ ok: true }) }).ok, true);
    assert.equal(judgeHealthResponse({ status: 200, body: 'healthy' }).ok, true);
  });
});

describe('parseProbeArgs', () => {
  it('reads the flags it is given', () => {
    assert.deepStrictEqual(parseProbeArgs(['--command', 'npm start', '--path', '/healthz', '--timeout', '5000']), {
      command: 'npm start',
      path: '/healthz',
      timeout: 5000,
      port: 0,
    });
  });

  it('falls back to sane values rather than to nonsense', () => {
    const parsed = parseProbeArgs(['--command', 'npm start', '--timeout', 'soon']);
    assert.equal(parsed.path, '/health');
    assert.equal(parsed.timeout, 30_000);
  });
});

describe('probeHealth', () => {
  it('passes when the application really answers', async () => {
    const { cwd, command } = serverThat('response.writeHead(200); response.end("OK");');
    const outcome = await probeHealth({ command, path: '/health', timeout: 15_000, cwd });
    assert.equal(outcome.ok, true, outcome.detail);
  });

  it('fails when the route exists in the source but answers 404', async () => {
    // The exact case the old static check passed: the string is in the file, and the
    // request is not served.
    const { cwd, command } = serverThat(
      'if (request.url === "/nothing") { response.end("/health"); return; } response.writeHead(404); response.end("no");',
    );
    const outcome = await probeHealth({ command, path: '/health', timeout: 10_000, cwd });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.detail.includes('404'), true);
  });

  it('fails when the server cannot start at all', async () => {
    const cwd = makeTempDir();
    const outcome = await probeHealth({ command: 'node missing-server.mjs', path: '/health', timeout: 10_000, cwd });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.detail.includes('exited'), true);
  });

  it('fails, rather than hanging, when nothing ever answers', async () => {
    const { cwd, command } = serverThat('void request; void response;');
    const started = Date.now();
    const outcome = await probeHealth({ command, path: '/health', timeout: 2_000, cwd });
    assert.equal(outcome.ok, false);
    assert.equal(Date.now() - started < 20_000, true, 'the probe did not respect its own deadline');
  });

  it('fails when there is no start command to run', async () => {
    const outcome = await probeHealth({ command: '   ', path: '/health', timeout: 1_000, cwd: makeTempDir() });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.detail.includes('no start command'), true);
  });

  it('leaves nothing listening behind it', async () => {
    // A gate that leaks a server poisons every later iteration with a port conflict, and
    // the symptom looks nothing like the cause.
    const { cwd, command } = serverThat('response.writeHead(200); response.end("OK");');
    const first = await probeHealth({ command, path: '/health', timeout: 15_000, cwd });
    assert.equal(first.ok, true, first.detail);
    const second = await probeHealth({ command, path: '/health', timeout: 15_000, cwd });
    assert.equal(
      second.ok,
      true,
      `a second probe failed, which suggests the first left something running: ${second.detail}`,
    );
  });
});
