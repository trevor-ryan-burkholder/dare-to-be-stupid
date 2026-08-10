/**
 * Tests for the PreToolUse guard hook (DESIGN.md §6).
 *
 * Every blocked category is proved blocked *and* proved to leave a benign neighbour
 * alone (CLAUDE.md, "Test the deny path"). Blocking everything is not passing.
 *
 * Payload shapes come from committed fixtures in `test/fixtures/hook-events/` rather than
 * from hand-rolled object literals, so a change to the PreToolUse envelope shows up here.
 * Cases vary only the field under test.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { checkBashCommand, evaluate, isProtectedStatePath, renderDecision, tokenizeCommand } from '../hooks/guard.mjs';

const execFileAsync = promisify(execFile);
const FIXTURE_DIR = new URL('./fixtures/hook-events/', import.meta.url);
const GUARD = fileURLToPath(new URL('../hooks/guard.mjs', import.meta.url));

/**
 * @param {string} name
 * @returns {Record<string, any>}
 */
function loadEvent(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_DIR), 'utf8'));
}

/** The cwd baked into every fixture. Assertions that resolve paths use it. */
const FIXTURE_CWD = loadEvent('pretooluse-bash.json').cwd;

/**
 * @param {string} command
 * @returns {Record<string, any>}
 */
function bashEvent(command) {
  const event = loadEvent('pretooluse-bash.json');
  event.tool_input.command = command;
  return event;
}

/**
 * @param {string} fixture
 * @param {string} key
 * @param {string} filePath
 * @returns {Record<string, any>}
 */
function pathEvent(fixture, key, filePath) {
  const event = loadEvent(fixture);
  event.tool_input[key] = filePath;
  return event;
}

/**
 * Decision without the prose, so tables assert the rule that fired rather than its wording.
 * @param {unknown} event
 * @returns {{ decision: string, rule?: string }}
 */
function ruling(event) {
  const result = evaluate(event);
  return result.decision === 'deny' ? { decision: 'deny', rule: result.rule } : { decision: 'allow' };
}

/**
 * @param {unknown} event
 * @param {string} rule
 */
function assertDenied(event, rule) {
  assert.deepStrictEqual(ruling(event), { decision: 'deny', rule });
}

/** @param {unknown} event */
function assertAllowed(event) {
  assert.deepStrictEqual(ruling(event), { decision: 'allow' });
}

// ---------------------------------------------------------------------------
// Category 1 — protected ratchet state
// ---------------------------------------------------------------------------

describe('blocked: protected-state', () => {
  const denied = [
    ["echo '{}' > .dare/state.json", 'redirect over state'],
    ['cat .dare/config.json', 'read of config'],
    ["sed -i 's/a/b/' ./.dare/state.json", 'in-place edit through ./'],
    ["cd .dare && echo '{}' > state.json", 'chdir first, protected name second'],
    ['rm .dare/state.json', 'deletion'],
    ['python3 -c "open(\'.dare/config.json\',\'w\').write(\'{}\')"', 'write from an interpreter'],
    ['cp /tmp/fake.json "$HOME/.dare/state.json"', 'absolute path through $HOME'],
    ['npm run build | tee .dare/state.json', 'tee in a pipeline'],
    ['printf \'%s\' \'{}\' > .dare"/state.json"', 'path split across quotes'],
    ['echo "$(cat .dare/state.json)"', 'inside a command substitution'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }

  it('denies a Write to .dare/state.json', () => {
    assertDenied(pathEvent('pretooluse-write.json', 'file_path', '.dare/state.json'), 'protected-state');
  });

  it('denies a Write to the absolute .dare/config.json', () => {
    assertDenied(
      pathEvent('pretooluse-write.json', 'file_path', `${FIXTURE_CWD}/.dare/config.json`),
      'protected-state',
    );
  });

  it('denies an Edit that reaches state through a traversal', () => {
    assertDenied(pathEvent('pretooluse-edit.json', 'file_path', 'src/../.dare/state.json'), 'protected-state');
  });

  it('denies a NotebookEdit whose notebook_path is ratchet state', () => {
    assertDenied(
      pathEvent('pretooluse-notebook-edit.json', 'notebook_path', '.dare/state.json'),
      'protected-state',
    );
  });

  it('denies a non-matched tool that carries a protected path, in case the matcher widens', () => {
    const event = loadEvent('pretooluse-write.json');
    event.tool_name = 'Read';
    event.tool_input = { file_path: '.dare/state.json' };
    assertDenied(event, 'protected-state');
  });
});

describe('allowed: protected-state neighbours', () => {
  const allowed = [
    ['cat package.json', 'an unrelated json file'],
    ['cat tsconfig.json', 'a name that merely ends in config.json'],
    ['ls .dare', 'listing the dare directory'],
    ['cat .dare/bloopers.log', 'the blooper reel, which the driver owns (DESIGN.md §13.2)'],
    ['ls .dare && cat tsconfig.json', 'the dare directory and a config-suffixed name together'],
    ["echo '{}' > src/state.json", 'an application file that happens to be called state.json'],
    ['git add .dare/bloopers.log', 'staging the blooper reel'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }

  const allowedWrites = [
    ['pretooluse-write.json', 'file_path', 'src/state.json'],
    ['pretooluse-write.json', 'file_path', 'docs/config.json'],
    ['pretooluse-write.json', 'file_path', '.dare/bloopers.log'],
    ['pretooluse-write.json', 'file_path', '.darerc'],
    ['pretooluse-write.json', 'file_path', 'vendor/mydare/state.json'],
    ['pretooluse-edit.json', 'file_path', 'src/index.mjs'],
  ];
  for (const [fixture, key, filePath] of allowedWrites) {
    it(`allows writing ${filePath}`, () => {
      assertAllowed(pathEvent(fixture, key, filePath));
    });
  }

  it('does not treat a document that merely mentions the path as a write to it', () => {
    const event = loadEvent('pretooluse-write.json');
    event.tool_input = { file_path: 'docs/ratchet.md', content: 'The ratchet lives in .dare/state.json.\n' };
    assertAllowed(event);
  });
});

// ---------------------------------------------------------------------------
// Category 2 — history-destroying git
// ---------------------------------------------------------------------------

describe('blocked: git-history', () => {
  const denied = [
    'git push --force',
    'git push -f origin main',
    'git push --force-with-lease origin main',
    'git push --force-with-lease=main origin main',
    'git push -uf origin main',
    `git -C ${FIXTURE_CWD} push --force`,
    'GIT_SSH_COMMAND="ssh -i key" git push --force',
    'git rebase -i HEAD~3',
    'git rebase --abort',
    "git filter-branch --tree-filter 'true' HEAD",
    'git reflog expire --expire=now --all',
    'npm run build && git push --force',
  ];
  for (const command of denied) {
    it(`denies ${command}`, () => {
      assertDenied(bashEvent(command), 'git-history');
    });
  }
});

describe('allowed: git-history neighbours', () => {
  const allowed = [
    ['git push', 'an ordinary push'],
    ['git push origin main', 'an ordinary push with a refspec'],
    ['git push -q origin main', 'a short flag that is not -f'],
    ['git push --set-upstream origin feature', 'a long flag that is not --force'],
    ['git push --follow-tags', 'another long flag that is not --force'],
    ['git fetch --force', 'force on a subcommand that destroys no history'],
    ['git commit -m "revert the botched rebase"', 'the word rebase inside a commit message'],
    ['git reflog', 'reading the reflog'],
    ['git reflog --date=iso', 'reading the reflog with a flag'],
    ['git reset --hard HEAD', 'the hard reset the ratchet itself performs'],
    ['git log --oneline -5', 'reading history'],
    ['git rev-parse HEAD', 'resolving a ref'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

// ---------------------------------------------------------------------------
// Category 3 — recursive rm outside the temp directory
// ---------------------------------------------------------------------------

describe('blocked: rm-recursive', () => {
  const denied = [
    ['rm -rf node_modules', 'a project directory'],
    ['rm -rf /', 'the root'],
    ['rm -r src', 'recursive without -f'],
    ['rm -Rf build', 'capital -R'],
    ['rm --recursive --force dist', 'long flags'],
    ['sudo rm -rf /var/log', 'through sudo'],
    ['rm -rf /tmp/scratch ../secrets', 'one temp operand and one that escapes'],
    ['rm -rf "$BUILD_DIR"', 'a target that cannot be resolved before it runs'],
    ['rm -rf /tmp/../etc', 'a traversal that climbs out of /tmp'],
    ['rm -rf ~/Documents', 'the home directory'],
    ['rm -rf /tmp', 'the temp root itself, not something inside it'],
    ['rm -rf -- node_modules', 'operands after the end-of-flags marker'],
    ['npm ci && rm -rf src', 'the second command in a chain'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'rm-recursive');
    });
  }
});

describe('allowed: rm-recursive neighbours', () => {
  const allowed = [
    ['rm package-lock.json', 'a non-recursive delete'],
    ['rm -f dist/bundle.js', 'force without recursion'],
    ['rm -rf /tmp/dare-scratch', 'recursive delete inside /tmp'],
    ['rm -rf /tmp/a /tmp/b', 'several operands, all inside /tmp'],
    ['rm -rf /tmp/scratch 2>/dev/null', 'a redirected fd that is not an operand'],
    ['rm -rf', 'recursive flags with nothing to delete'],
    ['rmdir build', 'a different command whose name starts with rm'],
    ['npm run clean', 'a clean script that does not shell out to rm'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

// ---------------------------------------------------------------------------
// Category 4 — nested dare
// ---------------------------------------------------------------------------

describe('blocked: nested-dare', () => {
  const denied = [
    ['dare', 'the bare command'],
    ['dare "build me a thing"', 'the command with an idea'],
    ['/dare', 'the slash command on its own'],
    ['claude -p "/dare ship it"', 'the slash command handed to a claude child'],
    ['npm test && dare', 'the second command in a chain'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'nested-dare');
    });
  }
});

describe('allowed: nested-dare neighbours', () => {
  const allowed = [
    ['echo "I dare you"', 'the word dare in prose'],
    ['npm test -- test/dare.test.mjs', 'a test file named after the plugin'],
    ['ls /daredevil', 'a path that merely starts with /dare'],
    ['claude -p "summarize the dare design"', 'a claude child that is not a dare run'],
    ['git log --grep=dare', 'searching history for the word'],
    ['cat docs/dare-notes.md', 'a document named after the plugin'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

// ---------------------------------------------------------------------------
// Malformed input fails closed
// ---------------------------------------------------------------------------

describe('blocked: malformed-payload', () => {
  it('denies a payload that is not an object', () => {
    assertDenied('hello', 'malformed-payload');
  });

  it('denies a null payload', () => {
    assertDenied(null, 'malformed-payload');
  });

  it('denies an array payload', () => {
    assertDenied([], 'malformed-payload');
  });

  it('denies a Bash payload with no command', () => {
    const event = loadEvent('pretooluse-bash.json');
    delete event.tool_input.command;
    assertDenied(event, 'malformed-payload');
  });

  it('denies a Bash payload whose command is not a string', () => {
    const event = loadEvent('pretooluse-bash.json');
    event.tool_input.command = 42;
    assertDenied(event, 'malformed-payload');
  });
});

// ---------------------------------------------------------------------------
// Reasons, so a denial explains itself
// ---------------------------------------------------------------------------

describe('deny reasons', () => {
  it('names the ratchet for protected state', () => {
    const result = evaluate(bashEvent('cat .dare/state.json'));
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      'Command references .dare/state.json or .dare/config.json. The ratchet is not editable by the process it constrains (DESIGN.md §6).',
    );
  });

  it('names recovery for a force push', () => {
    const result = evaluate(bashEvent('git push --force'));
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      'Force push is blocked so recovery stays possible (DESIGN.md §6).',
    );
  });

  it('names the resolved target for a recursive rm', () => {
    const result = evaluate(bashEvent('rm -rf node_modules'));
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      `Recursive rm outside the temp directory is blocked: ${path.resolve(FIXTURE_CWD, 'node_modules')} (DESIGN.md §6).`,
    );
  });

  it('names the unresolved target, not the resolved one, when rm cannot be evaluated', () => {
    // Without this the case is indistinguishable from an ordinary out-of-tmp denial:
    // both report rule `rm-recursive`, but only one proves the expansion branch ran.
    const result = evaluate(bashEvent('rm -rf "$BUILD_DIR"'));
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      'Recursive rm target "$BUILD_DIR" cannot be resolved before the command runs; unresolvable targets are denied (DESIGN.md §6).',
    );
  });

  it('names the no-nesting invariant for a nested run', () => {
    const result = evaluate(bashEvent('/dare'));
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      'dare does not spawn dare. Nested runs are blocked at the driver and at the hook (CLAUDE.md invariant, DESIGN.md §13.6).',
    );
  });
});

// ---------------------------------------------------------------------------
// Units the rules are built out of
// ---------------------------------------------------------------------------

describe('isProtectedStatePath', () => {
  const cases = [
    ['.dare/state.json', true],
    ['.dare/config.json', true],
    ['./.dare/state.json', true],
    ['src/../.dare/state.json', true],
    [`${FIXTURE_CWD}/.dare/config.json`, true],
    ['.dare/bloopers.log', false],
    ['.dare/state.json.bak', false],
    ['mydare/state.json', false],
    ['state.json', false],
    ['docs/.dare-notes/state.json', false],
    ['', false],
  ];
  for (const [candidate, expected] of cases) {
    it(`${JSON.stringify(candidate)} -> ${expected}`, () => {
      assert.equal(isProtectedStatePath(String(candidate), FIXTURE_CWD), expected);
    });
  }
});

describe('tokenizeCommand', () => {
  it('splits a chain into one segment per command', () => {
    const { segments } = tokenizeCommand('npm ci && rm -rf src');
    assert.deepStrictEqual(
      segments.map((segment) => segment.map((token) => token.value)),
      [
        ['npm', 'ci'],
        ['rm', '-rf', 'src'],
      ],
    );
  });

  it('strips quotes and keeps the quoted text as one token', () => {
    const { segments } = tokenizeCommand('git commit -m "revert the botched rebase"');
    assert.deepStrictEqual(segments[0].map((token) => token.value), [
      'git',
      'commit',
      '-m',
      'revert the botched rebase',
    ]);
  });

  it('drops redirection targets and the fd that precedes them', () => {
    const { segments } = tokenizeCommand('rm -rf /tmp/scratch 2>/dev/null');
    assert.deepStrictEqual(segments[0].map((token) => token.value), ['rm', '-rf', '/tmp/scratch']);
  });

  it('marks unresolvable operands and collects substitution bodies', () => {
    const { segments, substitutions } = tokenizeCommand('rm -rf "$(cat target.txt)" "$HOME/x"');
    assert.deepStrictEqual(substitutions, ['cat target.txt']);
    assert.deepStrictEqual(
      segments[0].map((token) => ({ value: token.value, hasExpansion: token.hasExpansion })),
      [
        { value: 'rm', hasExpansion: false },
        { value: '-rf', hasExpansion: false },
        { value: '', hasExpansion: true },
        { value: '$HOME/x', hasExpansion: true },
      ],
    );
  });
});

describe('checkBashCommand recurses into substitutions', () => {
  it('denies a destructive command hidden inside $( )', () => {
    const result = checkBashCommand('echo "$(rm -rf /etc)"', FIXTURE_CWD);
    assert.deepStrictEqual(
      result.decision === 'deny' ? { decision: result.decision, rule: result.rule } : { decision: 'allow' },
      { decision: 'deny', rule: 'rm-recursive' },
    );
  });

  it('leaves a harmless substitution alone', () => {
    assert.deepStrictEqual(checkBashCommand('echo "$(git rev-parse HEAD)"', FIXTURE_CWD), { decision: 'allow' });
  });
});

// ---------------------------------------------------------------------------
// The hook contract: stdin in, hookSpecificOutput out, exit 0 either way
// ---------------------------------------------------------------------------

describe('renderDecision', () => {
  it('emits a deny block tagged with the rule that fired', () => {
    const output = renderDecision({ decision: 'deny', rule: 'git-history', reason: 'because.' });
    assert.deepStrictEqual(JSON.parse(output), {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '[dare:git-history] because.',
      },
    });
  });

  it('emits nothing on allow, leaving the rest of the permission stack alone', () => {
    assert.equal(renderDecision({ decision: 'allow' }), '');
  });
});

describe('guard.mjs as a process', () => {
  /**
   * @param {string} stdin
   * @returns {Promise<{ code: number, stdout: string }>}
   */
  async function run(stdin) {
    const child = execFileAsync('node', [GUARD]);
    child.child.stdin?.end(stdin);
    try {
      const { stdout } = await child;
      return { code: 0, stdout };
    } catch (error) {
      const failure = /** @type {{ code?: number, stdout?: string }} */ (error);
      return { code: failure.code ?? 1, stdout: failure.stdout ?? '' };
    }
  }

  it('denies over stdin and still exits 0', async () => {
    const { code, stdout } = await run(JSON.stringify(bashEvent('git push --force')));
    assert.equal(code, 0);
    assert.deepStrictEqual(JSON.parse(stdout), {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '[dare:git-history] Force push is blocked so recovery stays possible (DESIGN.md §6).',
      },
    });
  });

  it('says nothing and exits 0 for an allowed call', async () => {
    const { code, stdout } = await run(JSON.stringify(bashEvent('git push origin main')));
    assert.equal(code, 0);
    assert.equal(stdout, '');
  });

  it('fails closed on a payload that is not valid JSON', async () => {
    const raw = readFileSync(new URL('pretooluse-malformed.txt', FIXTURE_DIR), 'utf8');
    const { code, stdout } = await run(raw);
    assert.equal(code, 0);
    assert.deepStrictEqual(JSON.parse(stdout), {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          '[dare:malformed-payload] PreToolUse payload was not valid JSON. A guard that fails open is not a guard.',
      },
    });
  });

  it('fails closed on empty stdin', async () => {
    const { code, stdout } = await run('');
    assert.equal(code, 0);
    assert.equal(
      JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason,
      '[dare:malformed-payload] PreToolUse payload was not valid JSON. A guard that fails open is not a guard.',
    );
  });
});
