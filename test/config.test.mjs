/**
 * Tests for `.dare/config.json` (DESIGN.md §10).
 *
 * The behaviour worth defending is strictness. An unattended run reads this file once and
 * then acts on it for hours, so a typo that silently keeps a default is a run that does
 * something other than what was asked, with nobody watching.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  ConfigError,
  applyEnvOverrides,
  defaultConfig,
  initConfig,
  loadConfig,
  riskyRemoteWord,
  validateConfig,
  writeConfig,
} from '../scripts/config.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-config-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('defaultConfig', () => {
  it('is exactly the table in DESIGN.md §10', () => {
    assert.deepStrictEqual(defaultConfig(), {
      maxIterations: 25,
      stallLimit: 4,
      tokenCeiling: 4000000,
      reviewers: ['security', 'correctness', 'design'],
      requireUnanimous: true,
      builderModel: 'claude-sonnet-5',
      reviewerModel: 'claude-opus-5',
      designModel: 'claude-opus-5',
      prdModel: 'claude-sonnet-5',
      styleModel: 'claude-fable-5',
      qualityPlugins: ['impeccable'],
      deploy: { enabled: false, command: '' },
      extractTests: true,
      chaos: 1,
      realityCheck: { after: 3 },
      dareMe: { enabled: true },
      race: { enabled: false, n: 3 },
    });
  });

  it('never enables deploy by default, because a run is pre-production only', () => {
    assert.equal(defaultConfig().deploy.enabled, false);
  });

  it('never enables worktree racing by default', () => {
    assert.equal(defaultConfig().race.enabled, false);
  });

  it('hands out a fresh object each time, so one run cannot mutate another', () => {
    defaultConfig().reviewers.push('astrology');
    assert.deepStrictEqual(defaultConfig().reviewers, ['security', 'correctness', 'design']);
  });
});

describe('validateConfig merges over the defaults', () => {
  it('keeps unspecified keys at their default', () => {
    assert.deepStrictEqual(validateConfig({ maxIterations: 3 }), { ...defaultConfig(), maxIterations: 3 });
  });

  it('accepts an empty object', () => {
    assert.deepStrictEqual(validateConfig({}), defaultConfig());
  });

  it('merges nested objects key by key rather than replacing them', () => {
    assert.deepStrictEqual(validateConfig({ race: { enabled: true } }).race, { enabled: true, n: 3 });
    assert.deepStrictEqual(validateConfig({ deploy: { enabled: true } }).deploy, { enabled: true, command: '' });
  });
});

describe('validateConfig refuses what it cannot trust', () => {
  const rejected = [
    [{ maxIteration: 3 }, 'a typo in a key name'],
    [{ unknown: true }, 'an unknown key'],
    [{ deploy: { enabled: true, target: 'prod' } }, 'an unknown nested key'],
    [{ maxIterations: 0 }, 'a non-positive iteration count'],
    [{ maxIterations: 2.5 }, 'a fractional iteration count'],
    [{ maxIterations: '3' }, 'a numeric-looking string'],
    [{ requireUnanimous: 'yes' }, 'a boolean-looking string'],
    [{ reviewers: [] }, 'an empty reviewer panel'],
    [{ reviewers: ['astrology'] }, 'a reviewer that does not exist'],
    [{ reviewers: 'security' }, 'a reviewer list that is not a list'],
    [{ chaos: 4 }, 'a stupidity dial past 3'],
    [{ chaos: 0 }, 'a stupidity dial below 1'],
    [{ builderModel: 5 }, 'a model that is not a string'],
    [{ qualityPlugins: [1] }, 'a plugin list of non-strings'],
    [{ deploy: 'vercel' }, 'a deploy section that is not an object'],
    [{ race: { n: 0 } }, 'a racer count below 1'],
    [[], 'an array instead of an object'],
    ['nope', 'a string instead of an object'],
  ];
  for (const [input, label] of rejected) {
    it(`rejects ${label}`, () => {
      assert.throws(() => validateConfig(input), ConfigError);
    });
  }

  it('names the unknown key so the operator can find the typo', () => {
    assert.throws(
      () => validateConfig({ maxIteration: 3 }),
      (error) => error instanceof ConfigError && error.message.includes('"maxIteration"'),
    );
  });

  it('names the reviewers it does know', () => {
    assert.throws(
      () => validateConfig({ reviewers: ['astrology'] }),
      (error) => error instanceof ConfigError && error.message.includes('security, correctness, design'),
    );
  });
});

describe('applyEnvOverrides', () => {
  it('lets DARE_CHAOS override the dial', () => {
    assert.equal(applyEnvOverrides(defaultConfig(), { DARE_CHAOS: '3' }).chaos, 3);
  });

  it('leaves the config alone when the variable is absent or empty', () => {
    assert.deepStrictEqual(applyEnvOverrides(defaultConfig(), {}), defaultConfig());
    assert.deepStrictEqual(applyEnvOverrides(defaultConfig(), { DARE_CHAOS: '' }), defaultConfig());
  });

  it('overrides nothing else', () => {
    const overridden = applyEnvOverrides(defaultConfig(), { DARE_CHAOS: '2', DARE_MAX_ITERATIONS: '999' });
    assert.equal(overridden.maxIterations, 25);
  });

  for (const value of ['0', '4', 'feral', '2.5', '-1']) {
    it(`rejects DARE_CHAOS=${JSON.stringify(value)}`, () => {
      assert.throws(() => applyEnvOverrides(defaultConfig(), { DARE_CHAOS: value }), ConfigError);
    });
  }
});

describe('loadConfig and writeConfig', () => {
  it('round-trips the defaults exactly', () => {
    const dir = makeTempDir();
    writeConfig(dir, defaultConfig());
    assert.deepStrictEqual(loadConfig(dir), defaultConfig());
  });

  it('leaves no temporary file behind', () => {
    const dir = makeTempDir();
    writeConfig(dir, defaultConfig());
    assert.deepStrictEqual(readdirSync(dir), ['config.json']);
  });

  it('tells the operator to run dare init when the file is missing', () => {
    assert.throws(
      () => loadConfig(makeTempDir()),
      (error) => error instanceof ConfigError && error.message.includes('dare init'),
    );
  });

  it('throws on malformed JSON rather than falling back to defaults', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'config.json'), '{ not json', 'utf8');
    assert.throws(() => loadConfig(dir), ConfigError);
  });

  it('applies environment overrides on load', () => {
    const dir = makeTempDir();
    writeConfig(dir, defaultConfig());
    assert.equal(loadConfig(dir, { env: { DARE_CHAOS: '3' } }).chaos, 3);
  });
});

describe('initConfig', () => {
  it('creates the file the first time', () => {
    const dir = path.join(makeTempDir(), '.dare');
    const result = initConfig(dir);
    assert.equal(result.created, true);
    assert.deepStrictEqual(result.config, defaultConfig());
    assert.deepStrictEqual(JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8')), defaultConfig());
  });

  it('leaves an existing file alone, including its edits', () => {
    const dir = makeTempDir();
    writeConfig(dir, { ...defaultConfig(), maxIterations: 2 });
    const result = initConfig(dir);
    assert.equal(result.created, false);
    assert.equal(result.config.maxIterations, 2);
  });

  it('propagates a corrupt existing file rather than overwriting it', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'config.json'), '{ not json', 'utf8');
    assert.throws(() => initConfig(dir), ConfigError);
    assert.equal(readFileSync(path.join(dir, 'config.json'), 'utf8'), '{ not json');
  });
});

describe('riskyRemoteWord', () => {
  const risky = [
    ['git@github.com:acme/production-api.git', 'production'],
    ['https://github.com/acme/prod-web.git', 'prod'],
    ['https://github.com/acme/client-portal.git', 'client'],
    ['https://github.com/acme/customer-data.git', 'customer'],
    ['https://github.com/acme/my-production-app.git', 'production'],
    ['/srv/git/PROD/app.git', 'prod'],
  ];
  for (const [remote, word] of risky) {
    it(`refuses ${remote}`, () => {
      assert.equal(riskyRemoteWord(remote), word);
    });
  }

  const safe = [
    'git@github.com:example/dare-to-be-stupid.git',
    'https://github.com/acme/procurement.git',
    'https://github.com/acme/products.git',
    'https://github.com/acme/reproduction-tests.git',
    'https://github.com/acme/clientele.git',
    'file:///tmp/throwaway',
  ];
  for (const remote of safe) {
    it(`allows ${remote}`, () => {
      assert.equal(riskyRemoteWord(remote), null);
    });
  }
});
