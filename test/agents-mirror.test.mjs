/**
 * `AGENTS.md` must stay a verbatim copy of `CLAUDE.md`.
 *
 * The two files are one document served to two readers: Claude Code reads `CLAUDE.md`, Codex and
 * other agent tooling read `AGENTS.md`. A rule that lives in only one of them binds only one
 * reader, which is exactly how the external review protocol came to have a termination condition
 * that the reviewer it constrains could not see.
 *
 * `AGENTS.md` records that it already drifted eleven lines behind once, and that a previous
 * attempt to "translate" it by substituting Claude->Codex corrupted factual literals — the binary
 * `claude -p`, the paths `.claude-plugin/plugin.json` and `~/.claude/plugins/cache`. Facts about
 * the host do not change with the reader, so the mirror is byte-exact rather than adapted, and the
 * only permitted difference is the leading HTML comment that says so.
 *
 * This is a test rather than a tool because drift is silent: nothing fails, both files parse, and
 * the divergence is only discovered when two agents act on different rules.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const claudeMd = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
const agentsMd = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');

/** The one permitted difference: a leading HTML comment block and the blank line after it. */
const HEADER = /^<!--[\s\S]*?-->\n\n/;

describe('AGENTS.md mirrors CLAUDE.md', () => {
  it('opens with the comment that identifies it as the mirror', () => {
    // Destructured to a string rather than kept as a possibly-null match: `notEqual(x, null)`
    // names exactly one value and is a legal assertion here, but it does not narrow the type, and
    // the alternative that does narrow is `ok()`, which accepts a whole class of values.
    const [header = ''] = agentsMd.match(HEADER) ?? [];
    assert.notEqual(header, '', 'AGENTS.md must open with an HTML comment naming it the mirror');
    assert.match(header, /mirror of CLAUDE\.md/);
    assert.match(header, /Do not edit it directly/);
  });

  it('is byte-identical to CLAUDE.md once that comment is removed', () => {
    assert.equal(
      agentsMd.replace(HEADER, ''),
      claudeMd,
      'AGENTS.md has drifted from CLAUDE.md. Edit CLAUDE.md, then re-copy: ' +
        'keep the leading comment and replace everything after it with CLAUDE.md verbatim.',
    );
  });

  it('carries the review termination rule, so the reviewer it constrains can read it', () => {
    // Named explicitly rather than left to the byte comparison: this clause exists because the
    // rule was unreadable by Codex for as long as it lived only in CLAUDE.md, and a future edit
    // that drops it from both files would satisfy a mirror check while restoring the defect.
    for (const source of [claudeMd, agentsMd]) {
      assert.match(source, /A pass is ACCEPTED when no HIGH finding is open against the reviewed baseline/);
      assert.match(source, /\*\*HIGH blocks acceptance\. MEDIUM does not\.\*\*/);
      assert.match(source, /A pass reviews forward from the last accepted baseline\*\*/);
    }
  });
});
