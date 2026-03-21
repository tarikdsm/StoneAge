# Documentation Policy

Stone Age: Ice Shift treats documentation as part of the delivered codebase.
Documentation drift is a bug.

This policy defines how documentation must be created, updated, and reviewed in
this repository from now on.

## Goals

Documentation must help contributors:

- understand what the game does
- find the source of truth for a rule or responsibility
- modify behavior safely
- understand how campaign play, map generation, persistence, and runtime
  architecture fit together

## Core principles

- Document intent, invariants, boundaries, and contracts.
- Prefer one authoritative explanation over duplicated partial explanations.
- Keep code comments concise and high-signal.
- Keep user-facing and developer-facing docs aligned.
- Treat tests as executable documentation for pure behavior.
- Update documentation in the same change whenever behavior or structure
  changes.

## Required repository docs

The following files are canonical and must stay current:

- `README.md`
  Product overview, commands, major user flows, controls, deployment, and
  documentation map.
- `docs/ARCHITECTURE.md`
  Runtime flow, subsystem boundaries, ownership, and extension guidance.
- `docs/GAMEPLAY_MECHANICS.md`
  Gameplay rules, progression, input semantics, and win/lose behavior.
- `docs/LEVEL_DATA.md`
  Runtime/editor level contracts, board semantics, slot rules, and persistence.
- `docs/MAP_EDITOR.md`
  Editor UI behavior, slot workflow, and save/delete constraints.
- `docs/DOCUMENTATION_POLICY.md`
  This policy.

## Required code-level documentation

### Module-level docs

Add module-level documentation when a file contains:

- authoritative gameplay rules
- level repository or persistence logic
- scene orchestration
- editor logic
- input normalization
- reusable contract-heavy helpers
- shared schemas or exported types

Module docs should explain:

- responsibility
- ownership boundaries
- collaborators
- important invariants

### Class docs

Document classes that:

- orchestrate runtime behavior
- coordinate multiple collaborators
- own lifecycle-sensitive state
- act as extension points

### Function and method docs

Document functions or methods when they:

- implement gameplay rules
- implement progression or persistence rules
- perform non-obvious calculations
- convert between important data shapes
- rely on specific ordering/side effects

### Type docs

Document exported types that encode:

- runtime state
- level schemas
- editor schemas
- command/result payloads
- extension-facing contracts

## Comment guidelines

- Use TSDoc or concise block comments for exported modules, classes, and
  important functions.
- Use inline comments only for edge cases or non-obvious implementation choices.
- Do not narrate obvious syntax.
- Remove stale comments immediately when code changes.

## Required doc updates by change type

### Gameplay rule change

Update:

- code docs near the changed rule
- tests
- `docs/GAMEPLAY_MECHANICS.md`
- `README.md` if player-facing behavior changed

### Architecture or runtime-flow change

Update:

- touched module/class docs
- `docs/ARCHITECTURE.md`
- `README.md`

### Input, responsive layout, or UI-flow change

Update:

- touched scene/input/layout docs
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/GAMEPLAY_MECHANICS.md` if player-facing semantics changed

### Level schema, map slot, or persistence change

Update:

- touched type/repository docs
- tests for pure behavior
- `docs/LEVEL_DATA.md`
- `docs/MAP_EDITOR.md` if editor behavior changed
- `README.md`

### Map editor feature change

Update:

- `src/game/types/editor.ts` docs if contracts changed
- `src/game/data/levelRepository.ts` docs if conversion/storage rules changed
- `docs/MAP_EDITOR.md`
- `docs/ARCHITECTURE.md`
- `README.md`

## Review checklist

Before considering a change complete, verify:

- the source of truth for the behavior is documented clearly
- new modules/classes/exports have the right level of docs
- tests still describe the current pure behavior truthfully
- repository markdown docs match the current implementation
- commands and doc links still work
- no outdated comments remain nearby

## Project rule

In this repository, meaningful functionality changes are incomplete until the
relevant documentation has been updated in the same change set.
