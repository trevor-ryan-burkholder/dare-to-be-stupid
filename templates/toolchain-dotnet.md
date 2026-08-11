## Building this with .NET

The gates run `dotnet build`, `dotnet format --verify-no-changes`, `dotnet test` and a
vulnerability-auditing `dotnet restore`. What follows is the part that is not obvious from
those command names.

**The solution decides what runs.** `dotnet test` collects from the solution, so a test project
that exists on disk and is not in the `.sln` contributes **zero tests** — and zero tests is not
zero failures, it is an iteration that scores nothing and hands you the same objective back.
When you add a project, add it:

```
dotnet sln add tests/App.Tests/App.Tests.csproj
```

**A test project cannot see the code under test until you say so.** This is the commonest
first-iteration failure here, and it surfaces as `CS0246: The type or namespace name could not
be found` rather than as anything mentioning references:

```
dotnet add tests/App.Tests/App.Tests.csproj reference src/App/App.csproj
```

**Layout.** `src/<Project>/<Project>.csproj` for code, `tests/<Project>.Tests/` for tests, one
`.sln` at the root. Namespace follows folder. A file's class name matches its file name.

**Formatting is a gate, not a preference.** `dotnet format --verify-no-changes` fails on
whitespace the compiler is perfectly happy with, and it exits **2** rather than 1, which is
still a failure. Run it before you finish rather than discovering it in the gate output.

**Typechecking is not a separate gate here** — the compiler rejects type errors during `build`,
so a type error fails the build gate. Nullable reference type warnings are *warnings* by
default and will not fail anything unless the project promotes them; do not assume a clean
build means a clean nullability story.

**Skips are visible.** `[Fact(Skip = "…")]` is reported as `NotExecuted`, and a skipped test
counts toward the ratchet exactly as much as a deleted one — which is to say, not at all. If a
test is skipped because it does not work yet, that is honest; if it is skipped to make a gate
quiet, the auditor reads the attribute and the reason.

**Prefer `[Theory]` with `[InlineData]` over three near-identical `[Fact]`s.** It is the
property-shaped option this stack gives you for free, and it is harder to satisfice: the cases
are data rather than three hand-picked inputs.
