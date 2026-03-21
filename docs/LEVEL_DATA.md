# Level Data

## Purpose

Levels are authored as JSON and loaded as static content. They define layout and
stage metadata, but they do not contain gameplay code.

The runtime contract for authored levels lives in
`src/game/types/level.ts`, while this document explains how that contract is
used by the game.

## Schema

Each level implements `LevelData`.

- `name`
  Display name shown in the HUD.
- `tileSize`
  Visual tile size in pixels used by the render layer.
- `width`, `height`
  Total logical board size in tiles.
  These values describe the full authored board bounds, not just the free
  interior area.
- `par`
  Advisory metadata reserved for balancing/scoring use.
- `objective`
  Player-facing objective text shown in the HUD.
- `playerSpawn`
  Starting player tile.
- `blocks`
  Initial pushable block positions.
- `enemies`
  Initial enemy definitions.
- `goals`
  Goal tiles that complete the stage after all enemies are defeated.
- `walls` (optional)
  Impassable blocked tiles for players, enemies, and pushed blocks.

## Runtime assumptions

- Coordinates are expressed in grid tiles, not pixels.
- All authored coordinates must stay inside `0 <= x < width` and
  `0 <= y < height`.
- Border walls are optional, but when authored they reduce the playable
  interior area.
- Walls are static obstacles.
- Blocks are movable only through gameplay push rules.
- Goals do not finish the stage until all enemies are defeated.

## Board sizing semantics

`width` and `height` describe the full logical board, including any authored
border walls.

Example:

- total board `12 x 12`
- border wall thickness `1`
- playable interior `10 x 10`

This distinction matters for both authored content and responsive board fitting
in the browser. The render layer always fits the entire authored board, not just
the free interior.

## Current stage: `level01.json`

File:

- `src/game/data/levels/level01.json`

Current authored state:

- total board: `12 x 12`
- playable interior with 1-tile border walls: `10 x 10`
- player spawn: `(5, 6)`
- five movable blocks
- three basic enemies
- one goal tile
- six fixed interior columns

The current opening layout keeps the existing entities in their prior positions
while expanding the authored board so the free interior is now `10 x 10`.

## Authoring checklist

When editing or adding a level:

1. confirm every coordinate is inside the total board bounds
2. confirm walls/goals/blocks/enemies do not accidentally overlap
3. confirm the player has meaningful opening movement space
4. confirm the stage remains valid for both keyboard/mouse and touch play
5. update docs if the schema or authoring conventions change
