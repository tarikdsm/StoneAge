# Gameplay Mechanics

## Core loop

Stone Age: Ice Shift is a top-down, grid-aware push/crush game inspired by
Stone Age / Pengo.

The player must:

1. avoid enemy contact
2. use blocks to crush enemies
3. clear all enemies
4. move onto the goal tile

## Real-time simulation

The world no longer waits for turns.

- the simulation advances every frame using delta time
- enemies keep moving even while the player is idle
- the player moves continuously between tile centers while input is held
- pushes trigger immediately when a valid adjacent block is available
- win/lose state is evaluated continuously

The grid still matters for authored layout, occupancy, push legality, crush
checks, walls, and goals.

## Movement rules

- movement is continuous, but restricted to the four cardinal directions
- the player cannot enter walls, blocks, or living enemies
- if movement input stays held, the player starts the next lane segment as soon
  as the current one completes
- enemies use the same lane-based movement model

## Push rules

- a push only succeeds if a block is directly adjacent in the pushed direction
- the block destination must be inside the board
- the block destination cannot contain another block or a wall
- a successful push immediately starts block motion in the pushed direction
- if a living enemy occupies the destination cell, that enemy is crushed
- the player does not slide with the block in the current implementation
- repeated pushes are limited by a short player push cooldown

## Enemy behavior

- enemies pursue the player continuously instead of waiting for player actions
- each idle enemy chooses a legal adjacent lane segment that minimizes
  Manhattan distance to the player's current target tile
- walls and occupied block cells are never chosen
- enemies do not path into cells already reserved by other living enemies
- horizontal progress still wins tie-breaks over vertical progress

## Loss condition

The player loses if a living enemy reaches or intercepts the player's lane
occupancy.

This includes:

- both actors resolving onto the same tile
- an enemy entering the tile currently reserved by the player
- head-on lane swaps where movement paths directly cross

## Win condition

The player wins only when both conditions are true:

- all enemies are defeated
- the player is standing on a goal tile

Clearing all enemies without reaching the goal does not complete the stage.

## Restart behavior

After a win or loss:

- Enter restarts on desktop
- Space restarts on desktop
- pointer/touch input also restarts

## Input interpretation

### Desktop

- arrows / WASD: movement while held
- Space: push in the current facing direction
- left click: set movement intent relative to the player
- right click: trigger a push relative to the player

### Touch

- swipe: set movement intent
- tap near the player in the direction of an adjacent block: push intent
- other taps: movement intent

These rules are designed to reduce accidental pushes while keeping one-handed
touch play practical.

## Responsive presentation behavior

Responsive browser layout does not change gameplay rules.

- the entire authored board is automatically fitted inside roughly 80% of the
  browser viewport
- the board is centered in the viewport
- HUD panels adapt to the remaining browser space
- browser size changes do not change logical coordinates, actor speed, or
  collision rules

This means a larger or smaller browser window changes only presentation scale,
not simulation behavior.

## Level design assumptions

Current JSON-authored levels assume:

- rectangular board bounds
- optional border or interior walls
- one or more goal tiles
- zero or more blocks
- zero or more enemies
- one player spawn

If the game later introduces hazards, sliding, or more enemy variants, this
document should be updated together with the simulation implementation.
