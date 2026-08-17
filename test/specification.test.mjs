/**
 * Tests for the captured specification revision (DESIGN.md §4, REVIEW F12).
 *
 * **Stable ids do not preserve stable intent.** The Driver derived `requiredIds` from `PRD.md`
 * once and then kept only those strings, while the Builder held unrestricted repository writes and
 * the cold Panel was told to read the *live* file. Codex replaced the text of `PRD-1.1` with an
 * easier requirement, kept the id, and watched gates pass, the report pass, and `driveRun` return
 * `SHIPPED` — an independent panel faithfully certifying the wrong specification.
 *
 * The digest is of the exact bytes, because F12's own acceptance line is "changes one byte", and a
 * byte that no parser would notice still changes the document a reviewer reads.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  SPECIFICATION_FILE,
  SpecificationError,
  captureSpecification,
  readSpecification,
  specificationDigest,
  verifySpecification,
} from '../scripts/specification.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const PRD = '# Thing\n\n## Requirements\n\nPRD-1.1 Admin routes reject a non-admin session.\n';

/** @returns {{ root: string, meeseeksDir: string }} */
function makeTarget(contents = PRD) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-spec-'));
  temporaryDirs.push(root);
  const meeseeksDir = path.join(root, '.meeseeks');
  mkdirSync(meeseeksDir, { recursive: true });
  writeFileSync(path.join(root, 'PRD.md'), contents, 'utf8');
  return { root, meeseeksDir };
}

describe('specificationDigest', () => {
  it('is stable for the same bytes', () => {
    assert.equal(specificationDigest(PRD), specificationDigest(PRD));
  });

  it('changes when one byte changes, which is the whole requirement', () => {
    assert.notEqual(specificationDigest(PRD), specificationDigest(`${PRD} `));
  });

  it('names its algorithm, so a later change of one is visible rather than silent', () => {
    assert.match(specificationDigest(PRD), /^sha256:[0-9a-f]{64}$/);
  });
});

describe('captureSpecification', () => {
  it('records the file, the digest and the size, and hands back the bytes it digested', () => {
    const { root, meeseeksDir } = makeTarget();
    const captured = captureSpecification({ meeseeksDir, root, now: () => '2026-08-17T00:00:00.000Z' });
    assert.equal(captured.contents, PRD);
    assert.deepStrictEqual(captured.revision, {
      version: 1,
      file: 'PRD.md',
      digest: specificationDigest(PRD),
      bytes: Buffer.byteLength(PRD, 'utf8'),
      capturedAt: '2026-08-17T00:00:00.000Z',
    });
  });

  // The bytes come back from the capture so the caller derives requirement ids from the document
  // it just digested. Two reads of one path is how an identity becomes a coincidence.
  it('writes a record a later process can read back', () => {
    const { root, meeseeksDir } = makeTarget();
    const captured = captureSpecification({ meeseeksDir, root });
    assert.deepStrictEqual(readSpecification(meeseeksDir), captured.revision);
    assert.equal(JSON.parse(readFileSync(path.join(meeseeksDir, SPECIFICATION_FILE), 'utf8')).digest, captured.revision.digest);
  });

  it('refuses a specification that is not there, rather than capturing nothing', () => {
    const { root, meeseeksDir } = makeTarget();
    rmSync(path.join(root, 'PRD.md'));
    assert.throws(() => captureSpecification({ meeseeksDir, root }), SpecificationError);
  });
});

describe('readSpecification is fail-closed', () => {
  it('throws when no revision was ever captured', () => {
    const { meeseeksDir } = makeTarget();
    assert.throws(() => readSpecification(meeseeksDir), /missing/);
  });

  it('throws on a record that will not parse, rather than reporting no drift', () => {
    const { meeseeksDir } = makeTarget();
    writeFileSync(path.join(meeseeksDir, SPECIFICATION_FILE), '{not json', 'utf8');
    assert.throws(() => readSpecification(meeseeksDir), /could not be read as JSON/);
  });

  it('throws on a record that names no digest', () => {
    const { meeseeksDir } = makeTarget();
    writeFileSync(path.join(meeseeksDir, SPECIFICATION_FILE), JSON.stringify({ file: 'PRD.md' }), 'utf8');
    assert.throws(() => readSpecification(meeseeksDir), /establishes\s+no revision|no specification file and digest/);
  });
});

describe('verifySpecification', () => {
  it('passes an unchanged specification', () => {
    const { root, meeseeksDir } = makeTarget();
    captureSpecification({ meeseeksDir, root });
    const checked = verifySpecification({ meeseeksDir, root });
    assert.equal(checked.ok, true, checked.detail);
    assert.equal(checked.digest, specificationDigest(PRD));
  });

  // The reproduction, in one assertion: the id survives and the intent does not.
  it('fails when a requirement keeps its id and changes its text', () => {
    const { root, meeseeksDir } = makeTarget();
    captureSpecification({ meeseeksDir, root });
    writeFileSync(
      path.join(root, 'PRD.md'),
      '# Thing\n\n## Requirements\n\nPRD-1.1 Admin routes exist.\n',
      'utf8',
    );
    const checked = verifySpecification({ meeseeksDir, root });
    assert.equal(checked.ok, false);
    assert.match(checked.detail, /has changed since this run captured it/);
  });

  it('fails on a single trailing byte, because a parser noticing nothing is not the test', () => {
    const { root, meeseeksDir } = makeTarget();
    captureSpecification({ meeseeksDir, root });
    writeFileSync(path.join(root, 'PRD.md'), `${PRD} `, 'utf8');
    assert.equal(verifySpecification({ meeseeksDir, root }).ok, false);
  });

  it('fails when the specification was deleted', () => {
    const { root, meeseeksDir } = makeTarget();
    captureSpecification({ meeseeksDir, root });
    rmSync(path.join(root, 'PRD.md'));
    const checked = verifySpecification({ meeseeksDir, root });
    assert.equal(checked.ok, false);
    assert.match(checked.detail, /can no longer be read/);
  });

  it('tells the operator what to do about drift rather than only that it happened', () => {
    const { root, meeseeksDir } = makeTarget();
    captureSpecification({ meeseeksDir, root });
    writeFileSync(path.join(root, 'PRD.md'), `${PRD}PRD-1.2 Something else.\n`, 'utf8');
    assert.match(verifySpecification({ meeseeksDir, root }).detail, /start a new run/);
  });

  it('throws when there is no captured revision to compare against', () => {
    const { root, meeseeksDir } = makeTarget();
    assert.throws(() => verifySpecification({ meeseeksDir, root }), SpecificationError);
  });

  // The benign neighbour, and F12's second acceptance line: only the authoritative specification is
  // bound. A builder writing documentation, source, or anything else must not trip this.
  it('does not care about any file other than the one it captured', () => {
    const { root, meeseeksDir } = makeTarget();
    captureSpecification({ meeseeksDir, root });
    writeFileSync(path.join(root, 'README.md'), '# Docs\n\nRewritten entirely.\n', 'utf8');
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'architecture.md'), '# Architecture\n', 'utf8');
    assert.equal(verifySpecification({ meeseeksDir, root }).ok, true);
  });

  it('binds whichever file it was told to capture, not the name PRD.md', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-spec-alt-'));
    temporaryDirs.push(root);
    const meeseeksDir = path.join(root, '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(root, 'SPEC.md'), PRD, 'utf8');
    captureSpecification({ meeseeksDir, root, file: 'SPEC.md' });
    writeFileSync(path.join(root, 'SPEC.md'), `${PRD}more\n`, 'utf8');
    const checked = verifySpecification({ meeseeksDir, root });
    assert.equal(checked.ok, false);
    assert.match(checked.detail, /SPEC\.md/);
  });
});
