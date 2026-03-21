# Architecture Overview

## Goals

The project is organized around a few clear boundaries:

- gameplay rules stay pure and testable without Phaser
- scenes orchestrate runtime and visuals without redefining gameplay logic
- input is normalized in its own layer before touching the core
- level layouts remain JSON-authored content
- responsive browser layout stays a render concern, not a gameplay concern

## High-level runtime flow

1. `BootScene` loads lightweight placeholder assets.
2. `MenuScene` presents controls in a responsive browser layout.
3. `GameScene` samples input every frame, advances the pure simulation, syncs
   actors, and keeps the board fitted and centered in the viewport.
4. `UIScene` renders HUD state from the scene event bus in responsive overlay
   bands.

## Subsystem boundaries

### `src/game/core`

Pure gameplay logic lives here.

- `StageState.ts` is the authoritative real-time simulation model.
- It does not depend on Phaser.
- It owns movement state, push rules, crush behavior, enemy pursuit, and
  win/lose transitions.
- The simulation advances via `stepStageState(level, state, input, deltaMs)`.

If a rule can be tested without rendering, it belongs here first.

### `src/game/scenes`

Scenes coordinate runtime behavior.

- `GameScene` owns Phaser objects, scene-level orchestration, event emission,
  and camera/layout fitting.
- `UIScene` owns HUD rendering and viewport-aware HUD placement.
- `MenuScene` owns the responsive title/start screen.
- Scenes should not duplicate gameplay rules already implemented in `core`.

### `src/game/entities`

Entities are view-layer actors.

- They mirror authoritative positions from `StageState`.
- They do not decide collisions, movement legality, or win/lose state.

### `src/game/systems/input`

Input systems translate raw browser/device interaction into normalized intent.

- keyboard, mouse, and touch behavior are interpreted here
- this layer resolves ambiguous gestures into movement or push intent
- it does not mutate gameplay state directly

### `src/game/utils/layout`

Pure responsive layout helpers live here.

- board-fit calculations stay deterministic and testable
- scene layout can evolve without leaking into the gameplay core
- responsive framing rules are shared between runtime scenes and tests

### `src/game/data/levels`

Level JSON provides authored stage layouts and metadata.

- runtime code should treat level files as content, not logic
- board dimensions describe the full authored board bounds
- authored border walls reduce the playable interior area

## State ownership and data flow

`GameScene` owns the live `StageState` instance, but it does not define the
rules for mutating it.

- `InputController` produces a `RealtimeInputSnapshot`
- `stepStageState(...)` advances the pure simulation using delta time
- `GameScene` updates Phaser actors from resulting `worldPosition` values
- `GameScene` emits HUD payloads through the game event bus
- `UIScene` renders that HUD payload independently of the gameplay core

This keeps rules deterministic while still allowing responsive real-time play.

## Real-time simulation model

The simulation is continuous, but still grid-aware:

- actors move every frame between adjacent tile centers
- occupancy checks use authored grid cells plus in-flight movement reservations
- enemies choose a new direction whenever they finish a lane segment
- pushes start block motion immediately instead of resolving a whole turn
- win/lose checks run continuously after movement advances

## Responsive browser layout

Responsive layout is intentionally handled outside the gameplay core.

- Phaser runs in `RESIZE` scale mode so the canvas follows the browser viewport
- `GameScene` fits the full authored board inside roughly 80% of the available
  viewport and centers it on screen
- `UIScene` places HUD panels in top/bottom overlay bands so the board framing
  does not depend on HUD-specific calculations
- pointer direction logic still works because input is resolved through Phaser
  world coordinates after camera zoom/centering is applied

The goal is that any map size remains fully visible and centered without
changing the simulation's logical board coordinates.

## Testing strategy

Automated tests should target:

- pure gameplay simulation in `core`
- reusable helpers in `utils`
- any non-visual rule or layout math that can be tested without Phaser

Scene code should stay thin enough that most correctness is still captured by
pure tests.

## Extension guidance

### Adding a new gameplay mechanic

Preferred order:

1. extend data/schema if needed
2. update `StageState.ts` and tests
3. update scene rendering/feedback
4. update documentation

### Adding a new enemy type

- extend `EnemyDefinition` and `EnemyState`
- document the new behavior in `docs/GAMEPLAY_MECHANICS.md`
- update simulation logic and tests before scene visuals

### Adding more responsive presentation behavior

- keep viewport math in `src/game/utils/layout.ts` when possible
- keep gameplay coordinates and collision rules unchanged
- test pure layout calculations before wiring them into scenes

### Adding more levels

- keep level data in JSON
- keep progression logic outside the core stage simulation
- document schema or authoring-rule changes in `docs/LEVEL_DATA.md`
