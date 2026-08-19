/**
 * The .NET toolchain (DESIGN.md §3.8).
 *
 * **Every command in this file was executed against a real SDK before it was written down.**
 * That is not diligence for its own sake; it is the specific warning `HANDOFF.md` carried for
 * two versions — *"the registry now makes a wrong adapter easy to add and green. Every
 * structural test would pass on argv nobody has ever run."* The contract tests check that an
 * operation returns a command, not that the command does anything. So they cannot catch a
 * flag that does not exist, and they cannot catch the failure mode below, which is worse.
 *
 * Verified against `dotnet 8.0.423`, SDK `8.0.423`, runtimes `Microsoft.NETCore.App 8.0.29`
 * and `Microsoft.AspNetCore.App 8.0.29`, on a scaffolded solution with a class library and an
 * xunit test project.
 *
 * ## The trap this adapter exists to avoid
 *
 * The obvious command for `security-audit` is `dotnet list package --vulnerable`. It is
 * wrong, and only running it says so:
 *
 * ```
 * > System.Net.Http   4.3.0   4.3.0   High   https://github.com/advisories/GHSA-7jgj-8wvc-jh57
 * exit 0
 * ```
 *
 * It found a **High** severity advisory and **exited zero**. Wired as a gate it would report a
 * clean pass on every vulnerable project forever — the exact shape of Stryker's missing
 * threshold (§4.4), arriving through a different door. Gates read exit codes, so a command
 * that never sets one is not a gate, it is a log line.
 *
 * What does work is NuGet's audit, promoted to an error on the command line so the project
 * cannot opt out of it: `dotnet restore --force -warnaserror:NU1901,NU1902,NU1903,NU1904`.
 * Measured in both directions — **exit 1** with `error NU1903` on the vulnerable project, and
 * **exit 0** once the package was removed. A gate that cannot fail and a gate that always
 * fails are equally useless, so both halves were checked.
 *
 * Note the syntax. `-p:WarningsAsErrors=NU1901,NU1902` looks equivalent and is not: MSBuild
 * rejects it with `MSB1006: Property is not valid`, and **that error also exits 1**, which
 * reads exactly like the audit firing. It was misread as success here once, before the clean
 * project was tried and failed too.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { command, notApplicable } from './shared.mjs';

/** Where the unit runner's report is written. `.trx` is the format `--logger trx` produces. */
export const TRX_REPORT = 'unit.trx';

/** How deep to look for a project file before giving up. */
const DETECT_DEPTH = 2;

/** Directories that hold build output or tooling rather than source. */
const SKIP_DIRS = new Set(['bin', 'obj', 'node_modules']);

/**
 * Every child directory worth descending into.
 *
 * @param {import('node:fs').Dirent[]} entries
 * @returns {import('node:fs').Dirent[]}
 */
function walkable(entries) {
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name));
}

/**
 * The first solution or project file, breadth-first from the root.
 *
 * A solution wins over a project because it is what `dotnet build` and `dotnet test` operate
 * on when both are present, and because a repository with several projects has one solution
 * and many `.csproj`. Depth is bounded: `src/Foo/Foo.csproj` is the conventional layout, and
 * anything deeper is more likely to be a fixture or a sample than the build.
 *
 * @param {string} root
 * @param {string} [prefix]
 * @param {number} [depth]
 * @returns {string | null} a repository-relative path, or null
 */
export function findProjectFile(root, prefix = '', depth = 0) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const solution = files.find((name) => name.endsWith('.sln'));
  if (solution !== undefined) return prefix === '' ? solution : `${prefix}/${solution}`;
  const project = files.find((name) => name.endsWith('.csproj'));
  if (project !== undefined) return prefix === '' ? project : `${prefix}/${project}`;
  if (depth >= DETECT_DEPTH) return null;
  for (const directory of walkable(entries)) {
    const found = findProjectFile(
      path.join(root, directory.name),
      prefix === '' ? directory.name : `${prefix}/${directory.name}`,
      depth + 1,
    );
    if (found !== null) return found;
  }
  return null;
}

/**
 * Project files under `root` that build an executable rather than a library.
 *
 * `<OutputType>Exe</OutputType>` is the marker, verified on a scaffolded console project; a
 * class library carries no `OutputType` element at all.
 *
 * @param {string} root
 * @param {string} [prefix]
 * @param {number} [depth]
 * @returns {string[]} repository-relative paths, sorted
 */
export function executableProjects(root, prefix = '', depth = 0) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  /** @type {string[]} */
  const found = [];
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith('.csproj')) continue;
    try {
      if (/<OutputType>\s*Exe\s*<\/OutputType>/i.test(readFileSync(path.join(root, entry.name), 'utf8'))) {
        found.push(relative);
      }
    } catch {
      continue;
    }
  }
  if (depth < DETECT_DEPTH) {
    for (const directory of walkable(entries)) {
      found.push(
        ...executableProjects(
          path.join(root, directory.name),
          prefix === '' ? directory.name : `${prefix}/${directory.name}`,
          depth + 1,
        ),
      );
    }
  }
  return found.sort();
}

/** @type {import('./index.mjs').Toolchain} */
export const dotnetToolchain = {
  name: 'dotnet',

  /**
   * @param {string} root
   * @returns {string | null}
   */
  detect(root) {
    const found = findProjectFile(root);
    return found === null ? null : `file ${found}`;
  },

  operations: {
    // Verified exit 0. Not gated, for the same reason `npm ci` is not: it is in the contract
    // because a toolchain that cannot express "restore dependencies" cannot describe this
    // stack at all, and running it every iteration would add time without adding evidence.
    restore: () => command(['dotnet', 'restore']),

    // Verified exit 0 on the scaffolded solution.
    build: () => command(['dotnet', 'build']),

    // Verified both directions: exit 0 on formatted source, **exit 2** on a file with
    // deliberate whitespace damage, reporting `error WHITESPACE`. Non-zero is all a gate
    // needs, but the value is recorded because 2 rather than 1 is the kind of thing a later
    // reader assumes is a typo.
    lint: () => command(['dotnet', 'format', '--verify-no-changes']),

    // The case §3.8 describes in the abstract, arriving concretely. The C# compiler rejects
    // type errors as part of `build`, so there is no separate step to run. It must not return
    // `true` and must not return an empty command: both are indistinguishable from a
    // typecheck that ran and passed.
    types: () =>
      notApplicable(
        'the C# compiler rejects type errors during build, so there is no separate typecheck step to run; ' +
          'a type error fails the build gate instead',
      ),

    // Verified: exit 0 with 2 passed and 1 skipped, exit 1 with a failure. The logger argument
    // carries its own semicolon and is one argv element — there is no shell here to split it.
    /** @param {{ meeseeksDir: string }} context */
    unit: ({ meeseeksDir }) =>
      command(['dotnet', 'test', '--logger', `trx;LogFileName=${TRX_REPORT}`, '--results-directory', meeseeksDir]),

    // Not written, because it cannot be verified here. Playwright for .NET is a per-project
    // package with its own install step rather than anything the SDK ships, so there is no
    // command this adapter could offer that is true of an arbitrary .NET repository. The
    // `e2e` gate is capability-gated anyway (§4.2) and does not arm on an api or a cli.
    e2e: () =>
      notApplicable(
        'the SDK ships no browser runner; .NET end-to-end testing is a per-project package with its own ' +
          'install step, so there is no command that is true of an arbitrary .NET repository',
      ),

    // NOT `dotnet list package --vulnerable` — see this file's header. That command reported a
    // High severity advisory and exited 0.
    'security-audit': () => command(['dotnet', 'restore', '--force', '-warnaserror:NU1901,NU1902,NU1903,NU1904']),

    // Stryker.NET exists and is a separate `dotnet tool` that is not installed here. Writing
    // its argv unverified is precisely what this adapter's header is about, so it is declined
    // by name rather than guessed at.
    mutation: () =>
      notApplicable(
        'mutation testing for .NET needs Stryker.NET, a separate dotnet tool that is not installed and whose ' +
          'command line has not been verified here; an unverified command is worse than a declared gap',
      ),
  },

  /**
   * The command that starts this application, or null when it has no executable project.
   *
   * `dotnet run --project <dir>` was run against a scaffolded console project and printed its
   * output at exit 0. A repository of libraries has nothing to start, and says so with null
   * rather than offering a command that would fail — the health probe then passes on its
   * static finding and states that it did not probe (§4).
   *
   * @param {string} root
   * @returns {string | null}
   */
  startCommand(root) {
    const executables = executableProjects(root);
    if (executables.length === 0) return null;
    return `dotnet run --project ${path.dirname(executables[0])}`;
  },

  // One report, because `e2e` is declined. A toolchain that declines an operation must not
  // name a report for it: the driver would look for a file nothing writes, and finding it
  // absent is not evidence about anything.
  reports: [TRX_REPORT],

  // One owner, because `e2e` is declined and a declined operation names no report (REVIEW F22).
  reportOwners: { [TRX_REPORT]: 'unit' },

  // Which operations a workflow must be seen to run. `types` and `e2e` are absent because
  // they are not-applicable here, and an operation with no command string has no pattern for
  // a workflow to match.
  ci: [
    { operation: 'build', pattern: /\bdotnet\s+build\b/ },
    { operation: 'lint', pattern: /\bdotnet\s+format\b/ },
    { operation: 'unit', pattern: /\bdotnet\s+test\b/ },
    { operation: 'security-audit', pattern: /\bdotnet\s+restore\b/ },
  ],
};
