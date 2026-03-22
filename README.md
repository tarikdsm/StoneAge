# Stone Age: Ice Shift

A production-minded web game prototype inspired by **Atari Stone Age / Pengo**,
built with **Phaser 3 + TypeScript + Vite**.

The project combines:

- a pure real-time gameplay core
- a browser-driven campaign that always starts at Map 01
- a simulator mode with a stronger heuristic bot and optional model-backed player control
- a built-in map generator/editor for a canonical 10x10 playable area
- a fixed 12x12 runtime board with a non-playable outer wall ring
- canonical published map slots stored as JSON under `public/maps/`
- static hosting on GitHub Pages, with optional in-browser publishing through
  the GitHub Contents API

## Current feature set

- Real-time grid-aware movement, pushing, crushing, and enemy pursuit
- Enemy lifecycle with staged hatching, controlled randomness, digging, and a
  faster last raider
- Jammed blocks that are destroyed immediately by the push action
- Space plus a direction launches an adjacent block that can carry enemies
  until they are crushed against solid obstacles, including multi-kill chains
- When the original block stock is exhausted, the first fresh block respawns
  immediately and the next ones keep appearing in random playable cells every
  10 seconds so the stage never becomes unwinnable
- Campaign-wide score and rank tracking:
  kills add points with a stage-time bonus, stage clears add a much larger
  bonus, deaths apply a heavy penalty, and the run HUD keeps score, deaths,
  cleared maps, total run time, and current stage time visible
- Score changes animate directly on the gameplay HUD for both `Play` and
  `Simulator`
- Campaign progression from Map 01 to the next non-empty published slot
- Simulator mode that reuses the core runtime with a heuristic or model-backed autonomous player policy
- Menu hub with `Play`, `Simulator`, and `Generate Maps`
- Always-available in-game `Menu` button
- Defeat animation where the player is visibly devoured by the catching NPC
- Built-in 10x10 playable-area map generator for slots 01-99
- Upload and download for map JSON files
- Strict JSON validation before uploaded or published maps are accepted
- Responsive board fitting that keeps the entire board centered and visible
- Desktop, mouse, touch, and mobile-friendly play
- GitHub Pages-ready deployment
- Vitest, ESLint, and build validation

## Main flows

### Play

- Always starts from **Map 01**
- Loads the published slot file for the requested map number
- Converts non-empty map slots into runtime `LevelData`
- Advances automatically to the next non-empty published slot after a clear
- Keeps campaign-wide score, deaths, cleared-map count, and time tracking
  across retries and stage transitions
- Returns to the menu when the campaign ends
- Keeps the HUD `Menu` button available throughout the run

### Simulator

- Starts from **Map 01** using the same published slot catalog as campaign play
- Drives the player through the pure simulation using a stronger heuristic policy by default
- Exposes a HUD toggle that switches the player bot between `Heuristico` and `IA`
- Loads the future `IA` policy from `public/models/player-policy.json` when that model artifact is available
- Reuses cached heuristic decisions until the tactical board state changes, which keeps simulator performance stable on the browser build
- Keeps NPC behavior inside the authoritative `StageState` core
- Auto-retries on defeat and auto-advances on stage clear
- Reuses the same board rendering, HUD, progression, and level repository flow
- Shares the same score, ranking, and HUD animation system as human play

### Generate Maps

- Opens the built-in map generator for the canonical 10x10 playable area
- Loads the currently published map catalog
- Allows **Map 01** to be modified but never cleared
- Allows **Maps 02-99** to be created, overwritten, uploaded, downloaded, or
  cleared
- On `localhost`, writes edits directly into `public/maps/mapNN.json`
- On GitHub Pages, publishes edits through the GitHub Contents API
- Validates uploaded JSON before any publish occurs
- Refuses to save maps that are missing the Player start

## Controls

### Campaign gameplay

- **Arrow keys / WASD**: move while held, and auto-push an adjacent block in
  that direction
- **Space + arrow/WASD**: launch an adjacent block in that direction until
  impact
- **Left mouse click**: movement intent
- **Right mouse click**: push intent
- **Touch swipe**: movement intent, including normal push when swiping into an
  adjacent block
- **Touch tap on adjacent block**: push intent
- **Touch strong tap on adjacent block**: launch intent
- **HUD `Menu` button**: return to the start screen without reloading the page

### Map generator

- **Click / tap a tile**: place or remove the selected item
- **Left panel**: create new maps or load published maps
- **Right panel**: choose what to place, pick the save slot for new maps, save,
  delete, upload, or download
- **Eraser tool**: remove any existing item from a tile

## Documentation map

- [`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md)
  Repository documentation rules and maintenance requirements.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  Runtime flow, subsystem boundaries, state ownership, and scene
  responsibilities.
- [`docs/GAMEPLAY_MECHANICS.md`](docs/GAMEPLAY_MECHANICS.md)
  Gameplay rules, progression, input interpretation, and win/lose behavior.
- [`docs/LEVEL_DATA.md`](docs/LEVEL_DATA.md)
  Runtime/editor level schema, slot-file JSON format, and persistence rules.
- [`docs/MAP_EDITOR.md`](docs/MAP_EDITOR.md)
  Map generator behavior, slot management, upload/download, and publishing
  workflow.
- [`docs/RL_TRAINING.md`](docs/RL_TRAINING.md)
  Headless TypeScript simulator, JSON-lines bridge, Gymnasium environment, and
  PPO baseline.

## Architecture summary

### Canonical geometry

- Editable/authored playable area: **10 x 10**
- Runtime board consumed by gameplay/rendering: **12 x 12**
- Runtime board border: **1 tile thick on every side**
- Player, Blocks, Columns, and NPC spawns all live inside the 10x10
  interior, while the fixed outer wall ring stays non-playable
- Shared geometry helpers live in `src/game/utils/boardGeometry.ts`

### Scenes

- **BootScene**
  Loads assets and enters the menu.
- **MenuScene**
  Presents the main entry points: `Play`, `Simulator`, and `Generate Maps`.
- **GameScene**
  Loads map slots through the level repository, advances the pure simulation,
  and syncs render actors for either human input or simulator control.
- **MapEditorScene**
  Edits canonical 10x10 playable layouts and publishes them as 12x12 runtime
  map-slot JSON files.
- **UIScene**
  Renders HUD information for gameplay.

### Core modules

- **`src/game/core/StageState.ts`**
  Authoritative pure gameplay simulation.
- **`src/game/core/RunProgress.ts`**
  Pure campaign-wide scoring, timing, and ranking helpers shared by `Play` and
  `Simulator`.
- **`src/game/data/levelRepository.ts`**
  Slot-file loading, validation, conversion, campaign ordering, and GitHub
  publication.
- **`src/game/systems/input/InputController.ts`**
  Normalized keyboard, mouse, and touch intent.
- **`src/game/systems/ai/SimulationController.ts`**
  Runtime wrapper around swappable player-control policies.
- **`src/game/systems/ai/RuleBasedPlayerPolicy.ts`**
  Pure first-pass simulator policy, designed to be replaced later by trained
  models without rewriting `GameScene`.
- **`src/game/utils/boardGeometry.ts`**
  Canonical board dimensions, fixed-border helpers, and editor/runtime
  coordinate conversion.
- **`src/game/utils/layout.ts`**
  Pure responsive layout helpers.
- **`src/game/types/level.ts`**
  Runtime level schema.
- **`src/game/types/editor.ts`**
  Editor-facing 10x10 playable-area authoring schema.
- **`src/game/types/mapFile.ts`**
  Canonical slot-file JSON schema used by `public/maps/mapNN.json`.

## Project structure

```text
docs/
  ARCHITECTURE.md
  DOCUMENTATION_POLICY.md
  GAMEPLAY_MECHANICS.md
  LEVEL_DATA.md
  MAP_EDITOR.md
public/
  maps/
    map01.json
    ...
    map99.json
src/game
  config.ts
  core/
  data/
  entities/
  scenes/
  systems/ai/
  systems/input/
  tests/
  types/
  utils/
trainer/
  README.md
  stoneage_env.py
  train_ppo.py
  ts_bridge.py
  smoke_test.py
trainer_bridge/
  stoneage_sim_server.ts
```

## Local development

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/StoneAge/`

## Quality checks

```bash
npm test
npm run lint
npm run build
```

## RL trainer workspace

- `trainer/` is reserved for reinforcement-learning experiments and model
  tooling
- it is intentionally separate from the Phaser/Vite frontend
- `trainer/.venv/` is local-only and ignored by git through
  `trainer/.gitignore`
- `trainer/smoke_test.py` validates that the Python training environment can
  import `torch` and see CUDA
- `trainer/stoneage_env.py` exposes the real TypeScript gameplay simulation as
  a Gymnasium environment through a local subprocess bridge, with single-map
  or rotating-map curriculum support, a richer flattened spatial observation,
  and explicit affordance/threat features for the early `map01` learning phase
- `trainer/train_ppo.py` provides the PPO baseline, smoke-test path, and a
  first curriculum step over `map01`-`map03`, while defaulting this learning
  phase to focused `map01` experiments with periodic checkpoint evaluation
- `trainer/evaluate_policy.py` measures completion rate, death rate, kills,
  reward, raw score, step counts, and action distributions for `random`,
  `heuristic`, `bc`, or `ppo` agents
- `trainer/eval_utils.py` centralizes RL evaluation, checkpoint metrics, and
  training-curve reporting
- `trainer/collect_heuristic_dataset.py` and
  `trainer/train_behavior_cloning.py` provide a first imitation-learning
  baseline cloned from the TypeScript heuristic teacher
- `trainer_bridge/stoneage_sim_server.ts` is the Node JSON-lines bridge used by
  Python, currently backed by `map01`, `map02`, and `map03`
- WSL2 + Ubuntu remains the preferred long-term trainer host, but the repo also
  supports a Windows fallback workspace when WSL is not enabled yet

## LLM backup

```bash
npm run backup:llm
```

- Creates a local `.zip` under `Backup_ZIP/`
- Uses a timestamped file name like `StoneAge_LLM_Backup_21032026_1234.zip`
- Includes the analyzable project source, docs, configs, published map JSON, and
  text-based assets
- Excludes build output, dependencies, git metadata, and the backup directory
- `Backup_ZIP/` is local-only and ignored by git
- Uses PowerShell/.NET ZIP creation, so it no longer depends on WinRAR

## Production build

```bash
npm run build
npm run preview
```

## Published map slots

- Canonical map files live in `public/maps/map01.json` through
  `public/maps/map99.json`
- The shipped campaign currently fills **all 99** slots with authored stages
- The game treats `empty: true` slots as unavailable for progression
- The default campaign now advances sequentially from **Map 01** through
  **Map 99**

## Upload, download, and persistence

- `Download` exports the current slot as a JSON slot file
- `Upload` accepts only validated slot-file JSON and publishes it to the
  corresponding `mapNN.json`
- `Save Map` publishes the current editor state to the selected slot
- `Delete Map` clears slots `02-99` by publishing an empty slot file
- On `http://localhost:3000/StoneAge/`, save/upload/delete write directly into
  `public/maps/` without asking for a GitHub token
- Those local file edits become permanent on GitHub after you commit and push
  them
- On the hosted site, publishing asks for a GitHub Personal Access Token with
  repository contents write permission
- That hosted-site token is stored only in `sessionStorage` for the current
  browser tab
- After hosted-site publishing, GitHub Pages updates once the `main` push
  triggers the Pages deployment workflow

## Security and validation

Uploaded and published map files are checked before they are accepted:

- exact top-level slot-file fields only
- exact runtime level fields only
- slot must stay between `01` and `99`
- `map01` cannot be empty
- board size must remain `12 x 12`, with a fixed `10 x 10` playable interior
- the border wall ring must be complete
- Player, Blocks, Enemies, and Walls must stay in-bounds
- illegal overlaps are rejected
- file size is capped before parsing

This keeps malformed, incompatible, or suspicious JSON from breaking the game
runtime.

## GitHub Pages deployment

Repository:

- `tarikdsm/StoneAge`

Expected public URL:

- `https://tarikdsm.github.io/StoneAge/`

Deployment notes:

- `vite.config.ts` uses `base: '/StoneAge/'`
- `.github/workflows/deploy-pages.yml` deploys on pushes to `main`
- `BootScene` loads assets through `import.meta.env.BASE_URL`
- published map JSON files are served from `public/maps/`
- local development uses a Vite-only write endpoint so the editor can update
  `public/maps/` directly
- browser-side publishing on GitHub Pages uses the GitHub Contents API, while
  GitHub Pages remains the static host for the deployed site

## Maintenance rule

Meaningful code changes in this repository are considered incomplete until the
relevant docs are updated. See
[`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md).
