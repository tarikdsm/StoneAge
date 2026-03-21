# Stone Age: Ice Shift

A production-minded web game prototype inspired by **Atari Stone Age / Pengo**,
built with **Phaser 3 + TypeScript + Vite**.

The project recreates the push/crush gameplay loop in a browser-friendly,
static-hosting-friendly structure rather than attempting a direct port. The game
now runs as a continuous real-time simulation: enemies keep moving while the
player is idle, but grid-aware rules still keep movement, pushing, collisions,
and crush behavior readable and testable.

## Current highlights

- Pure real-time gameplay core in `src/game/core/StageState.ts`
- Desktop and touch input through a separate normalization layer
- JSON-authored level data
- Responsive board auto-fit that keeps the full authored map visible and
  centered in the browser viewport
- GitHub Pages-ready static deployment
- Vitest coverage for pure gameplay and layout helpers
- Project-level documentation policy with required code and markdown updates

## Features

- Top-down grid-aware movement
- Pushable stone blocks with crush behavior
- Enemies that continuously pursue the player
- Win/lose states with restart flow
- One playable JSON-authored stage
- Keyboard, mouse, and touch controls
- Responsive menu, HUD, and board framing across desktop/mobile browsers

## Controls

### Desktop

- **Arrow keys / WASD**: move while held
- **Space**: push in the current facing direction
- **Left mouse click**: movement intent
- **Right mouse click**: push intent

### Mobile / Tablet

- **Swipe**: movement intent
- **Tap an adjacent block**: push intent
- **Other taps**: movement intent

## Documentation map

- [`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md)
  Documentation rules, maintenance expectations, and the required update policy
  for future changes.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  Runtime flow, subsystem boundaries, state ownership, and viewport/layout
  responsibilities.
- [`docs/GAMEPLAY_MECHANICS.md`](docs/GAMEPLAY_MECHANICS.md)
  Gameplay rules, input interpretation, simulation behavior, and win/lose
  conditions.
- [`docs/LEVEL_DATA.md`](docs/LEVEL_DATA.md)
  Level schema, authoring semantics, and current stage layout assumptions.

## Architecture summary

### Scenes

- **BootScene**
  Loads lightweight placeholder assets and enters the menu.
- **MenuScene**
  Presents the premise and controls using a responsive layout.
- **GameScene**
  Samples normalized input, advances the pure simulation, syncs actors, and
  keeps the full board centered/fitted in the browser viewport.
- **UIScene**
  Renders HUD information in responsive top/bottom overlay bands.

### Core gameplay modules

- **`src/game/core/StageState.ts`**
  Authoritative pure simulation for movement, pushing, crush logic, enemy
  pursuit, and win/lose state.
- **`src/game/systems/input/InputController.ts`**
  Normalizes keyboard, mouse, and touch into movement/push intent.
- **`src/game/utils/layout.ts`**
  Pure responsive layout helpers used by scenes to fit the board and HUD.
- **`src/game/entities/*`**
  View-layer actors that mirror authoritative world positions from the core.
- **`src/game/data/levels/*.json`**
  Authored level layouts and metadata.

## Project structure

```text
public/assets
  audio/
  sprites/
docs/
  ARCHITECTURE.md
  DOCUMENTATION_POLICY.md
  GAMEPLAY_MECHANICS.md
  LEVEL_DATA.md
src/game
  config.ts
  core/
  data/levels/
  entities/
  scenes/
  systems/input/
  tests/
  types/
  utils/
```

## Local development

```bash
npm install
npm run dev
```

Local dev URL:

- `http://localhost:3000/StoneAge/`

## Quality checks

```bash
npm test
npm run lint
npm run build
```

## Production build

```bash
npm run build
npm run preview
```

The project builds into `dist/` and is suitable for static hosting.

## Responsive board framing

- The Phaser canvas resizes to the live browser viewport.
- The entire authored board is automatically fitted into roughly 80% of the
  available viewport.
- The board is centered in the browser window instead of being anchored to a
  fixed 1280x720 stage layout.
- HUD panels are laid out independently in responsive overlay bands so they do
  not drive gameplay rules.

## Real-time gameplay model

- The simulation advances every frame using delta time.
- Player, enemy, and pushed-block movement travels continuously between tile
  centers.
- Grid-aware occupancy still drives walls, push validity, crush checks, and goal
  checks.
- Enemies continue moving even when the player stands still.
- Pushes start block motion immediately instead of resolving an entire turn.

## Level data

Levels are defined in JSON under `src/game/data/levels/` using the `LevelData`
contract from `src/game/types/level.ts`.

The current first stage uses:

- total board: `12 x 12`
- playable interior with border walls: `10 x 10`
- five blocks
- three enemies
- six interior wall columns

See [`docs/LEVEL_DATA.md`](docs/LEVEL_DATA.md) for the full schema and authoring
rules.

## GitHub Pages deployment

This repository is prepared for static deployment on GitHub Pages for:

- `tarikdsm/StoneAge`

Expected public URL:

- `https://tarikdsm.github.io/StoneAge/`

Deployment details:

- `vite.config.ts` uses `base: '/StoneAge/'`
- `.github/workflows/deploy-pages.yml` installs dependencies, builds the app,
  uploads `dist/`, and deploys it through GitHub Pages
- `BootScene` loads assets through `import.meta.env.BASE_URL`

Enable **GitHub Pages** in the repository settings and set the source to
**GitHub Actions** so pushes to `main` publish the latest build.

## Project notes

- Placeholder art/audio are intentionally lightweight.
- The push sound effect is generated at runtime to keep the repository binary
  light.
- Documentation must be updated together with meaningful behavior or structure
  changes. See [`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md).
