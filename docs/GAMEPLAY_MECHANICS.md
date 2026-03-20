# Gameplay Mechanics

## Core loop

The prototype is a top-down, grid-based push/crush game inspired by Stone Age / Pengo.

The player must:

1. avoid enemy contact
2. push blocks to crush enemies
3. clear all enemies
4. move onto the exit goal tile

## Turn order

Each resolved command follows this sequence:

1. player command is interpreted as either `move` or `push`
2. player action is applied if legal
3. any enemy crushed by a pushed block is removed from active play
4. surviving enemies take one move each
5. win/lose state is evaluated
6. status text is updated for the HUD

This ordering is important and should remain documented if it changes.

## Movement rules

- movement is one tile at a time
- the player cannot move into walls
- the player cannot move into blocks
- the player cannot move into living enemies
- an invalid move still consumes the turn because enemies act after the attempted command

## Push rules

- a push only succeeds if a block is directly adjacent in the pushed direction
- the block destination must be inside the board
- the block destination cannot contain another block or a wall
- if a living enemy occupies the destination tile, the enemy is crushed and the block still moves into that tile
- the player does not move during a push in the current implementation

## Enemy behavior

- enemies move after the player action
- each enemy chooses the legal tile that minimizes Manhattan distance to the player
- occupied wall/block tiles are never chosen
- enemies do not move into tiles occupied by other living enemies
- ties currently prefer horizontal progress before vertical progress

## Loss condition

The player loses if a living enemy occupies the same tile as the player after enemy movement resolves.

## Win condition

The player wins only when both are true:

- all enemies are no longer alive
- the player is standing on a goal tile

Clearing all enemies without reaching the goal does not finish the stage.

## Input interpretation

### Desktop

- arrows / WASD: move
- space: push in the last facing direction
- left click: movement intent based on the clicked direction relative to the player
- right click: push intent based on the clicked direction relative to the player

### Touch

- swipe: movement intent
- tap near the player in the direction of an adjacent block: push intent
- other taps resolve to movement intent

These rules exist to reduce accidental pushes while preserving one-handed mobile play.

## Level design assumptions

Current JSON-authored levels assume:

- rectangular grid bounds
- optional interior walls
- one or more goal tiles
- zero or more blocks
- zero or more enemies
- one player spawn

If the game later introduces hazards, sliding, or multi-hit enemies, this document should be updated together with the core rule implementation.
