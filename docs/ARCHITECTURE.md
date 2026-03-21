# Architecture Overview

## Design goals

The project is organized around a few stable rules:

- gameplay rules remain pure and Phaser-free
- scenes coordinate runtime and presentation without reimplementing rules
- input stays normalized in a separate layer
- default level content remains JSON-authored
- browser persistence stays static-hosting friendly
- editor and campaign logic share the same level repository instead of drifting
  apart

## High-level runtime flow

1. `BootScene` loads assets.
2. `MenuScene` lets the player choose `Play` or `Generate Maps`.
3. `GameScene` loads a map slot from the level repository, steps the pure
   simulation, and syncs visual actors.
4. `UIScene` renders gameplay HUD payloads emitted by `GameScene`.
5. `MapEditorScene` edits 10x10 playable layouts and saves them back through the
   same level repository used by the campaign.

## Subsystem boundaries

### `src/game/core`

Pure gameplay logic lives here.

- `StageState.ts` is the authoritative real-time simulation model.
- It owns movement, pushing, crush logic, enemy pursuit, and win/lose state.
- It has no Phaser dependency.
- It is advanced only through `stepStageState(level, state, input, deltaMs)`.

If a behavior can be tested without rendering, it belongs here first.

### `src/game/scenes`

Scenes own runtime orchestration and presentation.

- `MenuScene` is the player-facing hub.
- `GameScene` coordinates loaded level content, input snapshots, pure simulation
  stepping, auto-progression, and actor sync.
- `MapEditorScene` coordinates editor UI and authoring interactions.
- `UIScene` renders HUD overlays for the gameplay scene only, including the
  always-available return-to-menu control.

Scenes should not duplicate rule logic already owned by `core` or the level
repository.

### `src/game/data`

Gameplay content and repository logic live here.

- `src/game/data/levels/*.json` contains bundled default content.
- `levelRepository.ts` is the authoritative bridge between:
  - bundled default levels
  - browser-saved custom levels
  - campaign slot ordering
  - editor-friendly 10x10 authoring data
  - runtime `LevelData`

This keeps map loading, saving, and progression in one place.

### `src/game/systems/input`

Input systems convert raw browser/device input into normalized intent.

- keyboard, mouse, and touch are interpreted here
- the result is gameplay intent, not direct state mutation
- both campaign play and scene logic depend on this clean boundary

### `src/game/utils`

Reusable pure helpers live here.

- `layout.ts` contains viewport/layout math
- layout logic is kept pure so responsiveness can be reasoned about and tested
  without rendering

### `src/game/types`

Cross-module contracts live here.

- `level.ts` defines runtime level schema and gameplay-facing types
- `editor.ts` defines editor-facing 10x10 authoring contracts

## State ownership and data flow

### Campaign play

- `GameScene` asks the level repository for a level slot
- the repository returns either a browser-saved override or bundled default
  content
- `GameScene` creates a `StageState` from that `LevelData`
- `InputController` creates a normalized input snapshot every frame
- `stepStageState(...)` mutates the pure simulation state
- `GameScene` mirrors `worldPosition` into Phaser actors
- `UIScene` renders HUD state from scene events

### Map editing

- `MapEditorScene` works with `EditableLevelData`, a 10x10 playable-area model
- saving routes through `levelRepository.ts`
- the repository converts editor data into authored runtime `LevelData`
- saved custom maps land in browser `localStorage`
- the campaign then loads those same saved maps by slot number
- editor-side validation prevents saving maps that are missing the required
  Player start or Exit

## Campaign progression model

- The campaign always starts at **Map 01**.
- After a stage is won, `GameScene` asks the repository for the next available
  slot number greater than the current one.
- If a next slot exists, the game auto-advances after a short delay.
- If there is no next slot, the campaign ends and returns to the menu on input.

This design supports sparse map numbering while keeping progression logic simple.

## Responsive layout model

Responsive layout is a render concern, not a gameplay concern.

- Phaser runs in `RESIZE` scale mode
- `GameScene` fits and centers the full authored board in the viewport
- `UIScene` renders responsive HUD bands independently of gameplay rules
- `MapEditorScene` lays out left panel, center board, and right palette
  responsively for desktop and touch browsers

Logical grid coordinates never change in response to viewport size changes.

## Persistence model

- Bundled level content ships with the repo
- Custom/edited maps persist via browser `localStorage`
- This keeps the project compatible with GitHub Pages and other static hosts
- There is currently no server-side persistence or sync layer

## Testing strategy

Automated tests should focus on pure behavior:

- gameplay rules in `core`
- repository conversion/progression logic in `data`
- layout math in `utils`

Phaser scenes should stay thin enough that most correctness remains verifiable by
pure tests.

## Extension guidance

### Adding a gameplay mechanic

Preferred order:

1. update the data contract if needed
2. update `StageState.ts`
3. add or update tests
4. update scene feedback
5. update docs

### Adding a new editor feature

Preferred order:

1. update `src/game/types/editor.ts`
2. update `levelRepository.ts` if persistence or conversion rules change
3. update `MapEditorScene.ts`
4. add tests for pure repository behavior
5. update docs

### Adding more default levels

- keep the content JSON-authored
- register them through the level repository
- document numbering/progression expectations if the campaign structure changes
