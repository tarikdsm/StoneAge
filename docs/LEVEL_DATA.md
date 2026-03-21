# Level Data

## Purpose

Levels are authored as static content and then consumed by the runtime
simulation. They define layout and metadata, not gameplay code.

The project currently uses two level-facing shapes:

- `LevelData`
  Runtime/authored shape consumed by gameplay scenes and the pure core.
- `EditableLevelData`
  Map-editor shape used for browser-side authoring in a 10x10 playable area.

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

## Persistence model

- Bundled default levels ship from JSON files in `src/game/data/levels/`
- Browser-saved custom or modified maps persist via `localStorage`
- Saved maps are stored by slot number
- Map 01 may be overridden by the player through the editor
- Maps 02-99 exist only when the player saves them

## Slot rules

- **Map 01**
  Always exists, can be modified, cannot be deleted.
- **Maps 02-99**
  May be created, modified, overwritten, or deleted.
- Maximum slot number is **99**.

## Current bundled level

File:

- `src/game/data/levels/level01.json`

Current bundled layout:

- total board: `12 x 12`
- playable interior: `10 x 10`
- player spawn present
- one exit present
- five blocks
- three enemies
- six interior columns

The player may override this bundled content through the map editor by saving a
modified version into slot `01`.

## Authoring constraints

Before a map is saved:

- it must contain exactly one player start
- it must contain exactly one exit
- all pieces must stay inside the 10x10 playable area
- overlapping placements are resolved in the editor before save

## Runtime loading order

When the game requests a slot number:

1. look for a browser-saved custom level for that slot
2. otherwise fall back to bundled default content for that slot
3. if nothing exists, treat the slot as unavailable
