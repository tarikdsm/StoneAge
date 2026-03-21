# Stone Age: Ice Shift

A production-minded web game prototype inspired by **Atari Stone Age / Pengo**,
built with **Phaser 3 + TypeScript + Vite**.

The project combines:

- a pure real-time gameplay core
- a browser-driven campaign that always starts at Map 01
- a built-in 10x10 map generator/editor
- canonical published map slots stored as JSON under `public/maps/`
- static hosting on GitHub Pages, with optional in-browser publishing through
  the GitHub Contents API

## Current feature set

- Real-time grid-aware movement, pushing, crushing, and enemy pursuit
- Jammed blocks that can be shattered on the second move attempt
- Campaign progression from Map 01 to the next non-empty published slot
- Menu hub with `Play` and `Generate Maps`
- Always-available in-game `Menu` button
- Defeat animation where the player is visibly devoured by the catching NPC
- Built-in 10x10 map generator for slots 01-99
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
- Returns to the menu when the campaign ends
- Keeps the HUD `Menu` button available throughout the run

### Generate Maps

- Opens the built-in 10x10 map generator
- Loads the currently published map catalog
- Allows **Map 01** to be modified but never cleared
- Allows **Maps 02-99** to be created, overwritten, uploaded, downloaded, or
  cleared
- On `localhost`, writes edits directly into `public/maps/mapNN.json`
- On GitHub Pages, publishes edits through the GitHub Contents API
- Validates uploaded JSON before any publish occurs
- Refuses to save maps that are missing either the Player start or the Exit

## Controls

### Campaign gameplay

- **Arrow keys / WASD**: move while held
- **Space**: push in the current facing direction
- **Left mouse click**: movement intent
- **Right mouse click**: push intent
- **Touch swipe**: movement intent
- **Touch tap on adjacent block**: push intent
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

## Architecture summary

### Scenes

- **BootScene**
  Loads assets and enters the menu.
- **MenuScene**
  Presents the main entry points: `Play` and `Generate Maps`.
- **GameScene**
  Loads map slots through the level repository, advances the pure simulation,
  and syncs render actors.
- **MapEditorScene**
  Edits 10x10 playable layouts and publishes them as map-slot JSON files.
- **UIScene**
  Renders HUD information for gameplay.

### Core modules

- **`src/game/core/StageState.ts`**
  Authoritative pure gameplay simulation.
- **`src/game/data/levelRepository.ts`**
  Slot-file loading, validation, conversion, campaign ordering, and GitHub
  publication.
- **`src/game/systems/input/InputController.ts`**
  Normalized keyboard, mouse, and touch intent.
- **`src/game/utils/layout.ts`**
  Pure responsive layout helpers.
- **`src/game/types/level.ts`**
  Runtime level schema.
- **`src/game/types/editor.ts`**
  Editor-facing 10x10 authoring schema.
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

Open:

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

## Published map slots

- Canonical map files live in `public/maps/map01.json` through
  `public/maps/map99.json`
- `map01.json` starts filled with the default campaign opening
- `map02.json` through `map99.json` start as validated empty slots
- The game treats `empty: true` slots as unavailable for progression
- The campaign advances to the next non-empty slot number

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
- board size must remain `12 x 12`
- the border wall ring must be complete
- Player, Exit, Blocks, Enemies, and Walls must stay in-bounds
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
