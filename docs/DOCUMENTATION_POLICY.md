# Documentation Policy

Stone Age: Ice Shift treats documentation as part of the shipped product and
part of the code contract. Documentation drift is a bug.

This policy defines the minimum documentation standard for every future change
in this repository.

## Goals

Documentation in this project must help a contributor:

- understand what the game does
- understand where a rule or responsibility lives
- change behavior safely without guessing
- discover the current contracts for runtime, input, layout, and level data

## Documentation principles

- Document intent, rules, boundaries, and invariants.
- Prefer one authoritative explanation over repeated partial explanations.
- Keep user-facing docs and developer-facing docs aligned.
- Treat tests as executable documentation for pure behavior.
- Use code comments to explain why and contract details, not obvious syntax.
- Update docs in the same change whenever behavior, architecture, input, layout,
  schema, or tooling changes.

## Canonical documentation map

The repository must keep these documents current:

- `README.md`
  Product overview, setup, commands, controls, deployment, documentation map,
  and the current high-level behavior visible to players and contributors.
- `docs/ARCHITECTURE.md`
  Runtime flow, subsystem boundaries, ownership, layout/render responsibilities,
  and extension guidance.
- `docs/GAMEPLAY_MECHANICS.md`
  Gameplay rules, simulation behavior, collision/push/crush logic, win/lose
  conditions, and player-facing control interpretation.
- `docs/LEVEL_DATA.md`
  Level schema, authoring rules, board sizing semantics, and the current level
  layout assumptions.
- `docs/DOCUMENTATION_POLICY.md`
  The rules in this file.

## Code-level documentation requirements

### Module-level documentation

Add module documentation when a file contains:

- authoritative gameplay rules
- scene/runtime orchestration
- layout or rendering coordination logic
- input normalization
- reusable helpers with contract-heavy behavior
- schema/types shared across modules

Module docs should explain:

- responsibility
- what the module owns
- what it depends on
- important invariants or ordering rules

### Class documentation

Document classes that:

- orchestrate runtime behavior
- coordinate multiple collaborators
- act as extension points
- own lifecycle-sensitive responsibilities

Class docs should explain purpose, collaborators, and lifecycle expectations.

### Function and method documentation

Document functions or methods when they:

- implement game rules
- define state transitions
- depend on a specific order of operations
- perform non-obvious calculations
- expose reusable behavior across modules

Do not add comments for trivial assignments, loops, or self-explanatory helpers.

### Type and interface documentation

Document exported types that encode:

- state contracts
- data schema
- command/result payloads
- extension-facing interfaces

Type docs should explain semantics, not repeat field names.

## Comment style

- Prefer short TSDoc or concise block comments.
- Keep comments close to the code they explain.
- Use inline comments only for edge cases, non-obvious decisions, or subtle
  coupling.
- Remove or rewrite comments that become stale.
- Avoid narrating what the next line of code obviously does.

## Required documentation updates by change type

### Gameplay rule change

Update:

- code-level docs near the changed rule
- `docs/GAMEPLAY_MECHANICS.md`
- tests that demonstrate the rule
- `README.md` if the player-visible behavior changed

### Architecture or runtime-flow change

Update:

- code-level docs for the touched orchestration modules
- `docs/ARCHITECTURE.md`
- `README.md` if setup, runtime expectations, or major behavior changed

### Input or responsive layout change

Update:

- code-level docs in input/layout/scene modules
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/GAMEPLAY_MECHANICS.md` if the player-facing interpretation changed

### Level schema or authored-content convention change

Update:

- code-level docs in schema/types modules
- `docs/LEVEL_DATA.md`
- `README.md` if the change affects discoverability or authoring workflow

## Documentation quality checklist

Before finishing a change, verify:

- the source of truth for the behavior is documented once and clearly
- any new module/class/exported contract has appropriate code-level docs
- tests still describe the current behavior truthfully
- markdown docs match the current implementation
- setup, commands, and links still work
- wording is concise, specific, and free of outdated references

## Process rule for this project

From this point forward, every meaningful change in Stone Age: Ice Shift should
be treated as incomplete until its relevant documentation has been updated.
