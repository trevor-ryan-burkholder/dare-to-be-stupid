/**
 * Install smoke test (DESIGN.md §7).
 *
 * A plugin manifest fails in one particular way: it names a file that is not there, or
 * that used to be there under a different name. Nothing catches that until someone runs
 * `/plugin install` and gets a command that does not exist — so every path any manifest
 * declares is resolved here against the filesystem.
 *
 * This is also where the plugin's own invariants get a last check: the guard hook must be
 * registered for the tools that can actually write to the ratchet, and the command must
 * run preflight before it runs the driver.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** @param {string} relative */
function read(relative) {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

/** @param {string} relative */
function readJson(relative) {
  return JSON.parse(read(relative));
}

const PLUGIN = readJson('.claude-plugin/plugin.json');
const MARKETPLACE = readJson('.claude-plugin/marketplace.json');
const COMMAND = read('commands/dare.md');
const HOOKS = readJson('hooks/hooks.json');
const PACKAGE = readJson('package.json');

describe('plugin.json', () => {
  it('declares the fields the loader needs', () => {
    assert.equal(PLUGIN.name, 'dare-to-be-stupid');
    assert.equal(typeof PLUGIN.version, 'string');
    assert.equal(typeof PLUGIN.description, 'string');
    assert.equal(PLUGIN.license, 'MIT');
  });

  it('keeps its version in step with package.json', () => {
    assert.equal(PLUGIN.version, PACKAGE.version);
  });

  it('declares metadata only, and no components', () => {
    // Declaring commands/hooks/outputStyles alongside a marketplace entry made the plugin
    // fail to load. Every plugin on a working install declares metadata only and lets the
    // loader discover components from the conventional directories - which it does: the
    // slash command and the guard hook both registered even while the manifest errored.
    for (const key of ['commands', 'hooks', 'outputStyles', 'agents', 'skills', 'mcpServers']) {
      assert.equal(key in PLUGIN, false, `plugin.json declares ${key}; let discovery find it`);
    }
  });

  it('keeps every component where the loader looks for it by convention', () => {
    for (const relative of ['commands/dare.md', 'hooks/hooks.json', 'output-styles/junkion.md']) {
      assert.equal(existsSync(path.join(ROOT, relative)), true, `component missing: ${relative}`);
    }
  });
});

describe('marketplace.json', () => {
  it('resolves the plugin from this repository', () => {
    assert.equal(MARKETPLACE.plugins.length, 1);
    assert.equal(MARKETPLACE.plugins[0].name, PLUGIN.name);
    assert.equal(MARKETPLACE.plugins[0].source, './');
  });

  it('names an owner, so the marketplace entry is attributable', () => {
    assert.equal(typeof MARKETPLACE.owner.name, 'string');
    assert.equal(MARKETPLACE.owner.name.length > 0, true);
  });

  it('says out loud that this is pre-production only', () => {
    assert.equal(MARKETPLACE.plugins[0].description.toLowerCase().includes('pre-production'), true);
  });
});

describe('the guard hook registration', () => {
  const entry = HOOKS.hooks.PreToolUse[0];

  it('runs guard.mjs through node, from the plugin root', () => {
    assert.equal(entry.hooks[0].type, 'command');
    assert.equal(entry.hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"');
  });

  it('matches every tool that could write to the ratchet, not only Bash', () => {
    // DESIGN.md §7's comment says "PreToolUse on Bash", but the invariant is that a
    // builder cannot write .dare/state.json — which is unenforceable against the Write
    // tool if the matcher only covers Bash.
    for (const tool of ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      assert.equal(entry.matcher.split('|').includes(tool), true, `matcher does not cover ${tool}`);
    }
  });
});

describe('the /dare command', () => {
  it('has frontmatter with a description and an argument hint', () => {
    assert.equal(COMMAND.startsWith('---\n'), true);
    const frontmatter = COMMAND.slice(4, COMMAND.indexOf('\n---', 4));
    assert.equal(frontmatter.includes('description:'), true);
    assert.equal(frontmatter.includes('argument-hint:'), true);
  });

  it('runs preflight before it runs the driver', () => {
    const preflightAt = COMMAND.indexOf('scripts/init.mjs');
    const driverAt = COMMAND.indexOf('scripts/driver.mjs');
    assert.equal(preflightAt > -1, true, 'command never runs preflight');
    assert.equal(driverAt > -1, true, 'command never runs the driver');
    assert.equal(preflightAt < driverAt, true, 'preflight must come first');
  });

  it('refers to both scripts through CLAUDE_PLUGIN_ROOT, so it works from any cwd', () => {
    assert.equal(COMMAND.includes('"${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"'), true);
    assert.equal(COMMAND.includes('"${CLAUDE_PLUGIN_ROOT}/scripts/driver.mjs"'), true);
  });

  it('tells the launcher to stop on a failed preflight rather than work around it', () => {
    assert.equal(COMMAND.includes('do not offer to work around'), true);
  });

  it('forbids the launcher from building anything itself', () => {
    assert.equal(COMMAND.includes('Do not build anything yourself'), true);
  });
});

describe('every file the plugin depends on is present', () => {
  const required = [
    'scripts/init.mjs',
    'scripts/driver.mjs',
    'scripts/ratchet.mjs',
    'scripts/config.mjs',
    'scripts/preflight.mjs',
    'scripts/security-scan.mjs',
    'scripts/plugins.mjs',
    'scripts/style.mjs',
    'hooks/guard.mjs',
    'templates/prd-author.md',
    'templates/architect.md',
    'templates/builder-system.md',
    'templates/reviewer-system.md',
  ];
  for (const relative of required) {
    it(`${relative} exists`, () => {
      assert.equal(existsSync(path.join(ROOT, relative)), true);
    });
  }
});

describe('the plugin ships no runtime dependencies', () => {
  it('declares none', () => {
    assert.equal(PACKAGE.dependencies, undefined);
  });

  it('imports only node: builtins and its own files', () => {
    // CLAUDE.md hard constraint 1. A runtime dependency would have to be installed
    // wherever the plugin is loaded from, which is a cache directory nobody runs npm in.
    for (const relative of [
      'scripts/init.mjs',
      'scripts/driver.mjs',
      'scripts/ratchet.mjs',
      'scripts/config.mjs',
      'scripts/preflight.mjs',
      'scripts/security-scan.mjs',
      'scripts/plugins.mjs',
      'scripts/style.mjs',
      'hooks/guard.mjs',
    ]) {
      const imports = [...read(relative).matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((match) => match[1]);
      for (const specifier of imports) {
        const allowed = specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../');
        assert.equal(allowed, true, `${relative} imports ${specifier}, which is neither a node: builtin nor local`);
      }
    }
  });
});
