# Level Data

## Purpose

Levels are authored as JSON content and then consumed by the runtime
simulation. They define layout and metadata, not gameplay code.

The project now uses three level-facing shapes:

- `LevelData`
  Runtime/authored shape consumed by gameplay scenes and the pure core.
- `EditableLevelData`
  Map-editor shape used for authoring in a 10x10 playable area.
- `MapSlotFile`
  Canonical published JSON shape stored in `public/maps/mapNN.json`.

## Runtime schema: `LevelData`

Defined in:

- `src/game/types/level.ts`

Fields:

- `name`
  Display name shown in the HUD.
- `tileSize`
  Render tile size in pixels.
- `width`, `height`
  Total authored board size in tiles.
- `par`
  Advisory balancing metadata.
- `objective`
  HUD objective text.
- `playerSpawn`
  Starting player tile.
- `blocks`
  Initial pushable block tiles.
- `enemies`
  Initial enemy definitions.
- `goals`
  Exit tiles used for stage completion.
- `walls` (optional)
  Impassable tiles.

## Editor schema: `EditableLevelData`

Defined in:

- `src/game/types/editor.ts`

Fields:

- `slot`
  Campaign/editor slot number.
- `name`
  Display name to save into runtime level data.
- `objective`
  Objective text to save into runtime level data.
- `playerSpawn`
  Player start inside the 10x10 playable area.
- `exit`
  Exit location inside the 10x10 playable area.
- `blocks`
  Pushable blocks inside the 10x10 playable area.
- `columns`
  Static blocking columns inside the 10x10 playable area.
- `enemies`
  Enemy placements inside the 10x10 playable area.

## Published schema: `MapSlotFile`

Defined in:

- `src/game/types/mapFile.ts`

Stored in:

- `public/maps/map01.json`
- `public/maps/map02.json`
- ...
- `public/maps/map99.json`

Fields:

- `type`
  Must be exactly `stoneage-map-slot`.
- `version`
  Current slot-file version. Today this is `1`.
- `slot`
  Slot number from `1` to `99`.
- `empty`
  Whether the slot is intentionally empty.
- `level`
  Present only when `empty` is `false`; contains runtime `LevelData`.

## Board sizing semantics

### Editor view

- always edits a **10x10 playable area**
- coordinates are authored without border walls

### Runtime view

- the playable 10x10 area is wrapped in a 1-tile wall border
- total authored runtime board becomes **12x12**

So the editor and runtime represent the same playable map in two different but
compatible coordinate spaces.

## Coordinate conversion

The level repository performs conversion between the two spaces:

- editor point `(0, 0)` becomes runtime point `(1, 1)`
- editor point `(9, 9)` becomes runtime point `(10, 10)`
- runtime border walls stay outside the editable area

This keeps the editor simpler while preserving the runtime's existing board
rules and border-wall assumptions.

## Published slot catalog

- There are always **99** published JSON files in `public/maps/`
- **Map 01** starts as a non-empty published slot
- **Maps 02-99** start as empty published slots
- The game treats `empty: true` as an unavailable campaign slot
- The editor may modify Map 01 but may never clear it
- Maps 02-99 may be created, overwritten, uploaded, downloaded, or cleared

## Persistence model

- Canonical published maps live in `public/maps/`
- The runtime fetches those files directly from the deployed static site
- On `localhost`, the editor publishes changes by writing the corresponding
  file directly in `public/maps/` through a Vite-only endpoint
- On GitHub Pages, the editor publishes changes by writing the corresponding
  file through the GitHub Contents API
- `Download` exports the exact slot-file JSON for the current map
- `Upload` validates an incoming slot-file JSON and then publishes it back to
  the matching slot

Inference from the implementation: persistence on GitHub Pages works because the
site stays static for reads. Localhost writes go straight to the repo files, and
hosted writes happen against the GitHub repository itself.

## Validation rules

Before a map file is accepted for gameplay or publication:

- the slot file may contain only the expected top-level fields
- `type` must match `stoneage-map-slot`
- `version` must match the current version
- `slot` must stay between `01` and `99`
- Map 01 may not be empty
- non-empty slots must include valid `LevelData`
- runtime board size must stay `12 x 12`
- the full border wall ring must exist
- positions must stay in-bounds
- duplicate positions are rejected
- illegal overlaps are rejected
- upload size is capped before parsing

These checks protect the runtime from malformed, wrong-format, or suspicious
JSON.

## Current published level content

Canonical files:

- `public/maps/map01.json`
- `public/maps/map02.json`
- ...
- `public/maps/map99.json`

Current initial state:

- `map01.json` contains the campaign opening map
- `map02.json` through `map99.json` contain validated empty slots

## Runtime loading order

When the game requests a slot number:

1. fetch `public/maps/mapNN.json`
2. validate it as a `MapSlotFile`
3. if `empty` is `true`, treat the slot as unavailable
4. otherwise return the embedded runtime `LevelData`
