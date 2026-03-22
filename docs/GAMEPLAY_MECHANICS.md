# Gameplay Mechanics

## Core loop

Stone Age: Ice Shift is a top-down, grid-aware push/crush game inspired by
Stone Age / Pengo.

The player must:

1. avoid enemy contact
2. use blocks to crush enemies
3. defeat all enemies

## Real-time simulation

The game is no longer turn-based.

- simulation advances every frame using delta time
- enemies keep moving while the player is idle
- actors travel continuously between tile centers
- occupancy, collision, pushing, crush checks, and victory checks are still
  grid-aware

This preserves readable/testable rules without falling back to hidden turns.

## Movement rules

- movement is continuous but restricted to the four cardinal directions
- the player cannot enter walls, blocks, or living enemies
- holding movement starts the next lane segment as soon as the current segment
  finishes
- enemies use the same lane-based real-time movement model

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
- if the pushed block is jammed against a wall, column, or another block, that
  same push action destroys the jammed block immediately

## Block launch rules

- on desktop, pressing **Space + a direction** launches an adjacent block in
  that direction
- the player stays in place while the block is launched
- the block keeps sliding tile-by-tile until the next hard obstacle
- walls, the board edge, and other blocks stop the launched block
- if the launched block reaches an NPC with open space ahead, it pushes that
  NPC forward instead of stopping
- NPCs are carried by the launched block until they are crushed against a wall
  or another solid block
- launched blocks can multi-kill by crushing more than one NPC in sequence
- the same behavior works horizontally and vertically
- launched blocks still respect the normal push cooldown
- on touch devices, a strong tap on an adjacent block triggers the same launch
  action

## Block replenishment

- original authored blocks remain the main resource for controlling enemies
- once every original block has been destroyed, the stage starts spawning a new
  block into a random empty playable cell every 10 seconds
- respawned blocks fade in from transparent to fully opaque so the player can
  read the new resource entering the board
- respawned blocks use the same movement, push, launch, crush, and destruction
  rules as authored blocks

## Enemy behavior

- enemies pursue the player continuously
- newly spawned enemies hatch into the board on a short stagger instead of all
  becoming active at once
- enemies move a bit slower than the player so chases stay readable while they
  still apply pressure
- each idle active enemy scores legal adjacent moves by the shortest walkable
  route to the player's current target tile
- walls and occupied block cells are never chosen as normal movement cells
- when routing is sealed by blocks, enemies can stop and dig through adjacent
  blocks
- when multiple moves are similarly good, a small deterministic randomness
  chooses among near-best options so the chase feels more arcade-like
- the final surviving enemy becomes faster

## Loss condition

The player loses when a living enemy reaches or intercepts the player's lane
occupancy.

This includes:

- sharing the same resolved tile
- an enemy entering the player's reserved destination tile
- head-on lane swaps

## Win condition

The player wins as soon as all enemies are defeated.

## Campaign progression

- The campaign always starts at **Map 01**.
- On stage clear, the game automatically advances to the next available map slot
  number greater than the current one.
- If there is no next available map, the campaign is complete.
- On campaign completion, the player returns to the menu on input.
- On defeat, the current map restarts on input.

The shipped campaign currently fills every slot from `01` through `99`, so the
default order is sequential. Sparse slot numbering is still supported by the
repository and editor if some slots are intentionally cleared later.

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
- generated maps still use the same movement, push, crush, enemy lifecycle, and
  victory rules
- the generator edits a 10x10 playable area that the runtime converts into the
  canonical 12x12 level format with border walls
- the generator publishes those authored levels as `public/maps/mapNN.json`
- the generator refuses to save maps without a Player start
- uploaded map JSON is validated before it can become part of the campaign
