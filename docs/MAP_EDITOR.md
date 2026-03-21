# Map Editor

## Purpose

The built-in map editor lets the player manage campaign maps directly from the
game while keeping the project compatible with GitHub Pages.

It is intended to stay:

- static-hosting friendly for reads
- explicit and testable for map conversion/validation
- compatible with the existing real-time gameplay core

## Entry point

Open the editor from the main menu using:

- `Generate Maps`

## Layout

The editor is organized into three areas:

### Left panel

- current editing mode and target save slot
- a separate counts/status block for Player, Exit, Blocks, Columns, and NPCs
- `New Map` action in its own section
- dividers separating summary, counts, `New Map`, and `Maps`
- list of published non-empty maps
- pagination controls for the map list when more than one page exists

Clicking a listed map loads it for editing.

### Center board

- always shows a **10x10 playable grid**
- starts as a blank map when entering the editor
- clicking a tile applies the currently selected tool

### Right panel

- selected-tool hint text
- dividers separating hint, palette, and action areas
- placement tools
- save-slot label positioned above the save-slot controls
- save-slot controls for new maps
- `Save Map`
- `Delete Map`
- `Download`
- `Upload`
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

## Save, clear, upload, and download rules

### New maps

- start blank
- use a chosen slot from **02** to **99**
- publish into the corresponding `public/maps/mapNN.json`

### Existing maps

- load from the left-side published map list
- save back into their current slot

### Save validation

- a map cannot be saved without a **Player**
- a map cannot be saved without an **Exit**
- failed validation shows a discreet status message in the editor header instead
  of silently saving invalid content

### Slot restrictions

- **Map 01**
  Can be modified, never cleared.
- **Maps 02-99**
  Can be modified, uploaded into, downloaded from, or cleared.

### Download

- exports the current slot as a JSON file
- uses the canonical `MapSlotFile` format
- lets you keep or share a copy of the exact published slot content

### Upload

- opens a local `.json` file picker
- rejects files that are too large
- parses JSON safely
- validates the exact slot-file schema before publishing
- writes the uploaded map back to the corresponding `mapNN.json` after
  validation succeeds

## GitHub publishing requirement

Publishing actions require a GitHub Personal Access Token with permission to
write repository contents for `tarikdsm/StoneAge`.

That applies to:

- `Save Map`
- `Delete Map`
- `Upload`

Token handling rules:

- the editor asks for the token only when a publish action is attempted
- the token is stored only in `sessionStorage`
- the token lasts only for the current browser tab/session
- if GitHub rejects the token, the editor clears the stored token and asks
  again next time

## Campaign integration

- The game always starts from **Map 01**
- After clearing a stage, the campaign moves to the next available non-empty
  map slot
- Published editor maps become part of that progression automatically

This means the editor is not a separate sandbox. It feeds the same campaign
sequence used by the game.

## Persistence model

- Canonical maps live in `public/maps/`
- GitHub Pages serves those JSON files to the game
- Publishing writes commits to the GitHub repository through the Contents API
- the Pages workflow redeploys the site after the push to `main`
- published changes may take a short time to appear on the live site

## Runtime conversion

The editor works on a 10x10 playable area, but gameplay still uses the authored
runtime board format with border walls.

On save or upload publish:

- the 10x10 playable grid is converted to runtime `LevelData`
- a 1-tile wall border is added
- the resulting runtime board becomes `12x12`
- the runtime level is wrapped into a published `MapSlotFile`

## Current limitations

- publishing from the hosted site requires a GitHub token with write access
- GitHub Pages refresh is not instantaneous after a publish
- map names and objective text are still mostly generated automatically
- only the current set of placeable items is supported

## Extension guidance

When extending the editor:

1. update `src/game/types/editor.ts` or `src/game/types/mapFile.ts`
2. update conversion/validation/publication logic in
   `src/game/data/levelRepository.ts`
3. update `src/game/scenes/MapEditorScene.ts`
4. add or update pure tests
5. update docs
