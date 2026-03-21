# Gameplay Mechanics

## Core loop

Stone Age: Ice Shift is a top-down, grid-aware push/crush game inspired by
Stone Age / Pengo.

The player must:

1. avoid enemy contact
2. use blocks to crush enemies
3. defeat all enemies
4. move onto the exit tile

## Real-time simulation

The game is no longer turn-based.

- simulation advances every frame using delta time
- enemies keep moving while the player is idle
- actors travel continuously between tile centers
- occupancy, collision, pushing, crush checks, and goals are still grid-aware

This preserves readable/testable rules without falling back to hidden turns.

## Movement rules

- movement is continuous but restricted to the four cardinal directions
- the player cannot enter walls, blocks, or living enemies
- holding movement starts the next lane segment as soon as the current segment
  finishes
- enemies use the same lane-based real-time movement model
- when the player is pressed against a block that cannot move because of a
  wall, column, or another block, a second movement attempt in the same
  direction destroys that block

## Push rules

- moving into an adjacent block in a cardinal direction performs the normal
  one-tile push
- a push only succeeds if a block is directly adjacent in the pushed direction
- the destination cell must be inside the board
- the destination cell cannot contain another block or a wall
- a successful push immediately starts block motion
- if an enemy occupies that destination cell, the enemy is crushed
- the player does not slide with the block
- pushes are rate-limited by a short push cooldown
- blocks that are truly jammed do not slide; instead, they can be shattered by
  the second move attempt against them

## Block launch rules

- on desktop, pressing **Space + a direction** launches an adjacent block in
  that direction
- the player stays in place while the block is launched
- the block keeps sliding tile-by-tile until the next hard obstacle
- walls, the board edge, and other blocks stop the launched block
- if the launched block reaches an NPC, that NPC is crushed and the block stops
  on the impact tile
- the same behavior works horizontally and vertically
- launched blocks still respect the normal push cooldown
- on touch devices, a strong tap on an adjacent block triggers the same launch
  action

## Enemy behavior

- enemies pursue the player continuously
- enemies move a bit slower than the player so chases stay readable while they
  still apply pressure
- each idle enemy scores legal adjacent moves by the shortest walkable route to
  the player's current target tile
- walls and occupied block cells are never chosen
- enemies avoid cells already reserved by other living enemies
- when multiple moves are similarly good, enemies try to avoid immediately
  reversing their previous move
- a light per-enemy priority order helps symmetric enemies choose different
  sides of a maze more often

## Loss condition

The player loses when a living enemy reaches or intercepts the player's lane
occupancy.

This includes:

- sharing the same resolved tile
- an enemy entering the player's reserved destination tile
- head-on lane swaps

## Win condition

The player wins only when both conditions are true:

- all enemies are defeated
- the player is standing on a goal tile

## Campaign progression

- The campaign always starts at **Map 01**.
- On stage clear, the game automatically advances to the next available map slot
  number greater than the current one.
- If there is no next available map, the campaign is complete.
- On campaign completion, the player returns to the menu on input.
- On defeat, the current map restarts on input.

This means that if the available map slots are `01`, `02`, and `05`, the
campaign order is `01 -> 02 -> 05`.

## Restart and continue behavior

### After a loss

- the enemy that catches the player triggers a short devour animation
- the player flashes red, shrinks, and is pulled into the enemy before retry is
  available
- Enter restarts
- Space restarts
- click/tap restarts
- the HUD `Menu` button returns to the start screen immediately

### After the final win

- Enter returns to the menu
- Space returns to the menu
- click/tap returns to the menu
- the HUD `Menu` button remains available here as well

## Input interpretation

### Desktop gameplay input

- arrows / WASD: movement while held, including normal push into adjacent
  blocks
- Space + arrows / WASD: launch an adjacent block in that direction
- left click: set movement intent relative to the player
- right click: trigger a push relative to the player

### Touch gameplay input

- swipe: movement intent, including normal push into adjacent blocks
- tap near the player in the direction of an adjacent block: push intent
- strong tap near the player in the direction of an adjacent block: launch
  intent
- other taps: movement intent

These rules reduce accidental pushes while keeping touch play practical.

## Responsive presentation behavior

Responsive browser layout does not change gameplay rules.

- the entire canonical 12x12 runtime board is auto-fitted into the browser viewport
- the board remains centered
- HUD layout adapts separately from the gameplay board
- viewport size changes never change logical coordinates or game rules

## Relationship to the map generator

The map generator changes authored content, not runtime rules.

- generated maps still run through the same `StageState` core
- generated maps still use the same movement, push, crush, and victory rules
- the generator edits a 10x10 playable area that the runtime converts into the
  canonical 12x12 level format with border walls
- the generator publishes those authored levels as `public/maps/mapNN.json`
- the generator refuses to save maps without a Player start and an Exit
- uploaded map JSON is validated before it can become part of the campaign
