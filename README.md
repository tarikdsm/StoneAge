# Stone Age: Ice Shift

A production-minded web game prototype inspired by **Atari Stone Age / Pengo**,
built with **Phaser 3 + TypeScript + Vite**.

The project combines:

- a pure real-time gameplay core
- a browser-side campaign flow that starts at Map 01
- a built-in 10x10 map generator/editor
- static-hosting-friendly persistence through browser `localStorage`

## Current feature set

- Real-time grid-aware movement, pushing, and crush rules
- Campaign progression that starts at Map 01 and advances to the next available
  map number
- Menu hub with separate `Play` and `Generate Maps` flows
- Always-available in-game `Menu` button for returning to the start screen
- Defeat feedback where the player is visibly eaten by the enemy that catches
  them
- Browser-side map editor for Map 01 and custom maps 02-99
- Editor replacement/erase workflow with single-slot validation for Player and
  Exit
- JSON-authored default level content
- Responsive gameplay board fitting and centered viewport framing
- Desktop and touch input support
- GitHub Pages-ready static deployment
- Vitest, ESLint, and build validation

## Main flows

### Play

- Starts from **Map 01**
- Loads the current authored/default map or the player's saved override for that
  slot
- On stage clear, automatically advances to the next available map number
- If there is no next map, the campaign ends and returns to the menu on input
- The gameplay HUD always includes a `Menu` button for leaving the run early

### Generate Maps

- Opens the built-in browser-side 10x10 map generator
- Starts with a blank 10x10 playable map
- Lets the player load saved maps from the left-side list
- Lets the player save new maps to slots **02-99**
- Lets the player modify **Map 01** but never delete it
- Lets the player modify or delete custom maps **02-99**
- Includes an `Eraser` tool and supports replacing an occupied tile by placing a
  different item over it
- Refuses saving when the map does not contain exactly one Player start and one
  Exit

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
- **Left panel**: create new maps or load existing maps
- **Right panel**: choose what to place, select a save slot for new maps, save,
  and delete
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
  Level schema, board sizing semantics, and authoring rules.
- [`docs/MAP_EDITOR.md`](docs/MAP_EDITOR.md)
  Map generator behavior, persistence, slot rules, and editing workflow.

## Architecture summary

### Scenes

- **BootScene**
  Loads assets and enters the menu.
- **MenuScene**
  Presents the main entry points: `Play` and `Generate Maps`.
- **GameScene**
  Loads a map slot through the level repository, advances the pure simulation,
  and syncs render actors.
- **MapEditorScene**
  Edits 10x10 playable layouts and saves them into browser storage.
- **UIScene**
  Renders HUD information for gameplay.

### Core modules

- **`src/game/core/StageState.ts`**
  Authoritative pure gameplay simulation.
- **`src/game/data/levelRepository.ts`**
  Level loading, conversion, progression order, and browser persistence.
- **`src/game/systems/input/InputController.ts`**
  Normalized keyboard, mouse, and touch intent.
- **`src/game/utils/layout.ts`**
  Pure responsive layout helpers.
- **`src/game/types/level.ts`**
  Runtime level schema.
- **`src/game/types/editor.ts`**
  Editor-facing 10x10 authoring schema.

## Project structure

```text
docs/
  ARCHITECTURE.md
  DOCUMENTATION_POLICY.md
  GAMEPLAY_MECHANICS.md
  LEVEL_DATA.md
  MAP_EDITOR.md
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

## Map persistence

- Default content ships with `src/game/data/levels/level01.json`
- Saved/generated maps are stored in browser `localStorage`
- Map 01 can be overridden by the player through the editor
- Maps 02-99 exist only when the player saves them
- Campaign progression uses the next available saved/default slot number

Because persistence is browser-local, generated maps belong to the browser
profile/device where they were created unless the player exports the storage by
other means in the future.

## Level sizing

- The editor always works with a **10x10 playable area**
- Runtime `LevelData` still uses a total authored board that includes a
  one-tile wall border
- Current authored board size: `12 x 12`
- Current playable interior: `10 x 10`

## GitHub Pages deployment

Repository:

- `tarikdsm/StoneAge`

Expected public URL:

- `https://tarikdsm.github.io/StoneAge/`

Deployment notes:

- `vite.config.ts` uses `base: '/StoneAge/'`
- `.github/workflows/deploy-pages.yml` builds and deploys `dist/`
- `BootScene` loads assets through `import.meta.env.BASE_URL`
- Browser persistence for custom maps works on static hosting because it relies
  on `localStorage`, not a backend

## Maintenance rule

Meaningful code changes in this repository are considered incomplete until the
relevant docs are updated. See
[`docs/DOCUMENTATION_POLICY.md`](docs/DOCUMENTATION_POLICY.md).
