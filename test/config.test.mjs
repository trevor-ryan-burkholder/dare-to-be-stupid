/**
 * Tests for `.meeseeks/config.json` (DESIGN.md §10).
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
  deprecationNotices,
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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-config-'));
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
      costCeiling: 50,
      // Zero means the flag is not passed at all. There is no arithmetic from a dollar
      // ceiling to a number of turns, so a non-zero default would be an invented threshold.
      maxChildTurns: 0,
      deadlineMs: 0,
      // On by default: it can only skip work on an iteration that is going to fail, because a
      // narrowed panel that passes triggers the full panel before any ship.
      panelCarry: { enabled: true },
      // Off by default because bubblewrap is a separate package and the driver refuses an
      // unsandboxed fallback: defaulting it on would refuse every run on a host without it.
      sandbox: { enabled: false },
      reviewers: ['security', 'correctness', 'design'],
      ownership: {
        security: ['DoD-2-security'],
        correctness: ['PRD-*', 'DoD-1-requirements', 'DoD-6-adversarial-input'],
        design: ['DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design'],
      },
      requireUnanimous: true,
      builderModel: 'claude-sonnet-5',
      reviewerModel: 'claude-opus-5',
      designModel: 'claude-opus-5',
      prdModel: 'claude-sonnet-5',
      lessonModel: 'claude-sonnet-5',
      qualityPlugins: ['impeccable', 'knip', 'semgrep', 'schemathesis', 'gitleaks'],
      extraGates: [],
      childEnvAllow: [],
      erd: '',
      schemaIntrospect: [],
      dod: '',
      toolchain: '',
      // Empty means the component phase does not exist: no nested runs, no flag demanded, no
      // behaviour change from a pre-components build.
      components: [],
      effort: {
        builder: 'medium',
        prd: 'medium',
        design: 'high',
        review: 'max',
        'reality-check': 'high',
        'lesson-extractor': 'low',
        'security-escalation': 'high',
        'oracle-author': 'max',
      },
      childTimeoutMs: 1_800_000,
      gateTimeoutMs: 2_700_000,
      oracle: { enabled: false },
      deploy: { enabled: false, command: [], url: '', smoke: [], timeoutMs: 600000 },
      extractTests: true,
      chaos: 1,
      realityCheck: { after: 3 },
      improvise: { enabled: true },
      race: { enabled: false, n: 3, after: 2 },
      advisory: { minConfidence: 0.7 },
      lessons: { enabled: true, maxPerBrief: 3 },
      contextBudget: { maxCharacters: 400000 },
    });
  });

  it('covers every DoD line and the PRD numbering between the three reviewers', () => {
    // The panel is only heterogeneous if the split is total. An id no reviewer owns cannot
    // be judged, and the run refuses to start rather than ship something unjudged.
    const owned = Object.values(defaultConfig().ownership).flat();
    for (const id of ['DoD-1-requirements', 'DoD-2-security', 'DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design']) {
      assert.equal(owned.includes(id), true, `no reviewer owns ${id}`);
    }
    assert.equal(owned.includes('PRD-*'), true, 'no reviewer owns the PRD requirements');
  });

  it('gives no id to two reviewers by default', () => {
    // Duplicate ownership is allowed when an operator asks for it, and is never the
    // default: it is a second whole-repository read of the same line.
    const owned = Object.values(defaultConfig().ownership).flat();
    assert.equal(owned.length, new Set(owned).size, 'an id is owned twice by default');
  });

  // The operator's top blocker, 13 August: a run hangs and sits there for hours until
  // somebody says something. `tokenCeiling` and `costCeiling` do not help — they bind a child
  // that *returns*, which makes them accounting rather than a watchdog.
  describe('the child ceiling', () => {
    it('bounds every child by default, rather than trusting one to come back', () => {
      assert.equal(defaultConfig().childTimeoutMs, 1_800_000);
    });

    it('refuses a ceiling that bounds nothing', () => {
      for (const bad of [0, -1, 2.5, 'thirty minutes', null]) {
        assert.throws(() => validateConfig({ childTimeoutMs: bad }), /childTimeoutMs/, `childTimeoutMs accepted ${JSON.stringify(bad)}`);
      }
    });

    it('accepts an operator-supplied ceiling, because a long task is not a hung one', () => {
      assert.equal(validateConfig({ childTimeoutMs: 5_400_000 }).childTimeoutMs, 5_400_000);
    });

    // The other half of an iteration. A gate can stop returning too: a suite holding an open
    // handle, a dev server never reaped, a browser run waiting on a selector that never comes.
    it('bounds every gate by default as well, because a gate can hang exactly like a child', () => {
      assert.equal(defaultConfig().gateTimeoutMs, 2_700_000);
    });

    it('refuses a gate ceiling that bounds nothing', () => {
      for (const bad of [0, -1, 2.5, 'forty-five minutes', null]) {
        assert.throws(() => validateConfig({ gateTimeoutMs: bad }), /gateTimeoutMs/, `gateTimeoutMs accepted ${JSON.stringify(bad)}`);
      }
    });

    it('gives the gate ceiling more room than the child ceiling, because mutation testing is the slow one', () => {
      const config = defaultConfig();
      assert.equal(config.gateTimeoutMs > config.childTimeoutMs, true);
    });
  });

  it('never enables deploy by default, because a run is pre-production only', () => {
    assert.equal(defaultConfig().deploy.enabled, false);
  });

  // 0.61.0. Until then `deploy` was a stub: one `execFileSync` fired *after* the
  // meeseeks/GRAND-PRIZE tag was already written, whose failure was printed and ignored, with
  // nothing checking the deployed result. A run could announce a grand prize having deployed
  // nothing. See DESIGN.md §10.1.
  describe('the deploy contract', () => {
    it('defaults to an argv array, a blank url and no smoke checks', () => {
      assert.deepStrictEqual(defaultConfig().deploy, { enabled: false, command: [], url: '', smoke: [], timeoutMs: 600000 });
    });

    // The deploy command was the one call in the driver with no ceiling on it. `tokenCeiling`
    // and `costCeiling` bind children that return; a deploy that never returns is bounded by
    // nothing, and `ssh` prompting for a passphrase nobody can answer is the ordinary way to
    // reach that. Ten minutes is generous for a remote build and finite, which is the property
    // that matters.
    it('bounds the deploy command by default rather than leaving it to run forever', () => {
      assert.equal(defaultConfig().deploy.timeoutMs, 600000);
    });

    it('refuses a timeout that is zero, negative or not a number, because none of those bound anything', () => {
      for (const bad of [0, -1, 1.5, 'ten minutes', null]) {
        assert.throws(
          () => validateConfig({ deploy: { timeoutMs: bad } }),
          /deploy\.timeoutMs/,
          `deploy.timeoutMs accepted ${JSON.stringify(bad)}`,
        );
      }
    });

    it('accepts an operator-supplied timeout, so a slow remote build is not forced to fail', () => {
      assert.equal(validateConfig({ deploy: { timeoutMs: 1_800_000 } }).deploy.timeoutMs, 1_800_000);
    });

    it('refuses a string command, naming the array it wants instead', () => {
      // `split(' ')` destroyed any quoted argument: `ssh box 'cd /srv && ./deploy.sh'`
      // arrived as six mangled tokens. An array cannot be mis-split, and rejecting the old
      // shape loudly is what stops a pre-0.61.0 config deploying something unintended.
      assert.throws(
        () => validateConfig({ deploy: { enabled: false, command: 'ssh box ./deploy.sh' } }),
        /deploy\.command.*array/i,
      );
    });

    it('refuses to enable a deploy with nothing to run', () => {
      assert.throws(() => validateConfig({ deploy: { enabled: true, url: 'https://s.example', smoke: [{ path: '/health', status: 200 }] } }), /command/i);
    });

    it('refuses to enable a deploy nothing can check', () => {
      // The whole point. A deploy with no url and no smoke check is the stub again: it runs
      // something and reports success regardless of what it did.
      assert.throws(() => validateConfig({ deploy: { enabled: true, command: ['./d.sh'], smoke: [{ path: '/health', status: 200 }] } }), /url/i);
      assert.throws(() => validateConfig({ deploy: { enabled: true, command: ['./d.sh'], url: 'https://s.example' } }), /smoke/i);
    });

    it('refuses a url that looks like production, exactly as it refuses such a remote', () => {
      // The "never points at anything with users" premise had a hole shaped precisely like
      // this feature: init refuses a prod-looking git remote and nothing checked the target.
      assert.throws(
        () => validateConfig({ deploy: { enabled: true, command: ['./d.sh'], url: 'https://api.production.example.com', smoke: [{ path: '/health', status: 200 }] } }),
        /production/,
      );
    });

    it('refuses a url that is not http or https', () => {
      assert.throws(
        () => validateConfig({ deploy: { enabled: true, command: ['./d.sh'], url: 'ssh://box/app', smoke: [{ path: '/health', status: 200 }] } }),
        /http/i,
      );
    });

    it('accepts a complete fixed-host deploy', () => {
      const deploy = validateConfig({
        deploy: {
          enabled: true,
          command: ['ssh', 'deploy@203.0.113.10', '/srv/app/deploy.sh'],
          url: 'https://staging.example.internal',
          smoke: [{ path: '/health', status: 200 }, { path: '/api/items', status: 200 }],
        },
      }).deploy;
      assert.deepStrictEqual(deploy.command, ['ssh', 'deploy@203.0.113.10', '/srv/app/deploy.sh']);
      assert.deepStrictEqual(deploy.smoke, [{ path: '/health', status: 200 }, { path: '/api/items', status: 200 }]);
    });

    it('requires every smoke entry to carry a path and an expected status', () => {
      assert.throws(() => validateConfig({ deploy: { enabled: true, command: ['./d.sh'], url: 'https://s.example', smoke: [{ path: '/health' }] } }), /status/i);
      assert.throws(() => validateConfig({ deploy: { enabled: true, command: ['./d.sh'], url: 'https://s.example', smoke: [{ status: 200 }] } }), /path/i);
    });

    it('leaves a disabled deploy alone, so an incomplete section is not an error until it is used', () => {
      // Refusing an unused half-written section would fail runs that never deploy.
      assert.deepStrictEqual(validateConfig({ deploy: { enabled: false } }).deploy, { enabled: false, command: [], url: '', smoke: [], timeoutMs: 600000 });
    });
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
    assert.deepStrictEqual(validateConfig({ race: { enabled: true } }).race, { enabled: true, n: 3, after: 2 });
    assert.throws(() => validateConfig({ deploy: { enabled: true } }), /command/i);
    assert.deepStrictEqual(validateConfig({ lessons: { maxPerBrief: 1 } }).lessons, { enabled: true, maxPerBrief: 1 });
  });

  it('takes an ownership map that reassigns ids between reviewers', () => {
    const config = validateConfig({ ownership: { security: ['DoD-2-security', 'PRD-4.*'] } });
    assert.deepStrictEqual(config.ownership, { security: ['DoD-2-security', 'PRD-4.*'] });
  });

  it('refuses ownership for a reviewer that does not exist', () => {
    // A pattern parked on a misspelled reviewer owns nothing, and the ids it names would
    // silently go unjudged.
    assert.throws(() => validateConfig({ ownership: { securty: ['DoD-2-security'] } }), ConfigError);
  });

  it('refuses an empty ownership pattern, which would match nothing', () => {
    assert.throws(() => validateConfig({ ownership: { security: ['  '] } }), ConfigError);
  });

  it('takes an advisory confidence threshold only on its own scale', () => {
    assert.equal(validateConfig({ advisory: { minConfidence: 0 } }).advisory.minConfidence, 0);
    assert.equal(validateConfig({ advisory: { minConfidence: 1 } }).advisory.minConfidence, 1);
    for (const bad of [-0.1, 1.5, 70, '0.7', null]) {
      assert.throws(() => validateConfig({ advisory: { minConfidence: bad } }), ConfigError, `accepted ${bad}`);
    }
  });

  it('takes a cost ceiling as a positive amount, decimals included', () => {
    // Not an integer: $2.50 is a reasonable ceiling and rounding it would silently change
    // what the operator asked for.
    assert.equal(validateConfig({ costCeiling: 2.5 }).costCeiling, 2.5);
    assert.equal(validateConfig({ costCeiling: 0.01 }).costCeiling, 0.01);
    for (const bad of [-1, '50', null, Number.POSITIVE_INFINITY, Number.NaN]) {
      assert.throws(() => validateConfig({ costCeiling: bad }), ConfigError, `accepted ${bad}`);
    }
  });

  it('takes zero on either ceiling as "no ceiling"', () => {
    // For development and dogfooding on a plan where spend is not the constraint. Deliberately
    // not the default: BRIEF section E lists hard budget limits among the things to preserve, so
    // this is an operator switching one off rather than a softened default. Termination is
    // untouched -- maxIterations, the stall limit and the ratchet still bound the run.
    assert.equal(validateConfig({ costCeiling: 0 }).costCeiling, 0);
    assert.equal(validateConfig({ tokenCeiling: 0 }).tokenCeiling, 0);
  });

  it('still refuses a negative or infinite ceiling, which is a typo rather than a choice', () => {
    for (const bad of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      assert.throws(() => validateConfig({ tokenCeiling: bad }), ConfigError, `accepted ${bad}`);
      assert.throws(() => validateConfig({ costCeiling: bad }), ConfigError, `accepted ${bad}`);
    }
  });

  it('takes a context budget as a positive whole number of characters', () => {
    assert.equal(validateConfig({ contextBudget: { maxCharacters: 12000 } }).contextBudget.maxCharacters, 12000);
    // No zero and no negative: both mean "refuse every prompt", which is a way of ending
    // every run rather than a way of configuring one. There is deliberately no `enabled`
    // key — switching the check off is how the silent degradation it catches gets back in.
    for (const bad of [0, -1, 1.5, '400000', null]) {
      assert.throws(() => validateConfig({ contextBudget: { maxCharacters: bad } }), ConfigError, `accepted ${bad}`);
    }
    assert.throws(() => validateConfig({ contextBudget: { enabled: false } }), ConfigError);
  });

  it('leaves the context budget at its default when the section is present but empty', () => {
    assert.equal(validateConfig({ contextBudget: {} }).contextBudget.maxCharacters, 400000);
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
    [{ extraGates: { name: 'x', command: ['y'] } }, 'a single extra gate where a list belongs'],
    [{ extraGates: [{ command: ['npm', 'run', 'x'] }] }, 'an extra gate with no name'],
    [{ extraGates: [{ name: 'release-check' }] }, 'an extra gate with nothing to run'],
    [{ extraGates: [{ name: '  ', command: ['npm'] }] }, 'an extra gate named only whitespace'],
    [{ extraGates: [{ name: 'x', command: [] }] }, 'an extra gate with an empty argv'],
    [{ extraGates: [{ name: 'x', command: 'npm run x' }] }, 'an extra gate given a shell string'],
    [{ extraGates: [{ name: 'x', command: ['npm'], required: false }] }, 'an extra gate trying to be advisory'],
    [{ race: { n: 0 } }, 'a racer count below 1'],
    [[], 'an array instead of an object'],
    ['nope', 'a string instead of an object'],
  ];
  for (const [input, label] of rejected) {
    it(`rejects ${label}`, () => {
      assert.throws(() => validateConfig(input), ConfigError);
    });
  }

  it('accepts an operator gate and keeps its argv exactly', () => {
    // The reason this key exists: a project invariant no toolchain knows about. This
    // repository's own is `release-check`, which holds the install-cache rule — a shipped file
    // changed without a version bump resolves to the previous build, and every symptom of that
    // looks like a wrong fix rather than an unloaded one.
    const config = validateConfig({ extraGates: [{ name: 'release-check', command: ['npm', 'run', 'release-check'] }] });
    assert.deepEqual(config.extraGates, [{ name: 'release-check', command: ['npm', 'run', 'release-check'] }]);
  });

  it('names the offending gate by index, so a list of five is debuggable', () => {
    assert.throws(
      () => validateConfig({ extraGates: [{ name: 'a', command: ['x'] }, { name: 'b', command: [] }] }),
      (error) => error instanceof ConfigError && error.message.includes('extraGates[1]'),
    );
  });

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

describe('the component list', () => {
  // PLAN item 24. Each entry causes a whole nested driver to be spawned with a budget carved
  // from this run's remainder, so the validation stakes are higher than for any other key: a
  // typo here is an unattended process pointed at the wrong directory.

  it('accepts a valid component and keeps every field exactly', () => {
    const config = validateConfig({
      components: [{ name: 'parser-core2', dir: 'packages/parser', spec: 'PRD.md' }],
    });
    assert.deepStrictEqual(config.components, [{ name: 'parser-core2', dir: 'packages/parser', spec: 'PRD.md' }]);
  });

  it('accepts several components and preserves the declared order, because they run in it', () => {
    const config = validateConfig({
      components: [
        { name: 'api', dir: 'services/api', spec: 'Build the API.' },
        { name: 'web', dir: 'apps/web', spec: 'docs/web-prd.md' },
      ],
    });
    assert.deepStrictEqual(
      config.components.map((component) => component.name),
      ['api', 'web'],
    );
  });

  it('accepts an empty list, which switches the phase off entirely', () => {
    assert.deepStrictEqual(validateConfig({ components: [] }).components, []);
    assert.deepStrictEqual(validateConfig({}).components, []);
  });

  const rejected = [
    [{ components: { name: 'a', dir: 'a', spec: 'x' } }, 'a single component where a list belongs'],
    [{ components: ['parser'] }, 'a component that is only a string'],
    [{ components: [{ dir: 'a', spec: 'x' }] }, 'a component with no name'],
    [{ components: [{ name: 'a', spec: 'x' }] }, 'a component with no dir'],
    [{ components: [{ name: 'a', dir: 'a' }] }, 'a component with no spec'],
    [{ components: [{ name: '', dir: 'a', spec: 'x' }] }, 'an empty name'],
    [{ components: [{ name: '   ', dir: 'a', spec: 'x' }] }, 'a name that is only whitespace'],
    [{ components: [{ name: 'Parser', dir: 'a', spec: 'x' }] }, 'an upper-case name'],
    [{ components: [{ name: 'my parser', dir: 'a', spec: 'x' }] }, 'a name with a space'],
    [{ components: [{ name: 'a_b', dir: 'a', spec: 'x' }] }, 'a name with an underscore'],
    [{ components: [{ name: 'a--b', dir: 'a', spec: 'x' }] }, 'a name with a double hyphen'],
    [{ components: [{ name: '-a', dir: 'a', spec: 'x' }] }, 'a name starting with a hyphen'],
    [{ components: [{ name: 'a-', dir: 'a', spec: 'x' }] }, 'a name ending with a hyphen'],
    [{ components: [{ name: 5, dir: 'a', spec: 'x' }] }, 'a name that is not a string'],
    [
      {
        components: [
          { name: 'twin', dir: 'a', spec: 'x' },
          { name: 'twin', dir: 'b', spec: 'y' },
        ],
      },
      'two components sharing a name, which would share a branch',
    ],
    [{ components: [{ name: 'a', dir: '', spec: 'x' }] }, 'an empty dir'],
    [{ components: [{ name: 'a', dir: '   ', spec: 'x' }] }, 'a dir that is only whitespace'],
    [{ components: [{ name: 'a', dir: 5, spec: 'x' }] }, 'a dir that is not a string'],
    [{ components: [{ name: 'a', dir: '/srv/app', spec: 'x' }] }, 'an absolute POSIX dir'],
    [{ components: [{ name: 'a', dir: 'C:\\app', spec: 'x' }] }, 'an absolute Windows dir'],
    [{ components: [{ name: 'a', dir: 'C:/app', spec: 'x' }] }, 'an absolute Windows dir with forward slashes'],
    [{ components: [{ name: 'a', dir: '\\\\host\\share', spec: 'x' }] }, 'a UNC dir'],
    [{ components: [{ name: 'a', dir: '..', spec: 'x' }] }, 'a dir that is the parent directory'],
    [{ components: [{ name: 'a', dir: '../sibling', spec: 'x' }] }, 'a dir escaping through a leading ..'],
    [{ components: [{ name: 'a', dir: 'x/../../y', spec: 'x' }] }, 'a dir escaping through an inner ..'],
    [{ components: [{ name: 'a', dir: 'x\\..\\y', spec: 'x' }] }, 'a dir with a backslash-separated ..'],
    [{ components: [{ name: 'a', dir: 'x', spec: '' }] }, 'an empty spec'],
    [{ components: [{ name: 'a', dir: 'x', spec: '   ' }] }, 'a spec that is only whitespace'],
    [{ components: [{ name: 'a', dir: 'x', spec: 5 }] }, 'a spec that is not a string'],
    [{ components: [{ name: 'a', dir: 'x', spec: 'y', model: 'opus' }] }, 'an unknown component key'],
  ];
  for (const [input, label] of rejected) {
    it(`rejects ${label}`, () => {
      assert.throws(() => validateConfig(input), ConfigError);
    });
  }

  it('allows a dir with .. in a file name, which is not an escape', () => {
    // The benign neighbour of the traversal rejections: two literal dots inside a segment are
    // just a name. Only a whole `..` segment can point outside the repository.
    const config = validateConfig({ components: [{ name: 'a', dir: 'pkg/v1..2', spec: 'x' }] });
    assert.equal(config.components[0].dir, 'pkg/v1..2');
  });

  it('names the offending component by index, so a list of five is debuggable', () => {
    assert.throws(
      () => validateConfig({ components: [{ name: 'good', dir: 'a', spec: 'x' }, { name: 'BAD', dir: 'b', spec: 'y' }] }),
      (error) => error instanceof ConfigError && error.message.includes('components[1]'),
    );
  });
});

describe('applyEnvOverrides', () => {
  it('lets MEESEEKS_CHAOS override the dial', () => {
    assert.equal(applyEnvOverrides(defaultConfig(), { MEESEEKS_CHAOS: '3' }).chaos, 3);
  });

  it('leaves the config alone when the variable is absent or empty', () => {
    assert.deepStrictEqual(applyEnvOverrides(defaultConfig(), {}), defaultConfig());
    assert.deepStrictEqual(applyEnvOverrides(defaultConfig(), { MEESEEKS_CHAOS: '' }), defaultConfig());
  });

  it('overrides nothing else', () => {
    const overridden = applyEnvOverrides(defaultConfig(), { MEESEEKS_CHAOS: '2', MEESEEKS_MAX_ITERATIONS: '999' });
    assert.equal(overridden.maxIterations, 25);
  });

  for (const value of ['0', '4', 'feral', '2.5', '-1']) {
    it(`rejects MEESEEKS_CHAOS=${JSON.stringify(value)}`, () => {
      assert.throws(() => applyEnvOverrides(defaultConfig(), { MEESEEKS_CHAOS: value }), ConfigError);
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

  it('tells the operator to run meeseeks init when the file is missing', () => {
    assert.throws(
      () => loadConfig(makeTempDir()),
      (error) => error instanceof ConfigError && error.message.includes('meeseeks init'),
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
    assert.equal(loadConfig(dir, { env: { MEESEEKS_CHAOS: '3' } }).chaos, 3);
  });
});

describe('initConfig', () => {
  it('creates the file the first time', () => {
    const dir = path.join(makeTempDir(), '.meeseeks');
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
    'git@github.com:example/meeseeks.git',
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

describe('per-phase reasoning effort', () => {
  // Verified against a live child rather than read from help text: `--effort low` and
  // `--effort max` are both accepted by `claude -p` and visibly move the thinking-token count
  // (232 vs 394 on the same trivial prompt).

  it('pins the judge at max, because the smartest thing in the loop should be the one deciding', () => {
    // §1.1. A verdict that gets cheaper as a run gets more desperate is satisficing installed
    // at the auditor, which is the one place this whole architecture exists to prevent it.
    assert.equal(defaultConfig().effort.review, 'max');
  });

  it('gives every phase an effort, so a new one is a decision rather than a default', () => {
    for (const phase of ['builder', 'prd', 'design', 'review', 'reality-check', 'lesson-extractor', 'security-escalation']) {
      assert.equal(typeof defaultConfig().effort[phase], 'string', `${phase} has no effort`);
    }
  });

  it('refuses a level the CLI does not know', () => {
    // An unrecognised level would be passed straight to another binary's argv. Failing here
    // costs a startup; failing there costs an unattended run.
    assert.throws(() => validateConfig({ effort: { builder: 'ludicrous' } }), /effort\.builder/);
  });

  it('refuses a phase nobody spawns', () => {
    // An effort nobody applies is a setting that silently does nothing.
    assert.throws(() => validateConfig({ effort: { summariser: 'high' } }), /effort/);
  });

  it('merges one phase without discarding the rest', () => {
    const effort = validateConfig({ effort: { builder: 'xhigh' } }).effort;
    assert.equal(effort.builder, 'xhigh');
    assert.equal(effort.review, 'max', 'overriding one phase dropped the others');
  });
});

describe('the retired styleModel key (REVIEW F23)', () => {
  it('is not in the defaults, so a new config never emits it', () => {
    assert.equal('styleModel' in defaultConfig(), false);
  });

  it('is accepted from an existing config rather than rejected', () => {
    // Removing it outright would make strict validation reject a config that works today, turning a
    // documentation defect into a broken target. The window exists so an operator can delete the key
    // on their own schedule.
    const config = validateConfig({ ...defaultConfig(), styleModel: 'claude-fable-5' });
    assert.equal('styleModel' in config, false, 'the ignored key leaked into the active config');
    assert.equal(config.prdModel, 'claude-sonnet-5', 'the control that does exist was disturbed');
  });

  it('still refuses a legacy key of the wrong type, because accepted is not unvalidated', () => {
    assert.throws(() => validateConfig({ ...defaultConfig(), styleModel: 42 }), ConfigError);
  });

  it('says it is ignored and names the control that is not', () => {
    // Silence is what created the defect: an operator set it, passed validation, saw no behavioural
    // or cost change, and read `run.json` claiming that model participated.
    const notices = deprecationNotices({ styleModel: 'claude-fable-5' });
    assert.equal(notices.length, 1);
    assert.equal(notices[0].includes('ignored'), true, notices[0]);
    assert.equal(notices[0].includes('prdModel'), true, notices[0]);
  });

  it('says nothing about a config that does not carry it', () => {
    // The benign neighbour. A clean config must not accumulate a warning every startup.
    assert.deepStrictEqual(deprecationNotices(defaultConfig()), []);
    assert.deepStrictEqual(deprecationNotices(null), []);
    assert.deepStrictEqual(deprecationNotices('not an object'), []);
  });

  it('is not repurposed into some new model call', () => {
    // The finding is explicit that inventing behaviour to justify a setting is the wrong repair.
    // Asserted as an absence so a later edit that quietly wires it up fails here.
    assert.equal(Object.keys(defaultConfig()).some((key) => key.toLowerCase().includes('style')), false);
  });
});
