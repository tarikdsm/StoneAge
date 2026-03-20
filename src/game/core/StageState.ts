import type { Direction, EnemyDefinition, GridPoint, LevelData } from '../types/level'
import { addPoints, directionVectors, samePoint } from '../utils/grid'

/** Pushable block state tracked by the pure turn resolver. */
export interface BlockState {
  id: string
  position: GridPoint
}

/** Living/dead enemy state tracked independently from Phaser display objects. */
export interface EnemyState {
  id: string
  type: EnemyDefinition['type']
  position: GridPoint
  alive: boolean
}

/**
 * Authoritative gameplay state for a single stage.
 *
 * `GameScene` renders from this structure, but gameplay rules are resolved here
 * so they can be tested without Phaser.
 */
export interface StageState {
  player: GridPoint
  blocks: BlockState[]
  enemies: EnemyState[]
  turn: number
  status: 'playing' | 'won' | 'lost'
  message: string
}

/**
 * Result payload returned after a command is resolved.
 *
 * The outcome intentionally includes enough metadata for scenes to animate and
 * present feedback without re-deriving gameplay rules from visual state.
 */
export interface TurnOutcome {
  state: StageState
  playerMoved: boolean
  pushedBlockId?: string
  crushedEnemyIds: string[]
  enemyMoves: Array<{ id: string; from: GridPoint; to: GridPoint }>
}

/** Creates a fresh runtime state from immutable level content. */
export function createStageState(level: LevelData): StageState {
  return {
    player: { ...level.playerSpawn },
    blocks: level.blocks.map((block, index) => ({ id: `block-${index}`, position: { ...block } })),
    enemies: level.enemies.map((enemy, index) => ({
      id: `enemy-${index}`,
      type: enemy.type,
      position: { x: enemy.x, y: enemy.y },
      alive: true
    })),
    turn: 0,
    status: 'playing',
    message: 'Clear the raiders with clever shoves.'
  }
}

/**
 * Resolves one player command and the full enemy response turn.
 *
 * Order of operations:
 * 1. apply the player move/push if legal
 * 2. crush any enemy displaced by a pushed block
 * 3. move surviving enemies one at a time
 * 4. evaluate win/lose messaging for the resulting state
 */
export function resolveTurn(level: LevelData, state: StageState, command: { type: 'move' | 'push'; direction: Direction }): TurnOutcome {
  if (state.status !== 'playing') {
    return { state, playerMoved: false, crushedEnemyIds: [], enemyMoves: [] }
  }

  const nextState = cloneState(state)
  let playerMoved = false
  let pushedBlockId: string | undefined
  const crushedEnemyIds: string[] = []
  const vector = directionVectors[command.direction]

  if (command.type === 'move') {
    const target = addPoints(nextState.player, vector)
    if (canOccupy(level, target, nextState.blocks, nextState.enemies)) {
      nextState.player = target
      playerMoved = true
    }
  } else {
    const blockTarget = addPoints(nextState.player, vector)
    const block = nextState.blocks.find((candidate) => samePoint(candidate.position, blockTarget))

    if (block) {
      const destination = addPoints(block.position, vector)
      if (canBlockMoveTo(level, destination, nextState.blocks)) {
        const enemy = nextState.enemies.find((candidate) => candidate.alive && samePoint(candidate.position, destination))
        if (enemy) {
          enemy.alive = false
          crushedEnemyIds.push(enemy.id)
        }

        block.position = destination
        pushedBlockId = block.id
      }
    }
  }

  const enemyMoves = moveEnemies(level, nextState)
  nextState.turn += 1
  nextState.message = describeState(level, nextState)

  return { state: nextState, playerMoved, pushedBlockId, crushedEnemyIds, enemyMoves }
}

/** Returns whether a tile is legally occupiable by the player or an enemy. */
export function canOccupy(level: LevelData, point: GridPoint, blocks: BlockState[], enemies: EnemyState[]): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !blocks.some((block) => samePoint(block.position, point))
    && !enemies.some((enemy) => enemy.alive && samePoint(enemy.position, point))
}

/** Returns whether a pushed block may enter the destination tile. */
export function canBlockMoveTo(level: LevelData, point: GridPoint, blocks: BlockState[]): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !blocks.some((block) => samePoint(block.position, point))
}

/**
 * Resolves the enemy phase after the player action.
 *
 * Enemies move sequentially in array order. A loss occurs if any living enemy
 * reaches the player's tile after movement. A win requires all enemies to be
 * defeated and the player to already be standing on a goal tile.
 */
export function moveEnemies(level: LevelData, state: StageState): Array<{ id: string; from: GridPoint; to: GridPoint }> {
  const moves: Array<{ id: string; from: GridPoint; to: GridPoint }> = []

  for (const enemy of state.enemies) {
    if (!enemy.alive || state.status !== 'playing') {
      continue
    }

    const next = chooseEnemyMove(level, enemy.position, state.player, state.blocks, state.enemies, enemy.id)
    const from = { ...enemy.position }
    enemy.position = next
    moves.push({ id: enemy.id, from, to: { ...next } })

    if (samePoint(enemy.position, state.player)) {
      state.status = 'lost'
    }
  }

  if (state.status === 'playing' && state.enemies.every((enemy) => !enemy.alive) && isGoal(level, state.player)) {
    state.status = 'won'
  }

  return moves
}

/** Maps the current state to the HUD message shown to the player. */
export function describeState(level: LevelData, state: StageState): string {
  if (state.status === 'won') {
    return 'Stage clear! Tap or press Enter to play again.'
  }

  if (state.status === 'lost') {
    return 'You were caught. Tap or press Enter to retry.'
  }

  if (state.enemies.every((enemy) => !enemy.alive)) {
    return isGoal(level, state.player)
      ? 'Stage clear!'
      : 'All raiders are down. Head to the glowing exit.'
  }

  return 'Crush raiders, then step onto the exit.'
}

/** Returns whether the specified tile is one of the level's exit goals. */
export function isGoal(level: LevelData, point: GridPoint): boolean {
  return level.goals.some((goal) => samePoint(goal, point))
}

/**
 * Chooses the enemy's next tile using the current prototype AI rule set.
 *
 * The enemy selects the legal move that minimizes Manhattan distance to the
 * player. Ties currently favor horizontal progress to keep movement stable.
 */
function chooseEnemyMove(
  level: LevelData,
  enemyPosition: GridPoint,
  playerPosition: GridPoint,
  blocks: BlockState[],
  enemies: EnemyState[],
  enemyId: string
): GridPoint {
  const directions: Direction[] = ['left', 'right', 'up', 'down']

  const ranked = directions
    .map((direction) => addPoints(enemyPosition, directionVectors[direction]))
    .filter((point) => isInside(level, point) && !isWall(level, point))
    .filter((point) => !blocks.some((block) => samePoint(block.position, point)))
    .filter((point) => !enemies.some((enemy) => enemy.alive && enemy.id !== enemyId && samePoint(enemy.position, point)))
    .sort((a, b) => {
      const aDistance = Math.abs(a.x - playerPosition.x) + Math.abs(a.y - playerPosition.y)
      const bDistance = Math.abs(b.x - playerPosition.x) + Math.abs(b.y - playerPosition.y)
      if (aDistance !== bDistance) {
        return aDistance - bDistance
      }

      const aHorizontal = Math.abs(a.x - enemyPosition.x)
      const bHorizontal = Math.abs(b.x - enemyPosition.x)
      return bHorizontal - aHorizontal
    })

  return ranked[0] ?? enemyPosition
}

/** Bounds check against logical board dimensions, not world-space pixels. */
function isInside(level: LevelData, point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < level.width && point.y < level.height
}

/** Returns whether a tile is blocked by authored wall content. */
function isWall(level: LevelData, point: GridPoint): boolean {
  return level.walls?.some((wall) => samePoint(wall, point)) ?? false
}

/** Defensive clone so pure turn resolution never mutates the caller's state. */
function cloneState(state: StageState): StageState {
  return {
    player: { ...state.player },
    blocks: state.blocks.map((block) => ({ id: block.id, position: { ...block.position } })),
    enemies: state.enemies.map((enemy) => ({ id: enemy.id, type: enemy.type, alive: enemy.alive, position: { ...enemy.position } })),
    turn: state.turn,
    status: state.status,
    message: state.message
  }
}
