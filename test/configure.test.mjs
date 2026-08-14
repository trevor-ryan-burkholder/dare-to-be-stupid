/**
 * Tests for the config wizard (`scripts/configure.mjs`, DESIGN.md §10).
 *
 * Every dialogue is driven through the injected io seam with a scripted answer list — no
 * test touches a tty. The behaviours worth defending are the refusals: nothing is ever
 * written on a failure path, the `MEESEEKS_RUNNING` refusal fires before anything else, and
 * an unparseable answer re-prompts instead of becoming NaN or a silently-kept default.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { defaultConfig, loadConfig, validateConfig } from '../scripts/config.mjs';
import { groupForConfigError, main, terminalIo } from '../scripts/configure.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-configure-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {string} dir
 * @param {unknown} config
 * @returns {string} the raw bytes written
 */
function writeExisting(dir, config) {
  mkdirSync(path.join(dir, '.meeseeks'), { recursive: true });
  const raw = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(path.join(dir, '.meeseeks', 'config.json'), raw, 'utf8');
  return raw;
}

/** @param {string} dir @returns {string} */
function configPath(dir) {
  return path.join(dir, '.meeseeks', 'config.json');
}

/** @param {string} dir @returns {unknown} */
function readWritten(dir) {
  return JSON.parse(readFileSync(configPath(dir), 'utf8'));
}

/**
 * A scripted dialogue: answers are handed out in order, and exhaustion is EOF (`null`),
 * which is exactly what ctrl-d produces through the real seam.
 *
 * @param {string[]} answers
 */
function scripted(answers) {
  const remaining = [...answers];
  /** @type {string[]} */
  const questions = [];
  /** @type {string[]} */
  const lines = [];
  return {
    questions,
    lines,
    /** @param {string} question @returns {Promise<string | null>} */
    ask: async (question) => {
      questions.push(question);
      return remaining.length > 0 ? /** @type {string} */ (remaining.shift()) : null;
    },
    /** @param {string} line */
    write: (line) => {
      lines.push(line);
    },
  };
}

/** Ten blanks: 4 budgets, 2 loop shape, race, oracle, deploy, components — the whole default path. */
const ALL_BLANK = ['', '', '', '', '', '', '', '', '', ''];

describe('the MEESEEKS_RUNNING refusal', () => {
  it('refuses before any prompt, exits non-zero, and writes nothing', async () => {
    const dir = makeTempDir();
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: { MEESEEKS_RUNNING: '1' } });
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(io.questions, []);
    assert.deepStrictEqual(io.lines, [
      'a meeseeks run is in progress (MEESEEKS_RUNNING is set): a process inside a run may not reshape the config that constrains it.',
    ]);
    assert.strictEqual(existsSync(configPath(dir)), false);
  });

  it('fires before any read of the target config: an unreadable file is never mentioned', async () => {
    const dir = makeTempDir();
    mkdirSync(path.join(dir, '.meeseeks'), { recursive: true });
    writeFileSync(configPath(dir), 'not json at all', 'utf8');
    const io = scripted([]);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: { MEESEEKS_RUNNING: '1' } });
    assert.strictEqual(code, 1);
    assert.strictEqual(io.lines.length, 1);
    assert.strictEqual(
      io.lines[0],
      'a meeseeks run is in progress (MEESEEKS_RUNNING is set): a process inside a run may not reshape the config that constrains it.',
    );
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), 'not json at all');
  });

  it('refuses --show too: reading the config is still touching the run', async () => {
    const dir = makeTempDir();
    const io = scripted([]);
    const code = await main(['--show'], { ask: io.ask, write: io.write, cwd: dir, env: { MEESEEKS_RUNNING: 'run-7' } });
    assert.strictEqual(code, 1);
    assert.strictEqual(io.lines.length, 1);
    assert.strictEqual(
      io.lines[0],
      'a meeseeks run is in progress (MEESEEKS_RUNNING is set): a process inside a run may not reshape the config that constrains it.',
    );
  });

  it('treats an empty marker as unset, exactly as the driver does', async () => {
    const dir = makeTempDir();
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: { MEESEEKS_RUNNING: '' } });
    assert.strictEqual(code, 0);
    assert.strictEqual(existsSync(configPath(dir)), true);
  });
});

describe('the default dialogue', () => {
  it('all-blank answers write exactly the asked groups at their defaults', async () => {
    const dir = makeTempDir();
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(readWritten(dir), {
      maxIterations: 25,
      tokenCeiling: 4000000,
      costCeiling: 50,
      deadlineMs: 0,
      chaos: 1,
      stallLimit: 4,
      race: { enabled: false },
      oracle: { enabled: false },
      deploy: { enabled: false },
    });
    // The written file resolves to exactly the defaults through the real loader.
    assert.deepStrictEqual(loadConfig(path.join(dir, '.meeseeks')), defaultConfig());
  });

  it('asks the groups in the spec order with bracketed defaults', async () => {
    const dir = makeTempDir();
    const io = scripted(ALL_BLANK);
    await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.deepStrictEqual(io.questions, [
      'maxIterations [25]: ',
      'tokenCeiling [4000000]: ',
      'costCeiling [50]: ',
      'deadline in minutes (0 for none) [0]: ',
      'chaos [1]: ',
      'stallLimit [4]: ',
      'race.enabled (y/n) [false]: ',
      'oracle.enabled (y/n) [false]: ',
      'deploy.enabled (y/n) [false]: ',
      'components[0].name: ',
    ]);
  });

  it('prints the give-them-the-box reminder: the wizard configures, it cannot permit', async () => {
    const dir = makeTempDir();
    const io = scripted(ALL_BLANK);
    await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(
      io.lines.includes(
        'a configured component still requires --give-them-the-box typed at launch; the wizard configures, it cannot permit',
      ),
      true,
    );
    assert.strictEqual(io.lines.includes('budgets'), true);
    assert.strictEqual(io.lines.includes('loop shape'), true);
    assert.strictEqual(io.lines[io.lines.length - 1], `wrote ${configPath(dir)}`);
  });
});

describe('a fully-typed dialogue', () => {
  it('collects every group, the deploy argv one argument per prompt, and stores the deadline in ms', async () => {
    const dir = makeTempDir();
    const io = scripted([
      '12', '1000000', '25', '30',
      '2', '6',
      'y', '4', '5',
      'y',
      'y', 'ssh', 'box', 'cd /srv && ./deploy.sh', '', 'https://preview.example.test', '/health', '200', '', '30000',
      'api', 'services/api', 'Build the API', '',
    ]);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(readWritten(dir), {
      maxIterations: 12,
      tokenCeiling: 1000000,
      costCeiling: 25,
      deadlineMs: 1800000,
      chaos: 2,
      stallLimit: 6,
      race: { enabled: true, n: 4, after: 5 },
      oracle: { enabled: true },
      deploy: {
        enabled: true,
        // The argument with spaces survives whole: argv is collected, never split.
        command: ['ssh', 'box', 'cd /srv && ./deploy.sh'],
        url: 'https://preview.example.test',
        smoke: [{ path: '/health', status: 200 }],
        timeoutMs: 30000,
      },
      components: [{ name: 'api', dir: 'services/api', spec: 'Build the API' }],
    });
    // And the real loader accepts what the wizard wrote.
    const loaded = loadConfig(path.join(dir, '.meeseeks'));
    assert.deepStrictEqual(loaded.deploy.command, ['ssh', 'box', 'cd /srv && ./deploy.sh']);
  });

  it('a fractional deadline answer stores the exact millisecond value', async () => {
    const dir = makeTempDir();
    const io = scripted(['', '', '', '0.5', '', '', '', '', '', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.strictEqual(/** @type {{ deadlineMs: number }} */ (readWritten(dir)).deadlineMs, 30000);
  });
});

describe('the existing config as baseline', () => {
  it('blank keeps every existing value and unasked keys survive byte-for-byte', async () => {
    const dir = makeTempDir();
    writeExisting(dir, {
      maxIterations: 12,
      race: { enabled: true, n: 2, after: 5 },
      extraGates: [{ name: 'release-check', command: ['npm', 'run', 'release-check'] }],
      effort: { builder: 'high' },
      qualityPlugins: ['impeccable'],
      components: [{ name: 'web', dir: 'apps/web', spec: 'the web app' }],
    });
    // race.enabled is true in the baseline, so blank keeps it and n/after are asked: 12 blanks.
    const io = scripted(['', '', '', '', '', '', '', '', '', '', '', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(readWritten(dir), {
      maxIterations: 12,
      race: { enabled: true, n: 2, after: 5 },
      // Unasked keys, exactly as they were — not expanded, not defaulted, not dropped.
      extraGates: [{ name: 'release-check', command: ['npm', 'run', 'release-check'] }],
      effort: { builder: 'high' },
      qualityPlugins: ['impeccable'],
      components: [{ name: 'web', dir: 'apps/web', spec: 'the web app' }],
      tokenCeiling: 4000000,
      costCeiling: 50,
      deadlineMs: 0,
      chaos: 1,
      stallLimit: 4,
      oracle: { enabled: false },
      deploy: { enabled: false },
    });
  });

  it('shows the stored deadline in minutes and a blank keeps the stored milliseconds exactly', async () => {
    const dir = makeTempDir();
    writeExisting(dir, { deadlineMs: 1800000 });
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.strictEqual(io.questions[3], 'deadline in minutes (0 for none) [30]: ');
    assert.strictEqual(/** @type {{ deadlineMs: number }} */ (readWritten(dir)).deadlineMs, 1800000);
  });

  it('an enabled deploy is kept whole by blanks: command, url, smoke and timeout all survive', async () => {
    const dir = makeTempDir();
    const deploy = {
      enabled: true,
      command: ['npm', 'run', 'deploy'],
      url: 'https://preview.internal.example',
      smoke: [{ path: '/', status: 200 }],
      timeoutMs: 5000,
    };
    writeExisting(dir, { deploy });
    // 4 budgets, 2 loop, race, oracle, deploy.enabled, command[0], url, smoke[0].path,
    // timeoutMs, components — 14 blanks.
    const io = scripted(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(/** @type {{ deploy: unknown }} */ (readWritten(dir)).deploy, deploy);
    assert.strictEqual(
      io.lines.includes('deploy.command is ["npm","run","deploy"]; blank keeps it, anything typed starts a replacement'),
      true,
    );
  });

  it('typed component entries replace the existing list rather than appending to it', async () => {
    const dir = makeTempDir();
    writeExisting(dir, { components: [{ name: 'web', dir: 'apps/web', spec: 'the web app' }] });
    const io = scripted(['', '', '', '', '', '', '', '', '', 'api', 'services/api', 'the api', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(/** @type {{ components: unknown }} */ (readWritten(dir)).components, [
      { name: 'api', dir: 'services/api', spec: 'the api' },
    ]);
  });
});

describe('strict answer parsing', () => {
  it('an unparseable number re-prompts the same question instead of becoming NaN', async () => {
    const dir = makeTempDir();
    const io = scripted(['twelve', '', '', '', '', '', '', '', '', '', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.strictEqual(io.questions[0], 'maxIterations [25]: ');
    assert.strictEqual(io.questions[1], 'maxIterations [25]: ');
    assert.strictEqual(io.lines.includes('not a number: "twelve"'), true);
    assert.strictEqual(/** @type {{ maxIterations: number }} */ (readWritten(dir)).maxIterations, 25);
  });

  it('a non-answer to a yes/no question re-prompts instead of guessing', async () => {
    const dir = makeTempDir();
    const io = scripted(['', '', '', '', '', '', 'maybe', 'n', '', '', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.strictEqual(io.lines.includes('answer y or n: "maybe"'), true);
    assert.deepStrictEqual(/** @type {{ race: unknown }} */ (readWritten(dir)).race, { enabled: false });
  });
});

describe('validation of the complete merged object', () => {
  it('a failure names the key, re-prompts that group with the answers so far, and then writes', async () => {
    const dir = makeTempDir();
    // 3.5 parses as a number, so only the validator can refuse it — which it does by name,
    // and the budgets group runs again showing 3.5 in its own brackets.
    const io = scripted(['3.5', '', '', '', '', '', '', '', '', '', '20', '', '', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.strictEqual(io.lines.includes('maxIterations must be a positive integer; got 3.5.'), true);
    assert.strictEqual(io.questions[10], 'maxIterations [3.5]: ');
    assert.strictEqual(/** @type {{ maxIterations: number }} */ (readWritten(dir)).maxIterations, 20);
  });

  it('an invalid value carried in from the existing file is repairable through its group', async () => {
    const dir = makeTempDir();
    const raw = writeExisting(dir, { chaos: 7 });
    const io = scripted(['', '', '', '', '', '', '', '', '', '', '2', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.strictEqual(io.lines.includes('chaos must be 1, 2 or 3; got 7 (DESIGN.md §13.4).'), true);
    assert.strictEqual(/** @type {{ chaos: number }} */ (readWritten(dir)).chaos, 2);
    assert.notStrictEqual(readFileSync(configPath(dir), 'utf8'), raw);
  });

  it('a failure on a key the wizard never asks exits non-zero and writes nothing', async () => {
    const dir = makeTempDir();
    const raw = writeExisting(dir, { extraGates: 'nope' });
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.strictEqual(io.lines.includes('extraGates must be an array of { name, command } objects'), true);
    assert.strictEqual(io.lines[io.lines.length - 1], 'nothing was written.');
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), raw);
  });

  it('an unknown key in the existing file exits non-zero and leaves the file untouched', async () => {
    const dir = makeTempDir();
    const raw = writeExisting(dir, { frobnicate: 1 });
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.strictEqual(io.lines[io.lines.length - 1], 'nothing was written.');
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), raw);
  });
});

describe('EOF writes nothing', () => {
  it('EOF at the first prompt exits non-zero with no file created', async () => {
    const dir = makeTempDir();
    const io = scripted([]);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.strictEqual(io.lines[io.lines.length - 1], 'input ended before the dialogue finished; nothing was written.');
    assert.strictEqual(existsSync(configPath(dir)), false);
  });

  it('EOF mid-dialogue exits non-zero with no half-formed config', async () => {
    const dir = makeTempDir();
    const io = scripted(['12', '1000000']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.strictEqual(existsSync(configPath(dir)), false);
  });

  it('EOF during a validation re-prompt leaves the existing file byte-for-byte untouched', async () => {
    const dir = makeTempDir();
    const raw = writeExisting(dir, { chaos: 7 });
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.strictEqual(io.lines[io.lines.length - 1], 'input ended before the dialogue finished; nothing was written.');
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), raw);
  });
});

describe('--show', () => {
  it('prints the effective config without prompting or writing', async () => {
    const dir = makeTempDir();
    const raw = writeExisting(dir, { maxIterations: 12 });
    const io = scripted([]);
    const code = await main(['--show'], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(io.questions, []);
    assert.deepStrictEqual(JSON.parse(io.lines[0]), JSON.parse(JSON.stringify(validateConfig({ maxIterations: 12 }))));
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), raw);
  });

  it('with no file, shows the defaults and creates nothing', async () => {
    const dir = makeTempDir();
    const io = scripted([]);
    const code = await main(['--show'], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(JSON.parse(io.lines[0]), JSON.parse(JSON.stringify(defaultConfig())));
    assert.strictEqual(existsSync(path.join(dir, '.meeseeks')), false);
  });

  it('an invalid config exits non-zero with the validator message verbatim', async () => {
    const dir = makeTempDir();
    writeExisting(dir, { maxIterations: 0 });
    const io = scripted([]);
    const code = await main(['--show'], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(io.lines, ['maxIterations must be a positive integer; got 0.']);
  });
});

describe('refused inputs', () => {
  it('an unknown argument is refused rather than shrugged past', async () => {
    const dir = makeTempDir();
    const io = scripted([]);
    const code = await main(['--frob'], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(io.lines, ['unknown argument: --frob. The only flag is --show.']);
    assert.deepStrictEqual(io.questions, []);
  });

  it('an existing file that is not JSON is refused before any prompt, and never overwritten', async () => {
    const dir = makeTempDir();
    mkdirSync(path.join(dir, '.meeseeks'), { recursive: true });
    writeFileSync(configPath(dir), '{ not json', 'utf8');
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(io.questions, []);
    assert.strictEqual(io.lines.length, 1);
    assert.strictEqual(io.lines[0].startsWith(`${configPath(dir)} is not valid JSON: `), true);
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), '{ not json');
  });

  it('an existing file that is JSON but not an object is refused by name', async () => {
    const dir = makeTempDir();
    mkdirSync(path.join(dir, '.meeseeks'), { recursive: true });
    writeFileSync(configPath(dir), '[]\n', 'utf8');
    const io = scripted(ALL_BLANK);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(io.lines, [`${configPath(dir)} does not contain a JSON object; got []`]);
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), '[]\n');
  });
});

describe('groupForConfigError', () => {
  it('routes every asked key to its prompt group', () => {
    assert.strictEqual(groupForConfigError('maxIterations must be a positive integer; got 0.'), 'budgets');
    assert.strictEqual(groupForConfigError('deadlineMs must be a non-negative integer, where 0 means off; got -1.'), 'budgets');
    assert.strictEqual(groupForConfigError('chaos must be 1, 2 or 3; got 7 (DESIGN.md §13.4).'), 'loop');
    assert.strictEqual(groupForConfigError('stallLimit must be a positive integer; got 0.'), 'loop');
    assert.strictEqual(groupForConfigError('race.n must be a positive integer; got 0.'), 'race');
    assert.strictEqual(groupForConfigError('oracle has unknown key "x".'), 'oracle');
    assert.strictEqual(groupForConfigError('deploy.smoke[0].path must start with /, got x'), 'deploy');
    assert.strictEqual(groupForConfigError('components[0].name must be lower-case letters'), 'components');
  });

  it('routes what the wizard never asks to null, which exits rather than loops', () => {
    assert.strictEqual(groupForConfigError('extraGates must be an array of { name, command } objects'), null);
    assert.strictEqual(groupForConfigError('effort.builder must be one of low, medium, high, xhigh, max, got hard'), null);
    assert.strictEqual(groupForConfigError('.meeseeks/config.json has unknown key "frobnicate".'), null);
    assert.strictEqual(groupForConfigError('reviewers must not be empty; a run with no panel has no judge (DESIGN.md §1.1).'), null);
    assert.strictEqual(groupForConfigError('config must be an object; got 5.'), null);
  });
});

describe('terminalIo', () => {
  it('resolves a typed line', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const io = terminalIo({ input, output });
    const pending = io.ask('q: ');
    input.write('hello\n');
    assert.strictEqual(await pending, 'hello');
    io.close();
  });

  it('buffers piped input: lines that arrive before their questions are not dropped', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const io = terminalIo({ input, output });
    // The whole script arrives in one chunk with no question pending, which is exactly what
    // `printf '12\n\nlast\n' | node scripts/configure.mjs` does.
    input.end('12\n\nlast\n');
    await setImmediate();
    assert.strictEqual(await io.ask('a: '), '12');
    assert.strictEqual(await io.ask('b: '), '');
    assert.strictEqual(await io.ask('c: '), 'last');
    assert.strictEqual(await io.ask('d: '), null);
  });

  it('resolves null when input ends mid-question — the ctrl-d path — and stays null after', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const io = terminalIo({ input, output });
    const pending = io.ask('q: ');
    input.end();
    assert.strictEqual(await pending, null);
    assert.strictEqual(await io.ask('again: '), null);
  });
});

describe('a validation error the re-prompted group cannot reach concedes instead of looping', () => {
  // The reviewer's reproduction: before the concession existed, each of these printed the same
  // validator sentence 31 times across 40 piped blanks with ctrl-d as the only door out. The
  // detector is identical-after-a-round: a typed repair changes the message, a blank round
  // against an unreachable key cannot.
  it('exits after exactly one futile round on an unknown key inside a section', async () => {
    const dir = makeTempDir();
    const before = writeExisting(dir, { oracle: { enabled: false, x: 1 } });
    const io = scripted([...ALL_BLANK, '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    // The dialogue's ten questions plus one oracle re-prompt round, and nothing after the
    // identical failure: the loop conceded rather than asking an eleventh time.
    assert.strictEqual(io.questions.length, 11);
    assert.strictEqual(io.lines.filter((line) => line.includes('unknown key')).length, 2);
    const last = io.lines[io.lines.length - 1];
    assert.strictEqual(last.includes('no prompt in that group reaches the offending key'), true, last);
    assert.strictEqual(last.includes('nothing was written.'), true, last);
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), before);
  });

  it('exits after exactly one futile round on a poisoned key behind a disabled enabled', async () => {
    const dir = makeTempDir();
    const before = writeExisting(dir, { deploy: { enabled: false, timeoutMs: -5 } });
    const io = scripted([...ALL_BLANK, '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 1);
    assert.strictEqual(io.questions.length, 11);
    assert.strictEqual(io.lines.filter((line) => line.includes('deploy.timeoutMs')).length, 2);
    const last = io.lines[io.lines.length - 1];
    assert.strictEqual(last.includes('no prompt in that group reaches the offending key'), true, last);
    assert.strictEqual(readFileSync(configPath(dir), 'utf8'), before);
  });

  it('still repairs a reachable key: a typed answer changes the message and the loop makes progress', async () => {
    // The benign neighbour of the concession: chaos 7 is refused, the loop group re-prompts,
    // the operator types 2, and the wizard writes — the concession must not fire on progress.
    const dir = makeTempDir();
    writeExisting(dir, { chaos: 7 });
    const io = scripted([...ALL_BLANK, '2', '']);
    const code = await main([], { ask: io.ask, write: io.write, cwd: dir, env: {} });
    assert.strictEqual(code, 0);
    const written = /** @type {{ chaos: number }} */ (readWritten(dir));
    assert.strictEqual(written.chaos, 2);
    assert.strictEqual(
      io.lines.some((line) => line.includes('no prompt in that group reaches the offending key')),
      false,
      'the concession fired on a repairable error',
    );
  });
});
