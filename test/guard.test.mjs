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
 * The environment of a builder: the marker the driver stamps on every child it spawns.
 * The default for these tables, because a run is the process the guard exists to constrain.
 */
const IN_RUN = { DARE_RUNNING: '1' };

/** The environment of a person at a keyboard, who is not the accused. */
const OPERATOR = /** @type {Record<string, string | undefined>} */ ({});

/**
 * Decision without the prose, so tables assert the rule that fired rather than its wording.
 * @param {unknown} event
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ decision: string, rule?: string }}
 */
function ruling(event, env = IN_RUN) {
  const result = evaluate(event, { env });
  return result.decision === 'deny' ? { decision: 'deny', rule: result.rule } : { decision: 'allow' };
}

/**
 * @param {unknown} event
 * @param {string} rule
 * @param {Record<string, string | undefined>} [env]
 */
function assertDenied(event, rule, env = IN_RUN) {
  assert.deepStrictEqual(ruling(event, env), { decision: 'deny', rule });
}

/**
 * @param {unknown} event
 * @param {Record<string, string | undefined>} [env]
 */
function assertAllowed(event, env = IN_RUN) {
  assert.deepStrictEqual(ruling(event, env), { decision: 'allow' });
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

  // Lesson memory is driver-owned (DESIGN.md §13.8). A builder that can edit the memory it
  // is handed is not constrained by it: it could write itself whatever instruction it
  // preferred and receive that back as evidence on the next iteration.
  const deniedLessons = [
    ["echo '[]' > .dare/lessons.json", 'redirect over the lesson store'],
    ['rm .dare/lessons.json', 'deleting the lesson store'],
    ["cd .dare && echo '{}' > lessons.json", 'chdir first, protected name second'],
    ['bash -c "cat .dare/lessons.json"', 'reaching it through a wrapped shell'],
  ];
  for (const [command, label] of deniedLessons) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }

  it('denies a Write to .dare/lessons.json', () => {
    assertDenied(pathEvent('pretooluse-write.json', 'file_path', '.dare/lessons.json'), 'protected-state');
  });

  it('denies an Edit to the absolute .dare/lessons.json', () => {
    assertDenied(pathEvent('pretooluse-edit.json', 'file_path', `${FIXTURE_CWD}/.dare/lessons.json`), 'protected-state');
  });
});

describe('protected-state is scoped to a run, not to the plugin being installed', () => {
  // The rule protects these files from the run they constrain. Applied unconditionally it
  // also locked out the operator, in every session, forever: `.dare/config.json` could not
  // be changed from inside Claude Code at all, and HANDOFF.md's own instruction to delete a
  // useless `.dare/lessons.json` could not be carried out. The answer to that is not to send
  // the human to a terminal.

  const protectedCommands = [
    "echo '{}' > .dare/state.json",
    'cat .dare/config.json',
    'rm .dare/lessons.json',
    "cd .dare && echo '{}' > config.json",
  ];

  for (const command of protectedCommands) {
    it(`denies inside a run: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state', IN_RUN);
    });

    it(`allows the same command outside a run: ${command}`, () => {
      assertAllowed(bashEvent(command), OPERATOR);
    });
  }

  for (const target of ['.dare/config.json', '.dare/state.json', '.dare/lessons.json']) {
    it(`lets an operator Write ${target}, and refuses a run the same Write`, () => {
      const event = pathEvent('pretooluse-write.json', 'file_path', target);
      assertAllowed(event, OPERATOR);
      assertDenied(event, 'protected-state', IN_RUN);
    });
  }

  it('treats an empty marker as outside a run, since that is how an unset variable arrives', () => {
    assertAllowed(bashEvent('cat .dare/config.json'), { DARE_RUNNING: '' });
  });

  it('still refuses the other three categories to an operator', () => {
    // Scoping applies to protected-state alone. History destruction, recursive removal and
    // nested runs do not become reasonable because a human asked for them in this session.
    assertDenied(bashEvent('git push --force origin main'), 'git-history', OPERATOR);
    assertDenied(bashEvent('rm -rf /home/someone/project'), 'rm-recursive', OPERATOR);
    assertDenied(bashEvent('/dare "build me a thing"'), 'nested-dare', OPERATOR);
  });

  it('defaults to the deny side when a caller says nothing about where it is', () => {
    // checkBashCommand is exported. A caller that forgets the third argument must get the
    // stricter answer; a guard whose default is "allow" is a guard with an off switch.
    const decision = checkBashCommand('cat .dare/config.json', FIXTURE_CWD);
    assert.equal(decision.decision, 'deny');
  });
});

describe('allowed: protected-state neighbours', () => {
  // The protected set is positional — inside a `.dare` directory — so the neighbours that
  // matter are names that merely resemble one. Blocking these would make the guard a
  // nuisance; blocking nothing would make it decorative.
  const allowed = [
    ['cat package.json', 'an unrelated json file'],
    ['cat tsconfig.json', 'a name that merely ends in config.json'],
    ['cat lessons.json', 'a lessons file that is not inside .dare'],
    ["echo '{}' > src/state.json", 'an application file that happens to be called state.json'],
    ['cat .darerc', 'a dotfile whose name only starts with .dare'],
    ['npm run dare-report', 'a script name containing dare'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }

  const allowedWrites = [
    ['pretooluse-write.json', 'file_path', 'src/state.json'],
    ['pretooluse-write.json', 'file_path', 'docs/config.json'],
    ['pretooluse-write.json', 'file_path', '.darerc'],
    ['pretooluse-write.json', 'file_path', 'vendor/mydare/state.json'],
    ['pretooluse-write.json', 'file_path', 'docs/.dare-notes/state.json'],
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
// Category 1, widened — the whole .dare tree, not an enumerated list
// ---------------------------------------------------------------------------

describe('blocked: every mutation under .dare/', () => {
  // The enumerated list this replaced covered state.json, config.json and lessons.json.
  // Everything else the driver owns was writable by the process it was meant to constrain.
  const deniedWrites = [
    ['.dare/state.json', 'the ratchet itself'],
    ['.dare/config.json', 'the configuration'],
    ['.dare/lessons.json', 'the lesson store'],
    ['.dare/red-evidence.json', 'the RED evidence'],
    ['.dare/test-report.json', 'the report the ratchet reads'],
    ['.dare/e2e-report.json', 'the browser report'],
    ['.dare/briefs/iter-004.md', 'an archived build brief, nested a directory deep'],
    ['.dare/bloopers.log', 'the blooper reel'],
    ['.dare/run.json', 'a driver-owned artifact that did not exist when the list was written'],
    ['.dare/state.json.bak', 'a backup beside the ratchet'],
    ['./.dare/state.json', 'a path with a leading dot segment'],
    ['src/../.dare/state.json', 'a path that walks back into the directory'],
  ];
  for (const [filePath, label] of deniedWrites) {
    it(`denies writing ${label}: ${filePath}`, () => {
      assertDenied(pathEvent('pretooluse-write.json', 'file_path', filePath), 'protected-state');
    });
  }

  for (const [fixture, key] of [
    ['pretooluse-edit.json', 'file_path'],
    ['pretooluse-notebook-edit.json', 'notebook_path'],
  ]) {
    it(`denies ${fixture} against .dare/red-evidence.json`, () => {
      assertDenied(pathEvent(fixture, key, '.dare/red-evidence.json'), 'protected-state');
    });
  }

  const deniedCommands = [
    ['ls .dare', 'listing it'],
    ['cat .dare/bloopers.log', 'reading through the shell, which cannot be told from writing'],
    ['rm .dare/red-evidence.json', 'deleting evidence'],
    ['mv .dare/state.json /tmp/x', 'moving the ratchet out of the way'],
    ['cp /tmp/forged.json .dare/red-evidence.json', 'copying a forgery over it'],
    ["sed -i 's/a/b/' .dare/state.json", 'editing in place'],
    ['echo "{}" | tee .dare/red-evidence.json', 'writing through a pipe'],
    ['cd .dare && echo {} > red-evidence.json', 'never spelling the full path'],
    ['git add .dare/bloopers.log', 'staging it'],
    ['ls .dare && cat tsconfig.json', 'hiding it in a chain'],
    ['bash -c "rm .dare/state.json"', 'wrapping it in a shell'],
  ];
  for (const [command, label] of deniedCommands) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }

  it('leaves the whole tree alone outside a run, since the operator owns their repository', () => {
    // The scoping rule is unchanged by the widening: this is a limit on the run, not on the
    // person who owns the files. HANDOFF.md tells an operator to delete a useless lesson
    // store, and that instruction has to remain possible from inside Claude Code.
    assertAllowed(pathEvent('pretooluse-write.json', 'file_path', '.dare/red-evidence.json'), OPERATOR);
    assertAllowed(bashEvent('rm .dare/lessons.json'), OPERATOR);
  });
});

describe('RED evidence cannot be forged by the process it judges', () => {
  // The regression this exists for: `.dare/red-evidence.json` records which tests were ever
  // observed failing. RED-before-GREEN says a test with no red history does not count toward
  // the ratchet. A builder that can write this file can award itself that history, and the
  // rule stops meaning anything — silently, because the forged file parses.
  const forgeries = [
    ['pretooluse-write.json', 'file_path', '.dare/red-evidence.json'],
    ['pretooluse-edit.json', 'file_path', '.dare/red-evidence.json'],
    ['pretooluse-write.json', 'file_path', './.dare/red-evidence.json'],
    ['pretooluse-write.json', 'file_path', 'src/../.dare/red-evidence.json'],
  ];
  for (const [fixture, key, filePath] of forgeries) {
    it(`refuses ${fixture} -> ${filePath}`, () => {
      assertDenied(pathEvent(fixture, key, filePath), 'protected-state');
    });
  }

  for (const command of [
    'echo \'{"seenFailing":["test/a.test.js::works"]}\' > .dare/red-evidence.json',
    'cat forged.json > .dare/red-evidence.json',
    'python3 -c "open(\'.dare/red-evidence.json\',\'w\').write(\'{}\')"',
  ]) {
    it(`refuses the shell route: ${command.slice(0, 48)}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }
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

describe('blocked: commands hidden inside a shell wrapper', () => {
  // Every rule keys off the command word, and `bash -c "..."` makes that word `bash`.
  // The wrapped command was invisible to all four rules, not only the nesting one.
  const denied = [
    ['bash -c "rm -rf /etc"', 'rm-recursive'],
    ["sh -c 'git push --force'", 'git-history'],
    ['bash -c "cat .dare/config.json"', 'protected-state'],
    ["sh -c '/dare'", 'nested-dare'],
    ['zsh -c "rm -rf node_modules"', 'rm-recursive'],
  ];
  for (const [command, rule] of denied) {
    it(`denies ${command}`, () => {
      assertDenied(bashEvent(command), rule);
    });
  }

  it('leaves a harmless wrapped command alone', () => {
    assertAllowed(bashEvent('bash -c "npm test"'));
  });
});

describe('allowed: nested-dare neighbours', () => {
  const allowed = [
    // Prose is not an invocation. The first version denied the slash command anywhere in
    // the line, and it caught a heredoc that mentioned the command in a code comment —
    // while this plugin was installed, on its own author, editing this file.
    ['echo "run /dare to start a build"', 'the slash command quoted inside prose'],
    ['git commit -m "document the /dare command"', 'the slash command in a commit message'],
    ['grep -rn "/dare" docs/', 'searching the docs for the slash command'],
    ['printf "%s\\n" "usage: /dare <path>"', 'the slash command inside usage text'],
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
  it('names the runtime directory, and points at the route that still works', () => {
    const result = evaluate(bashEvent('cat .dare/state.json'), { env: IN_RUN });
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      'Command references the .dare runtime directory. It holds the ratchet, the configuration, the RED ' +
        'evidence, the archived briefs and the test reports — the state and evidence a run is judged by, which ' +
        'the run does not write (DESIGN.md §6). Read them with the Read tool, which is not hooked.',
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
    // Everything under the directory, at any depth, including names not yet invented.
    ['.dare/bloopers.log', true],
    ['.dare/red-evidence.json', true],
    ['.dare/state.json.bak', true],
    ['.dare/briefs/iter-004.md', true],
    ['.dare/reports/nested/deep/unit.json', true],
    ['.dare', true],
    // Names that only resemble one. Matching is on whole segments.
    ['mydare/state.json', false],
    ['state.json', false],
    ['docs/.dare-notes/state.json', false],
    ['.darerc', false],
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
   * @param {Record<string, string | undefined>} [env]
   * @returns {Promise<{ code: number, stdout: string }>}
   */
  async function run(stdin, env) {
    // The encoding is pinned because supplying options at all selects the overload that
    // would otherwise hand back a Buffer.
    const child = execFileAsync('node', [GUARD], { encoding: 'utf8', ...(env === undefined ? {} : { env }) });
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

  it('reads the run marker from its own environment, which is the only way it arrives', async () => {
    // The unit tables inject `env`; production does not. This is that seam. The driver sets
    // DARE_RUNNING on the `claude` child and the hook inherits it - confirmed live against
    // claude 2.1.226 before this scoping was written, not assumed.
    const payload = JSON.stringify(bashEvent('cat .dare/config.json'));

    const inRun = await run(payload, { ...process.env, DARE_RUNNING: '1' });
    assert.equal(inRun.code, 0);
    assert.equal(
      JSON.parse(inRun.stdout).hookSpecificOutput.permissionDecision,
      'deny',
      'a builder was allowed to read the config that constrains it',
    );

    const operator = { ...process.env };
    delete operator.DARE_RUNNING;
    const outsideRun = await run(payload, operator);
    assert.equal(outsideRun.code, 0);
    assert.equal(outsideRun.stdout, '', 'an operator was locked out of their own configuration');
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
