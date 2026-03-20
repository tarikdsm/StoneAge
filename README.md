# Stone Age: Ice Shift

A production-minded web game prototype inspired by **Atari Stone Age / Pengo**, built with **Phaser 3 + TypeScript + Vite**.

This project recreates the core push/crush gameplay loop in a modern browser-friendly structure rather than attempting a direct code port. The current foundation includes one complete playable stage, responsive desktop and touch controls, JSON-authored level data, automated non-visual tests, placeholder art/audio, and a maintainable documentation standard for future development. The current gameplay model is a continuous real-time simulation: enemies keep moving while the player is idle, while grid alignment still keeps movement, pushing, and crush rules readable and testable.

## Features

- Top-down grid-based movement.
- Pushable stone blocks with crush behavior.
- Enemies that pursue the player.
- Win/lose states with clear restart flow.
- One complete stage authored as JSON.
- Desktop controls: keyboard + mouse.
- Tablet/phone controls: swipe + adjacent tap-to-push.
- Static-hosting-friendly Vite build output.
- Vitest coverage for core gameplay logic.
- Focused documentation for architecture, mechanics, and repository conventions.

## Controls

### Desktop

- **Arrow keys / WASD**: move
- **Space**: push in the current facing direction
- **Left mouse click**: movement intent
- **Right mouse click**: push/action intent

### Mobile / Tablet

- **Swipe**: movement intent
- **Tap an adjacent block**: push/action intent

## Documentation map

- [`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md): repository documentation rules and maintenance expectations.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): subsystem boundaries, state ownership, and extension guidance.
- [`docs/GAMEPLAY_MECHANICS.md`](docs/GAMEPLAY_MECHANICS.md): gameplay rules, turn order, input interpretation, and win/lose logic.

## Architecture summary

### Scenes

- **BootScene**: loads placeholder assets and enters the menu.
- **MenuScene**: presents the premise and controls.
- **GameScene**: renders the stage, applies turn results, and coordinates feedback.
- **UIScene**: displays the HUD, status messages, and help text.

### Core gameplay modules

- **`src/game/core/StageState.ts`**: the pure real-time simulation model for movement, push rules, crush behavior, enemy pursuit, and win/lose transitions.
- **`src/game/systems/input/InputController.ts`**: keyboard, mouse, and touch intent handling.
- **`src/game/entities/*`**: visual actors synced from the pure stage state.
- **`src/game/data/levels/*.json`**: level layout and stage metadata.

## Project structure

```text
public/assets
  audio/
  sprites/
docs/
  ARCHITECTURE.md
  DOCUMENTATION_POLICY.md
  GAMEPLAY_MECHANICS.md
src/game
  config.ts
  core/
  data/levels/
  entities/
  scenes/
  systems/ai/
  systems/input/
  systems/physics/
  tests/
  types/
  utils/
```

## Local development

```bash
npm install
npm run dev
```

Open the local Vite URL in your browser.


## GitHub Pages deployment

This project is ready to deploy as a static site on GitHub Pages for the repository `tarikdsm/StoneAge`.

- Expected public URL: `https://tarikdsm.github.io/StoneAge/`
- The Vite build is configured with the `/StoneAge/` base path so bundled scripts and static assets resolve correctly on GitHub Pages.
- The GitHub Actions workflow at `.github/workflows/deploy-pages.yml` installs dependencies with `npm ci`, builds the project with `npm run build`, uploads `dist/` as the Pages artifact, and deploys that artifact to GitHub Pages on pushes to `main` or when run manually.

To use the workflow, enable **GitHub Pages** in the repository settings and set the source to **GitHub Actions**. After that, each push to `main` will publish the latest build.

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

## Real-time gameplay model

- The game now simulates motion every frame using delta time instead of waiting for discrete turns.
- Player, enemy, and pushed-block movement travel continuously between tile centers while rules still use the grid for collision, pushing, and goal checks.
- Enemies continue pursuing the player even when the player gives no input.
- Pushes are now real-time actions that start block motion immediately and can crush enemies occupying the destination lane.

## Level data

Levels are defined in JSON under `src/game/data/levels/` using the `LevelData` contract from `src/game/types/level.ts`.

Current schema fields:

- `name`: display name for the stage
- `tileSize`: rendered tile size in pixels
- `width`, `height`: logical board dimensions in tiles
- `par`: advisory design metadata for future scoring/difficulty use
- `objective`: HUD text shown to the player
- `playerSpawn`: starting player tile
- `blocks`: initial pushable block positions
- `enemies`: initial enemy definitions
- `goals`: exit tile positions required for stage completion after enemies are cleared
- `walls` *(optional)*: blocked tiles that cannot be occupied or pushed into

## Notes

- The included visuals are lightweight placeholders; the current push SFX is generated at runtime to keep the repository PR-safe and binary-light.
- The gameplay rules were recreated from scratch for this prototype.
- The first stage uses a classic opening-style arrangement: five movable ice blocks, three raiders, and six fixed interior columns within a compact but readable arena.
- Documentation should stay synchronized with behavior whenever mechanics, architecture, or data contracts change.
