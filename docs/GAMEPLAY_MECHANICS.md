# Gameplay Mechanics

## Core loop

The prototype is a top-down, grid-aware push/crush game inspired by Stone Age / Pengo.

The player must:

1. avoid enemy contact
2. push blocks to crush enemies
3. clear all enemies
4. move onto the exit goal tile

## Real-time simulation

The world no longer waits for discrete turns.

- the simulation advances every frame using delta time
- enemies keep moving even when the player is idle
- player movement is continuous between tile centers while input is held
- pushes trigger immediately when the player is aligned with an adjacent block
- win/lose state is evaluated continuously

The grid is still used for authored layouts, occupancy checks, goals, and block interactions.

## Movement rules

- movement is continuous over time, but constrained to cardinal grid lanes
- the player cannot enter walls, blocks, or living enemies
- when movement input is held, the player starts the next lane segment as soon as the current segment completes
- enemies use the same lane-based real-time movement model

## Push rules

- a push only succeeds if a block is directly adjacent in the pushed direction
- the block destination must be inside the board
- the block destination cannot contain another block or a wall
- a successful push immediately starts block motion in the pushed direction
- if a living enemy occupies the block destination lane cell, that enemy is crushed
- the player does not slide with the block in the current implementation

## Enemy behavior

- enemies pursue the player continuously instead of waiting for player actions
- each enemy picks a legal adjacent lane segment that minimizes Manhattan distance to the player's current lane target
- occupied wall/block tiles are never chosen
- enemies do not path into cells already reserved by other living enemies or the player
- ties still prefer horizontal progress before vertical progress

## Loss condition

The player loses if a living enemy reaches or intercepts the player's lane occupancy.

This includes both:

- sharing the same resolved tile
- crossing directly into the player's current lane reservation

## Win condition

The player wins only when both are true:

- all enemies are no longer alive
- the player is standing on a goal tile

Clearing all enemies without reaching the goal does not finish the stage.

## Input interpretation

### Desktop

- arrows / WASD: movement while held
- space: push in the last facing direction
- left click: set movement intent based on the clicked direction relative to the player
- right click: trigger a push intent based on the clicked direction relative to the player

### Touch

- swipe: set movement intent
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

If the game later introduces hazards, sliding, or multi-hit enemies, this document should be updated together with the core simulation implementation.
