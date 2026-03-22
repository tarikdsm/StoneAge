import {
  applyRunProgressUpdate,
  createRunProgressState,
  type RunProgressState
} from '../../core/RunProgress'
import {
  createStageState,
  stepStageState,
  type SimulationInput,
  type StageState
} from '../../core/StageState'
import type { Direction, LevelData } from '../../types/level'
import {
  PLAYABLE_AREA_HEIGHT,
  PLAYABLE_AREA_WIDTH,
  isInsideRuntimePlayableArea,
  toPlayableAreaPoint,
  toRuntimeBoardPoint
} from '../../utils/boardGeometry'

export const HEADLESS_ACTION_COUNT = 10
export const DEFAULT_HEADLESS_DECISION_REPEAT = 4
export const DEFAULT_HEADLESS_SUBSTEP_MS = 50
export const DEFAULT_HEADLESS_MAX_DECISION_STEPS = 600

const DIRECTION_TO_INDEX: Record<Direction, number> = {
  up: 0,
  down: 1,
  left: 2,
  right: 3
}

const GRID_CELL_EMPTY = 0
const GRID_CELL_PLAYER = 1
const GRID_CELL_BLOCK_ORIGINAL = 2
const GRID_CELL_BLOCK_RESPAWNED = 3
const GRID_CELL_ENEMY_ACTIVE = 4
const GRID_CELL_ENEMY_SPAWNING = 5
const GRID_CELL_ENEMY_DIGGING = 6
const GRID_CELL_COLUMN = 7
const GRID_CELL_PLAYER_CAUGHT = 8

export interface HeadlessSimulatorConfig {
  mapId: string
  level: LevelData
  seed?: number
  maxDecisionSteps?: number
  defaultDecisionRepeat?: number
  substepDeltaMs?: number
}

export interface HeadlessObservation {
  grid: number[]
  player_position: [number, number]
  player_facing: number
  player_motion_active: number
  push_cooldown_ms: number
  enemies_alive: number
  blocks_active: number
  original_blocks_active: number
  respawned_blocks_active: number
  block_respawn_timer_ms: number
  elapsed_ms: number
  raw_score: number
}

export interface HeadlessStepInfo {
  map_id: string
  cleared: boolean
  dead: boolean
  kills: number
  raw_score: number
  decision_steps: number
  sim_steps: number
  action: number
  action_effective: boolean
  stage_status: StageState['status']
  stage_elapsed_ms: number
  state_signature: string
}

export interface HeadlessStepResult {
  observation: HeadlessObservation
  raw_score: number
  terminated: boolean
  truncated: boolean
  info: HeadlessStepInfo
}

/**
 * Pure headless wrapper around the authoritative TypeScript gameplay core.
 *
 * It keeps the RL bridge out of Phaser by:
 * - creating/resetting deterministic `StageState` snapshots
 * - mapping discrete RL actions to the same normalized input contract used by gameplay
 * - advancing the simulation in fixed substeps
 * - serializing a compact numeric observation for Python consumption
 */
export class StoneAgeHeadlessSimulator {
  private state!: StageState
  private runProgress: RunProgressState = createRunProgressState()
  private readonly mapId: string
  private readonly level: LevelData
  private readonly maxDecisionSteps: number
  private readonly defaultDecisionRepeat: number
  private readonly substepDeltaMs: number
  private baseSeed?: number
  private decisionSteps = 0
  private simSteps = 0
  private kills = 0

  constructor(config: HeadlessSimulatorConfig) {
    this.mapId = config.mapId
    this.level = config.level
    this.maxDecisionSteps = config.maxDecisionSteps ?? DEFAULT_HEADLESS_MAX_DECISION_STEPS
    this.defaultDecisionRepeat = config.defaultDecisionRepeat ?? DEFAULT_HEADLESS_DECISION_REPEAT
    this.substepDeltaMs = config.substepDeltaMs ?? DEFAULT_HEADLESS_SUBSTEP_MS
    this.baseSeed = config.seed
    this.reset(config.seed)
  }

  reset(seed = this.baseSeed): HeadlessStepResult {
    this.baseSeed = seed
    this.state = createStageState(this.level, { seed })
    this.runProgress = createRunProgressState()
    this.decisionSteps = 0
    this.simSteps = 0
    this.kills = 0
    return this.createStepResult(0, false)
  }

  step(action: number, decisionRepeat = this.defaultDecisionRepeat): HeadlessStepResult {
    validateAction(action)

    if (this.isTerminal()) {
      return this.createStepResult(action, false)
    }

    const repeats = Math.max(1, Math.floor(decisionRepeat))
    const actionInput = mapActionToSimulationInput(action, this.state.player.facing)
    const preSignature = buildStateSignature(this.state)

    for (let substepIndex = 0; substepIndex < repeats; substepIndex += 1) {
      if (this.isTerminal()) {
        break
      }

      const outcome = stepStageState(this.level, this.state, actionInput, this.substepDeltaMs)
      const progressUpdate = applyRunProgressUpdate(this.runProgress, {
        stageElapsedMs: this.state.elapsedMs,
        crushedEnemyCount: outcome.crushedEnemyIds.length,
        stageStatus: this.state.status,
        statusChanged: outcome.statusChanged
      })

      this.runProgress = progressUpdate.progress
      this.kills += outcome.crushedEnemyIds.length
      this.simSteps += 1
    }

    this.decisionSteps += 1
    const postSignature = buildStateSignature(this.state)
    return this.createStepResult(action, preSignature !== postSignature)
  }

  close(): void {
    this.runProgress = createRunProgressState()
  }

  private isTerminal(): boolean {
    return this.state.status !== 'playing' || this.decisionSteps >= this.maxDecisionSteps
  }

  private createStepResult(action: number, actionEffective: boolean): HeadlessStepResult {
    const observation = buildObservation(this.level, this.state, this.runProgress.score)
    const terminated = this.state.status !== 'playing'
    const truncated = !terminated && this.decisionSteps >= this.maxDecisionSteps

    return {
      observation,
      raw_score: this.runProgress.score,
      terminated,
      truncated,
      info: {
        map_id: this.mapId,
        cleared: this.state.status === 'won',
        dead: this.state.status === 'lost',
        kills: this.kills,
        raw_score: this.runProgress.score,
        decision_steps: this.decisionSteps,
        sim_steps: this.simSteps,
        action,
        action_effective: actionEffective,
        stage_status: this.state.status,
        stage_elapsed_ms: this.state.elapsedMs,
        state_signature: buildStateSignature(this.state)
      }
    }
  }
}

export function mapActionToSimulationInput(action: number, facing: Direction): SimulationInput {
  switch (action) {
    case 0:
      return {}
    case 1:
      return { moveDirection: 'up' }
    case 2:
      return { moveDirection: 'down' }
    case 3:
      return { moveDirection: 'left' }
    case 4:
      return { moveDirection: 'right' }
    case 5:
      return { moveDirection: 'up', throwDirection: 'up' }
    case 6:
      return { moveDirection: 'down', throwDirection: 'down' }
    case 7:
      return { moveDirection: 'left', throwDirection: 'left' }
    case 8:
      return { moveDirection: 'right', throwDirection: 'right' }
    case 9:
      return { throwDirection: facing }
    default:
      throw new Error(`Unsupported action ${action}. Expected a value between 0 and 9.`)
  }
}

export function buildObservation(level: LevelData, state: StageState, rawScore: number): HeadlessObservation {
  const playerPlayablePoint = toPlayableOrClamp(state.player.gridPosition)
  const originalBlocks = state.blocks.filter((block) => block.source === 'original').length
  const respawnedBlocks = state.blocks.filter((block) => block.source === 'respawned').length

  return {
    grid: buildPlayableGrid(level, state),
    player_position: [playerPlayablePoint.x, playerPlayablePoint.y],
    player_facing: DIRECTION_TO_INDEX[state.player.facing],
    player_motion_active: state.player.motion ? 1 : 0,
    push_cooldown_ms: state.player.pushCooldownMs,
    enemies_alive: state.enemies.filter((enemy) => enemy.alive).length,
    blocks_active: state.blocks.length,
    original_blocks_active: originalBlocks,
    respawned_blocks_active: respawnedBlocks,
    block_respawn_timer_ms: state.blockRespawnTimerMs,
    elapsed_ms: state.elapsedMs,
    raw_score: rawScore
  }
}

export function buildStateSignature(state: StageState): string {
  return JSON.stringify({
    status: state.status,
    player: {
      x: state.player.gridPosition.x,
      y: state.player.gridPosition.y,
      facing: state.player.facing,
      cooldown: Math.floor(state.player.pushCooldownMs / 50),
      motion: state.player.motion?.to ?? null
    },
    blocks: state.blocks.map((block) => ({
      id: block.id,
      x: block.gridPosition.x,
      y: block.gridPosition.y,
      slide: block.slideDirection ?? null,
      motion: block.motion?.to ?? null,
      source: block.source
    })),
    enemies: state.enemies.map((enemy) => ({
      id: enemy.id,
      alive: enemy.alive,
      phase: enemy.phase,
      x: enemy.gridPosition.x,
      y: enemy.gridPosition.y,
      motion: enemy.motion?.to ?? null
    })),
    respawn: Math.floor(state.blockRespawnTimerMs / 100)
  })
}

function buildPlayableGrid(level: LevelData, state: StageState): number[] {
  const grid: number[] = []

  for (let y = 0; y < PLAYABLE_AREA_HEIGHT; y += 1) {
    for (let x = 0; x < PLAYABLE_AREA_WIDTH; x += 1) {
      const runtimePoint = toRuntimeBoardPoint({ x, y })
      const playerOccupies = actorOccupiesPoint(state.player, runtimePoint)
      const enemy = state.enemies.find((candidate) => candidate.alive && actorOccupiesPoint(candidate, runtimePoint))
      const block = state.blocks.find((candidate) => actorOccupiesPoint(candidate, runtimePoint))
      if (playerOccupies && enemy) {
        grid.push(GRID_CELL_PLAYER_CAUGHT)
        continue
      }

      if (playerOccupies) {
        grid.push(GRID_CELL_PLAYER)
        continue
      }

      if (enemy) {
        grid.push(enemy.phase === 'spawning'
          ? GRID_CELL_ENEMY_SPAWNING
          : enemy.phase === 'digging'
            ? GRID_CELL_ENEMY_DIGGING
            : GRID_CELL_ENEMY_ACTIVE)
        continue
      }

      if (block) {
        grid.push(block.source === 'respawned' ? GRID_CELL_BLOCK_RESPAWNED : GRID_CELL_BLOCK_ORIGINAL)
        continue
      }

      if (hasInteriorWallAt(level, runtimePoint)) {
        grid.push(GRID_CELL_COLUMN)
        continue
      }

      grid.push(GRID_CELL_EMPTY)
    }
  }

  return grid
}

function hasInteriorWallAt(level: LevelData, point: { x: number; y: number }): boolean {
  return level.walls?.some((wall) => wall.x === point.x && wall.y === point.y) ?? false
}

function actorOccupiesPoint(
  actor: { gridPosition: { x: number; y: number }; motion?: { to: { x: number; y: number } } },
  point: { x: number; y: number }
): boolean {
  return samePoint(actor.gridPosition, point) || Boolean(actor.motion && samePoint(actor.motion.to, point))
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y
}

function toPlayableOrClamp(point: { x: number; y: number }): { x: number; y: number } {
  if (isInsideRuntimePlayableArea(point)) {
    return toPlayableAreaPoint(point)
  }

  return {
    x: Math.max(0, Math.min(PLAYABLE_AREA_WIDTH - 1, point.x - 1)),
    y: Math.max(0, Math.min(PLAYABLE_AREA_HEIGHT - 1, point.y - 1))
  }
}

function validateAction(action: number): void {
  if (!Number.isInteger(action) || action < 0 || action >= HEADLESS_ACTION_COUNT) {
    throw new Error(`Action must be an integer between 0 and ${HEADLESS_ACTION_COUNT - 1}.`)
  }
}
