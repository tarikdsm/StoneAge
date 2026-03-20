# Documentation Policy

This repository uses a **high-signal, low-noise** documentation standard. Documentation should make it easier to understand, extend, and safely modify the game. It should not restate obvious code.

## Core principles

- Document **intent, rules, contracts, and boundaries**.
- Do not document syntax that is already obvious from the code.
- Prefer **one authoritative explanation** over repeating the same detail in many places.
- Keep docs synchronized with behavior. If a code change invalidates a doc comment or markdown file, update both in the same change.

## What must be documented

### Repository-level documentation

The repository must maintain:

- `README.md` for product overview, setup, controls, and navigation.
- `docs/ARCHITECTURE.md` for subsystem boundaries, runtime flow, and extension guidance.
- `docs/GAMEPLAY_MECHANICS.md` for gameplay rules, turn order, and state transitions.
- This policy file for documentation standards.

### File and module documentation

Add module-level documentation when a file contains one of the following:

- a core gameplay rule implementation
- an orchestration module with non-trivial responsibilities
- a reusable subsystem with input/output expectations
- a schema or data contract relied on by multiple modules

Module docs should explain:

- the module’s responsibility
- what it owns vs what it depends on
- any important invariants or assumptions

### Class documentation

Document classes that coordinate state, encapsulate gameplay behavior, or serve as extension points. Class docs should explain:

- purpose
- major collaborators
- lifecycle or ownership expectations

### Function and method documentation

Document functions/methods when they:

- implement important game rules
- mutate or derive core game state
- have non-obvious inputs/outputs
- enforce ordering or transition rules
- would be risky to change without understanding side effects

Short helper functions do **not** need comments unless their behavior is subtle.

### Type and interface documentation

Document public or cross-module types that encode rules or data contracts, especially:

- state objects
- level schema objects
- command/result payloads
- extension-facing interfaces

Type docs should clarify semantics, not restate property names.

### Game rules and state transitions

The following rules must always be documented in either code or docs:

- movement rules
- push rules
- collision/occupancy rules
- crush logic
- enemy turn order and decision rules
- win/lose conditions
- restart behavior
- any rule that depends on turn sequencing

### Input behavior

Desktop and mobile behavior must be documented in both:

- user-facing docs (`README.md`)
- developer-facing docs where the input rules are implemented or explained

This includes ambiguity resolution, such as how taps/clicks are interpreted.

### Level data and schema

JSON level structure must be documented where developers can discover it quickly. Required documentation:

- field definitions
- required vs optional fields
- runtime assumptions and constraints
- semantic meaning of walls, goals, blocks, and enemy definitions

## What should not be over-documented

Avoid comments for:

- obvious assignments or loops
- trivial getters/setters
- code that is already clearer than the comment
- repeated explanations already covered by nearby module docs or markdown docs

If a comment merely narrates the next line, delete it.

## Inline comments vs higher-level documentation

Use inline comments only when they explain:

- why a specific implementation choice exists
- an important exception to the normal rule
- a subtle edge case
- a coupling that is not obvious from types alone

Use markdown docs or JSDoc/TSDoc when describing broader behavior, contracts, architecture, or multi-step logic.

## TODO / FIXME policy

- Use `TODO:` only for a concrete future improvement that is intentionally deferred.
- Use `FIXME:` only for a known correctness or maintainability issue.
- Every `TODO:` or `FIXME:` must be actionable and specific.
- Do not leave speculative or vague placeholders.
- Prefer tracking large work in issues rather than scattering many TODOs in code.

## Keeping documentation synchronized

When changing behavior, architecture, or data contracts:

1. update the code
2. update the nearest relevant code-level documentation
3. update markdown docs if the change affects architecture, gameplay, setup, or schemas
4. update tests when they help keep documentation truthful

Documentation drift is treated as a bug.

## Review checklist

Before merging a change, verify:

- new modules/classes have the right level of documentation
- gameplay-rule changes are reflected in docs and tests
- README links and commands still work
- level schema docs still match the runtime parser/usage
- comments explain intent rather than mechanics
