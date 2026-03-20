# Architecture Overview

## Goals

The project is organized around a small set of modules with clear responsibilities:

- **pure gameplay rules** should be testable without Phaser
- **rendering** should reflect authoritative state rather than invent rules
- **input translation** should convert device-specific interactions into normalized control intent
- **level data** should remain JSON-authored and easy to extend

## High-level runtime flow

1. `BootScene` loads lightweight placeholder assets.
2. `MenuScene` communicates controls and starts the playable stage.
3. `GameScene` creates the stage, samples input every frame, advances the simulation with delta time, and syncs visuals.
4. `UIScene` displays HUD text derived from the current stage state.

## Subsystem boundaries

### `src/game/core`

Pure gameplay logic lives here.

- `StageState.ts` is the authoritative real-time simulation model.
- It does not depend on Phaser.
- It owns movement state, push rules, crush behavior, enemy pursuit, and win/lose transitions.
- The simulation advances via `stepStageState(level, state, input, deltaMs)`.

If a rule can be tested without rendering, it belongs here first.

### `src/game/scenes`

Scenes coordinate runtime behavior.

- `GameScene` owns Phaser objects, HUD/event emission, and visual feedback.
- `UIScene` renders current game metadata.
- Scenes should not duplicate gameplay rules already implemented in `core`.

### `src/game/entities`

Entities are view-layer actors.

- They render and mirror the simulation state's continuous world positions.
- They should not become alternate sources of truth for gameplay logic.

### `src/game/systems/input`

Input systems translate raw device events into normalized control intent.

- keyboard, mouse, and touch behavior are handled here
- this layer decides how ambiguous interactions are interpreted
- it should not directly mutate gameplay state

### `src/game/data/levels`

Level JSON provides authored stage layouts and metadata.

- runtime code should treat it as content, not logic
- behavior-specific assumptions must be documented in the level schema docs and enforced by gameplay code

## State ownership and data flow

`GameScene` owns the current `StageState`, but does not define the rules for mutating it.

- input produces a `RealtimeInputSnapshot`
- `stepStageState(...)` advances the pure simulation using delta time
- `GameScene` updates Phaser actors from the resulting world positions
- `UIScene` receives HUD payloads from the scene event bus

This design keeps rules deterministic while allowing real-time gameplay.

## Simulation model

The simulation is continuous, but still grid-aware:

- actors move every frame between adjacent tile centers
- occupancy checks use authored grid cells plus in-flight movement reservations
- enemies choose a new direction whenever they finish a lane segment
- pushes start block motion immediately instead of resolving a whole turn
- win/lose checks run every frame after movement advances

This preserves readability and testability without reducing the game to visual-only interpolation over hidden turn logic.

## Testing strategy

Automated tests should target:

- pure gameplay simulation in `core`
- reusable data helpers in `utils`
- any future pure modules with meaningful rule complexity

Phaser scene behavior should remain thin enough that most correctness is guaranteed by pure-module tests.

## Extension guidance

### Adding a new gameplay mechanic

Prefer this order:

1. extend the data contract if needed
2. update `StageState.ts` rules and tests
3. update scene rendering/feedback
4. update docs describing the mechanic

### Adding a new enemy type

- extend `EnemyDefinition` and `EnemyState`
- document the new behavior in gameplay docs
- update simulation logic and tests before scene visuals

### Adding multiple levels

- keep level data in JSON
- keep stage progression logic outside the core simulation module
- document progression/state persistence separately from per-level rules
