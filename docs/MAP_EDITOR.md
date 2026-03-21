# Map Editor

## Purpose

The built-in map editor lets the player manage campaign maps directly in the
browser without any backend service.

It is intended to stay:

- static-hosting friendly
- easy to reason about
- compatible with the existing real-time gameplay core

## Entry point

Open the editor from the main menu using:

- `Generate Maps`

## Layout

The editor is organized into three areas:

### Left panel

- current editing mode and target save slot
- `New Map` action at the top
- list of existing maps
- pagination controls for the map list when more than one page exists

Clicking a listed map loads it for editing.

### Center board

- always shows a **10x10 playable grid**
- starts as a blank map when entering the editor
- clicking a tile applies the currently selected tool

### Right panel

- selected-tool hint text
- placement tools
- save-slot controls for new maps
- save action
- delete action
- placement hints and validation feedback

## Tools

Current palette options:

1. **Player**
   Starting tile for the player.
2. **Blocks**
   Pushable blocks.
3. **Columns**
   Fixed blocking columns.
4. **NPCs**
   Enemy spawn tiles.
5. **Exit**
   Goal tile required for stage completion.
6. **Eraser**
   Removes any existing item from the clicked tile.

## Placement rules

- **Player** is limited to one.
- **Exit** is limited to one.
- **Blocks**, **Columns**, and **NPCs** may have multiple placements.
- Clicking the same tile again with the same tool removes that placement.
- Placing a different tool on an occupied tile replaces the old occupant.
- The **Eraser** removes the current occupant without placing a replacement.

## Save and delete rules

### New maps

- start blank
- use a chosen slot from **02** to **99**
- save into browser storage

### Existing maps

- load from the left-side map list
- save back into their current slot

### Save validation

- a map cannot be saved without a **Player**
- a map cannot be saved without an **Exit**
- failed validation shows a discreet status message in the editor header instead
  of silently saving invalid content

### Slot restrictions

- **Map 01**
  Can be modified, never deleted.
- **Maps 02-99**
  Can be modified or deleted.

## Campaign integration

- The game always starts from **Map 01**
- After clearing a stage, the campaign moves to the next available map slot
- Saved editor maps become part of that progression automatically

This means the editor is not a separate sandbox. It feeds the same campaign
sequence used by the game.

## Persistence

- Maps are stored via browser `localStorage`
- No server or backend is required
- Maps are local to the browser profile/device

## Runtime conversion

The editor works on a 10x10 playable area, but gameplay still uses the authored
runtime board format with border walls.

On save:

- the 10x10 playable grid is converted to runtime `LevelData`
- a 1-tile wall border is added
- the resulting runtime board becomes `12x12`

## Current limitations

- map names and objective text are currently generated/managed automatically
- there is no import/export flow yet
- persistence is local to the browser only
- only the current set of placeable items is supported

## Extension guidance

When extending the editor:

1. update `src/game/types/editor.ts`
2. update conversion/persistence logic in `src/game/data/levelRepository.ts`
3. update `src/game/scenes/MapEditorScene.ts`
4. add or update pure tests
5. update docs
