# Architecture Overview

## Design goals

The project is organized around a few stable rules:

- gameplay rules remain pure and Phaser-free
- scenes coordinate runtime and presentation without reimplementing rules
- input stays normalized in a separate layer
- published level content remains JSON-authored
- map-slot persistence stays compatible with GitHub Pages
- editor, campaign, upload, and download all share one repository module

## High-level runtime flow

1. `BootScene` loads assets.
2. `MenuScene` lets the player choose `Play`, `Simulator`, or `Generate Maps`.
3. `GameScene` loads a published map slot from the level repository, steps the
   pure simulation, and syncs visual actors for either human or simulator-driven
   control.
4. `UIScene` renders gameplay HUD payloads emitted by `GameScene`.
5. `MapEditorScene` edits canonical 10x10 playable layouts and publishes them back
   through the same level repository used by the campaign.

## Subsystem boundaries

### `src/game/core`

Pure gameplay logic lives here.

- `StageState.ts` is the authoritative real-time simulation model.
- It owns movement, pushing, launch carry/crush logic, enemy lifecycle,
  win/lose state, and jammed-block destruction.
- It also owns multi-tile launched-block behavior triggered by the input layer.
- Enemy routing intelligence also lives here, including blocker-aware chase
  selection, digging, controlled randomness, and last-enemy acceleration.
- It has no Phaser dependency.
- It is advanced only through `stepStageState(level, state, input, deltaMs)`.

If a behavior can be tested without rendering, it belongs here first.

### `src/game/scenes`

Scenes own runtime orchestration and presentation.

- `MenuScene` is the player-facing hub.
- `GameScene` coordinates loaded level content, input snapshots, pure
  simulation stepping, campaign/simulator auto-progression, and actor sync.
- `MapEditorScene` coordinates editor UI, upload/download actions, and
  publishing flow.
- `UIScene` renders HUD overlays for the gameplay scene only, including the
  always-available return-to-menu control.

Scenes should not duplicate rule logic already owned by `core` or the level
repository.

### `src/game/data`

Gameplay content and repository logic live here.

- `public/maps/map01.json` through `public/maps/map99.json` are the canonical
  published map-slot files.
- `boardGeometry.ts` is the shared geometry source of truth for:
  - the `10 x 10` editable playable area
  - the fixed `12 x 12` runtime board
  - the 1-tile border ring
  - editor/runtime coordinate conversion
- `levelRepository.ts` is the authoritative bridge between:
  - published slot files fetched from the static site
  - strict slot-file JSON validation
  - editor-friendly 10x10 authoring data
  - runtime `LevelData`
  - campaign slot ordering
  - local file writes during `localhost` development
  - GitHub repository publication through the Contents API

This keeps map loading, saving, uploading, downloading, and progression in one
place.

### `src/game/systems/input`

Input systems convert raw browser/device input into normalized intent.

- keyboard, mouse, and touch are interpreted here
- the result is gameplay intent, including both continuous movement direction
  and one-shot launch/push attempts
- both campaign play and scene logic depend on this clean boundary

### `src/game/systems/ai`

Simulator-facing control policies live here.

- `SimulationController.ts` is the runtime wrapper used by `GameScene` when no
  human input is involved
- `RuleBasedPlayerPolicy.ts` is the current pure player-bot policy, using
  short-horizon lookahead, tactical scoring, and controlled randomness
- `ModelPlayerPolicy.ts` loads a future browser-friendly player model artifact
  from `public/models/player-policy.json`
- this policy boundary is the intended insertion point for future trained
  player and NPC controllers
- the scene stays thin because it only asks the policy layer for normalized
  `SimulationInput`

### `src/game/utils`

Reusable pure helpers live here.

- `boardGeometry.ts` contains the canonical 10x10 playable / 12x12 runtime
  board contract plus fixed-border conversion helpers
- `layout.ts` contains viewport/layout math
- layout logic is kept pure so responsiveness can be reasoned about and tested
  without rendering

### `src/game/types`

Cross-module contracts live here.

- `level.ts` defines runtime level schema and gameplay-facing types
- `editor.ts` defines editor-facing 10x10 authoring contracts
- `mapFile.ts` defines the canonical published slot-file schema

## State ownership and data flow

### Campaign play

- `GameScene` asks the level repository for a map slot
- the repository fetches `public/maps/mapNN.json`
- if the slot is non-empty, the repository returns runtime `LevelData`
- `GameScene` creates a `StageState` from that `LevelData`
- `InputController` creates a normalized input snapshot every frame
- `stepStageState(...)` advances the pure simulation state
- `GameScene` mirrors `worldPosition` into Phaser actors
- `UIScene` renders HUD state from scene events

### Simulator play

- `GameScene` still loads campaign slots through the level repository
- instead of sampling browser input, it requests a `SimulationInput` snapshot
  from `SimulationController`
- the current controller can swap between `RuleBasedPlayerPolicy` and a loaded
  `ModelPlayerPolicy` artifact without changing the scene/runtime contract
- the resulting snapshot still flows into `stepStageState(...)`
- win/lose handling is scene-owned: simulation mode auto-retries losses and
  auto-advances clears without changing the pure gameplay rules

### Map editing

- `MapEditorScene` works with `EditableLevelData`, a 10x10 playable-area model
- saving routes through `levelRepository.ts`
- the repository converts editor data into canonical 12x12 runtime `LevelData`
- the repository wraps that level into a `MapSlotFile`
- on `localhost`, publishing writes the corresponding `public/maps/mapNN.json`
  through a Vite-only local endpoint
- on GitHub Pages, publishing writes the corresponding `public/maps/mapNN.json`
  through the GitHub Contents API
- upload parses and validates a JSON slot file before any publish occurs
- download exports the current slot-file representation

## Campaign progression model

- The campaign always starts at **Map 01**.
- After a stage is won, `GameScene` asks the repository for the next non-empty
  slot number greater than the current one.
- If a next slot exists, the game auto-advances after a short delay.
- If there is no next slot, the campaign ends and returns to the menu on input.

This design supports sparse map numbering while keeping progression logic
simple.

## Responsive layout model

Responsive layout is a render concern, not a gameplay concern.

- Phaser runs in `RESIZE` scale mode
- `GameScene` fits and centers the full 12x12 runtime board in the viewport
- `UIScene` renders responsive HUD bands independently of gameplay rules
- `MapEditorScene` lays out left panel, center board, and right palette
  responsively for desktop and touch browsers

Logical grid coordinates never change in response to viewport size changes.

## Persistence and publication model

- Canonical published content lives in `public/maps/`
- The deployed game reads those JSON files directly from GitHub Pages
- On `localhost`, the editor writes directly to `public/maps/` through a
  Vite-only write endpoint
- Those local file edits become permanent once they are committed and pushed
- On GitHub Pages, publishing from the editor requires a GitHub Personal Access
  Token with repository contents write permission
- The browser stores that hosted-site token only in `sessionStorage` for the
  current tab
- Hosted-site writes create a commit on `main`
- The existing Pages workflow redeploys the site after that push

Inference from the implementation: GitHub Pages remains the static host, while
the GitHub Contents API provides the authenticated write path needed to keep the
published map files persistent.

## Testing strategy

Automated tests should focus on pure behavior:

- gameplay rules in `core`
- slot conversion/validation/progression logic in `data`
- layout math in `utils`

Phaser scenes should stay thin enough that most correctness remains verifiable
by pure tests.

## Extension guidance

### Adding a gameplay mechanic

Preferred order:

1. update the data contract if needed
2. update `StageState.ts`
3. add or update tests
4. update scene feedback
5. update docs

### Replacing the simulator with trained models

Preferred order:

1. keep the authoritative gameplay state and validation rules in `core`
2. add a new policy implementation under `src/game/systems/ai`
3. make `SimulationController` choose that policy
4. keep `GameScene` consuming only normalized `SimulationInput`
5. add pure tests around the policy behavior and any offline data pipeline

### Adding a new editor or persistence feature

Preferred order:

1. update `src/game/types/editor.ts` or `src/game/types/mapFile.ts`
2. update `levelRepository.ts`
3. update `MapEditorScene.ts`
4. add tests for pure repository behavior
5. update docs

### Adding more published levels

- keep the content JSON-authored
- add or update the corresponding `public/maps/mapNN.json`
- preserve slot numbering expectations for campaign progression
- document any campaign-order changes if the slot strategy changes
