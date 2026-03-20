import type { Direction, EnemyDefinition, GridPoint, LevelData } from '../types/level'
import { addPoints, directionVectors, samePoint } from '../utils/grid'

const PLAYER_SPEED = 5.6
const ENEMY_SPEED = 3.1
const BLOCK_PUSH_SPEED = 7.2
const PUSH_COOLDOWN_MS = 180

export interface MotionState {
  from: GridPoint
  to: GridPoint
  direction: Direction
  progress: number
}

export interface ActorState {
  gridPosition: GridPoint
  worldPosition: GridPoint
  motion?: MotionState
}

export interface BlockState extends ActorState {
  id: string
}

export interface EnemyState extends ActorState {
  id: string
  type: EnemyDefinition['type']
  alive: boolean
}

export interface PlayerState extends ActorState {
  facing: Direction
  pushCooldownMs: number
}

export interface StageState {
  player: PlayerState
  blocks: BlockState[]
  enemies: EnemyState[]
  elapsedMs: number
  status: 'playing' | 'won' | 'lost'
  message: string
}

export interface SimulationInput {
  moveDirection?: Direction
  pushDirection?: Direction
}

export interface SimulationOutcome {
  pushedBlockId?: string
  crushedEnemyIds: string[]
  playerMoved: boolean
  statusChanged: boolean
}

export function createStageState(level: LevelData): StageState {
  return {
    player: createPlayerState(level.playerSpawn),
    blocks: level.blocks.map((block, index) => createBlockState(`block-${index}`, block)),
    enemies: level.enemies.map((enemy, index) => createEnemyState(`enemy-${index}`, enemy.type, enemy)),
    elapsedMs: 0,
    status: 'playing',
    message: 'Keep moving. Crush the raiders and reach the exit.'
  }
}

export function stepStageState(level: LevelData, state: StageState, input: SimulationInput, deltaMs: number): SimulationOutcome {
  const outcome: SimulationOutcome = {
    crushedEnemyIds: [],
    playerMoved: false,
    statusChanged: false
  }

  if (state.status !== 'playing') {
    return outcome
  }

  state.elapsedMs += deltaMs
  state.player.pushCooldownMs = Math.max(0, state.player.pushCooldownMs - deltaMs)

  const pushDirection = input.pushDirection ?? input.moveDirection ?? state.player.facing
  if (pushDirection) {
    state.player.facing = pushDirection
  }

  if (pushDirection && state.player.pushCooldownMs <= 0 && !state.player.motion) {
    const pushResult = attemptPush(level, state, pushDirection)
    if (pushResult) {
      state.player.pushCooldownMs = PUSH_COOLDOWN_MS
      outcome.pushedBlockId = pushResult.blockId
      outcome.crushedEnemyIds.push(...pushResult.crushedEnemyIds)
    }
  }

  if (input.moveDirection) {
    state.player.facing = input.moveDirection
  }

  if (input.moveDirection && !state.player.motion) {
    outcome.playerMoved = startPlayerMove(level, state, input.moveDirection)
  }

  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.motion) {
      continue
    }

    const direction = chooseEnemyDirection(level, state, enemy)
    if (direction) {
      startMotion(enemy, direction)
    }
  }

  advanceActor(state.player, PLAYER_SPEED, deltaMs)
  for (const block of state.blocks) {
    advanceActor(block, BLOCK_PUSH_SPEED, deltaMs)
  }
  for (const enemy of state.enemies) {
    if (enemy.alive) {
      advanceActor(enemy, ENEMY_SPEED, deltaMs)
    }
  }

  const previousStatus = state.status
  updateStageStatus(level, state)
  state.message = describeState(level, state)
  outcome.statusChanged = previousStatus !== state.status
  return outcome
}

export function isGoal(level: LevelData, point: GridPoint): boolean {
  return level.goals.some((goal) => samePoint(goal, point))
}

export function describeState(level: LevelData, state: StageState): string {
  if (state.status === 'won') {
    return 'Stage clear! Tap or press Enter to play again.'
  }

  if (state.status === 'lost') {
    return 'You were caught. Tap or press Enter to retry.'
  }

  if (state.enemies.every((enemy) => !enemy.alive)) {
    return isGoal(level, state.player.gridPosition)
      ? 'Stage clear!'
      : 'The exit is open. Move onto the glowing tile.'
  }

  return 'Raiders keep moving. Use blocks to crush them safely.'
}

function createPlayerState(spawn: GridPoint): PlayerState {
  return {
    gridPosition: { ...spawn },
    worldPosition: { ...spawn },
    facing: 'right',
    pushCooldownMs: 0
  }
}

function createBlockState(id: string, position: GridPoint): BlockState {
  return {
    id,
    gridPosition: { ...position },
    worldPosition: { ...position }
  }
}

function createEnemyState(id: string, type: EnemyDefinition['type'], position: GridPoint): EnemyState {
  return {
    id,
    type,
    alive: true,
    gridPosition: { ...position },
    worldPosition: { ...position }
  }
}

function advanceActor(actor: ActorState, speedTilesPerSecond: number, deltaMs: number): void {
  if (!actor.motion) {
    actor.worldPosition = { ...actor.gridPosition }
    return
  }

  actor.motion.progress = Math.min(1, actor.motion.progress + (speedTilesPerSecond * deltaMs) / 1000)
  actor.worldPosition = interpolate(actor.motion.from, actor.motion.to, actor.motion.progress)

  if (actor.motion.progress >= 1) {
    actor.gridPosition = { ...actor.motion.to }
    actor.worldPosition = { ...actor.motion.to }
    actor.motion = undefined
  }
}

function interpolate(from: GridPoint, to: GridPoint, progress: number): GridPoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress
  }
}

function attemptPush(level: LevelData, state: StageState, direction: Direction): { blockId: string; crushedEnemyIds: string[] } | undefined {
  const blockOrigin = addPoints(state.player.gridPosition, directionVectors[direction])
  const block = state.blocks.find((candidate) => samePoint(candidate.gridPosition, blockOrigin) && !candidate.motion)
  if (!block) {
    return undefined
  }

  const destination = addPoints(block.gridPosition, directionVectors[direction])
  if (!canBlockOccupy(level, state, destination, block.id)) {
    return undefined
  }

  const crushedEnemyIds = crushEnemiesInCell(state, destination)
  startMotion(block, direction)
  return {
    blockId: block.id,
    crushedEnemyIds
  }
}

function startPlayerMove(level: LevelData, state: StageState, direction: Direction): boolean {
  const destination = addPoints(state.player.gridPosition, directionVectors[direction])
  if (!canActorOccupy(level, state, destination)) {
    return false
  }

  startMotion(state.player, direction)
  return true
}

function chooseEnemyDirection(level: LevelData, state: StageState, enemy: EnemyState): Direction | undefined {
  const directions: Direction[] = ['left', 'right', 'up', 'down']
  const playerTarget = state.player.motion?.to ?? state.player.gridPosition

  const ranked = directions
    .map((direction) => ({
      direction,
      destination: addPoints(enemy.gridPosition, directionVectors[direction])
    }))
    .filter(({ destination }) => canEnemyOccupy(level, state, enemy.id, destination))
    .sort((a, b) => {
      const aDistance = Math.abs(a.destination.x - playerTarget.x) + Math.abs(a.destination.y - playerTarget.y)
      const bDistance = Math.abs(b.destination.x - playerTarget.x) + Math.abs(b.destination.y - playerTarget.y)
      if (aDistance !== bDistance) {
        return aDistance - bDistance
      }

      const aHorizontal = Math.abs(a.destination.x - enemy.gridPosition.x)
      const bHorizontal = Math.abs(b.destination.x - enemy.gridPosition.x)
      return bHorizontal - aHorizontal
    })

  return ranked[0]?.direction
}

function canActorOccupy(level: LevelData, state: StageState, point: GridPoint): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !isBlockOccupyingCell(state.blocks, point)
    && !isEnemyOccupyingCell(state.enemies, point)
}

function canEnemyOccupy(level: LevelData, state: StageState, enemyId: string, point: GridPoint): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !isBlockOccupyingCell(state.blocks, point)
    && !state.enemies.some((enemy) => enemy.alive && enemy.id !== enemyId && occupiesCell(enemy, point))
}

function canBlockOccupy(level: LevelData, state: StageState, point: GridPoint, movingBlockId: string): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !state.blocks.some((block) => block.id !== movingBlockId && occupiesCell(block, point))
}

function crushEnemiesInCell(state: StageState, point: GridPoint): string[] {
  const crushedEnemyIds: string[] = []

  for (const enemy of state.enemies) {
    if (!enemy.alive || !occupiesCell(enemy, point)) {
      continue
    }

    enemy.alive = false
    enemy.motion = undefined
    enemy.gridPosition = { ...point }
    enemy.worldPosition = { ...point }
    crushedEnemyIds.push(enemy.id)
  }

  return crushedEnemyIds
}

function startMotion(actor: ActorState, direction: Direction): void {
  const from = { ...actor.gridPosition }
  const to = addPoints(from, directionVectors[direction])
  actor.motion = {
    from,
    to,
    direction,
    progress: 0
  }
  actor.worldPosition = { ...from }
}

function updateStageStatus(level: LevelData, state: StageState): void {
  if (playerCaught(state)) {
    state.status = 'lost'
    return
  }

  if (state.enemies.every((enemy) => !enemy.alive) && !state.player.motion && isGoal(level, state.player.gridPosition)) {
    state.status = 'won'
    return
  }

  state.status = 'playing'
}

function playerCaught(state: StageState): boolean {
  for (const enemy of state.enemies) {
    if (!enemy.alive) {
      continue
    }

    if (samePoint(enemy.gridPosition, state.player.gridPosition) && !enemy.motion && !state.player.motion) {
      return true
    }

    if (occupiesCell(enemy, state.player.gridPosition) || occupiesCell(state.player, enemy.gridPosition)) {
      return true
    }

    if (enemy.motion && state.player.motion) {
      const sameDestination = samePoint(enemy.motion.to, state.player.motion.to)
      const swapped = samePoint(enemy.motion.from, state.player.motion.to) && samePoint(enemy.motion.to, state.player.motion.from)
      if (sameDestination || swapped) {
        return true
      }
    }
  }

  return false
}

function isBlockOccupyingCell(blocks: BlockState[], point: GridPoint): boolean {
  return blocks.some((block) => occupiesCell(block, point))
}

function isEnemyOccupyingCell(enemies: EnemyState[], point: GridPoint): boolean {
  return enemies.some((enemy) => enemy.alive && occupiesCell(enemy, point))
}

function occupiesCell(actor: ActorState, point: GridPoint): boolean {
  if (samePoint(actor.gridPosition, point)) {
    return true
  }

  return actor.motion ? samePoint(actor.motion.to, point) : false
}

function isInside(level: LevelData, point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < level.width && point.y < level.height
}

function isWall(level: LevelData, point: GridPoint): boolean {
  return level.walls?.some((wall) => samePoint(wall, point)) ?? false
}
