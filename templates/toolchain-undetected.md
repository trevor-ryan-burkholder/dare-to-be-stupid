## The stack is not established yet

This repository holds a specification and little else, so there is nothing here to detect. The
gates listed above name a **provisional** toolchain chosen so the run can start — not a decision,
and not an instruction to you.

**Build what the specification asks for, in the language and runtime it names, and create that
stack's project files in this iteration.** The toolchain is re-detected at the start of every
iteration: once the project files exist, detection finds them and the gates change to match. A
`.csproj` gets `dotnet` gates; a `package.json` gets npm ones.

**Do not infer the stack from the provisional gate commands.** An operator who asked for C# and
received TypeScript is not a hypothetical — it happened, because a default was read as an
instruction, and every stage downstream then behaved correctly on a wrong premise.

If the specification genuinely names no language or runtime, the provisional choice stands and you
should build with it.
