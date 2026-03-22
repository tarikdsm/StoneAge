import { stepStageState, type BlockState, type EnemyState, type MotionState, type SimulationInput, type StageState } from '../../core/StageState'
import type { Direction, GridPoint, LevelData } from '../../types/level'
import { addPoints, directionVectors, samePoint } from '../../utils/grid'
import type { PlayerSimulationPolicy } from './PlayerSimulationPolicy'

const POLICY_DIRECTIONS: Direction[] = ['up', 'left', 'right', 'down']
const DEFAULT_SEARCH_HORIZON_STEPS = 7
const DEFAULT_ROLLOUT_DELTA_MS = 140
const DEFAULT_TOP_CANDIDATE_SCORE_BAND = 180
const DEFAULT_RANDOM_NOISE = 32

interface CandidateInput {
  input: SimulationInput
  kind: 'wait' | 'move' | 'push' | 'throw'
  direction?: Direction
  signature: string
}

interface SearchStats {
  uniquePlayerTiles: Set<string>
  totalEnemyKills: number
  totalDestroyedBlocks: number
  totalLaunches: number
  totalPushes: number
}

interface RankedCandidate {
  candidate: CandidateInput
  score: number
}

interface AttackPotential {
  kind: 'push' | 'throw'
  direction: Direction
  killCount: number
  laneDistance: number
  score: number
}

interface BlockSetupTarget {
  direction: Direction
  distance: number
  score: number
}

export interface RuleBasedPlayerPolicyWeights {
  winReward: number
  lossPenalty: number
  killReward: number
  remainingEnemyPenalty: number
  mobilityReward: number
  safetyReward: number
  immediateAttackReward: number
  setupReward: number
  setupDistancePenalty: number
  destroyedBlockPenalty: number
  launchReward: number
  pushReward: number
  uniqueTileReward: number
  randomNoise: number
}

export interface RuleBasedPlayerPolicyOptions {
  id?: string
  label?: string
  random?: () => number
  searchHorizonSteps?: number
  rolloutDeltaMs?: number
  topCandidateScoreBand?: number
  weights?: Partial<RuleBasedPlayerPolicyWeights>
}

const DEFAULT_WEIGHTS: RuleBasedPlayerPolicyWeights = {
  winReward: 24000,
  lossPenalty: 26000,
  killReward: 1800,
  remainingEnemyPenalty: 720,
  mobilityReward: 180,
  safetyReward: 160,
  immediateAttackReward: 240,
  setupReward: 165,
  setupDistancePenalty: 30,
  destroyedBlockPenalty: 60,
  launchReward: 220,
  pushReward: 110,
  uniqueTileReward: 34,
  randomNoise: DEFAULT_RANDOM_NOISE
}

/**
 * Advanced autonomous player controller for simulator mode.
 *
 * The policy keeps the gameplay core authoritative by planning entirely through
 * cloned `StageState` snapshots and short lookahead rollouts. It prefers
 * immediate kills, values safe mobility, seeks better block setups, and mixes
 * in mild stochastic exploration between near-equal branches so retries do not
 * repeat the exact same mistake every run.
 */
export class RuleBasedPlayerPolicy implements PlayerSimulationPolicy {
  readonly id: string
  readonly label: string
  private readonly random: () => number
  private readonly searchHorizonSteps: number
  private readonly rolloutDeltaMs: number
  private readonly topCandidateScoreBand: number
  private readonly weights: RuleBasedPlayerPolicyWeights

  constructor(options: RuleBasedPlayerPolicyOptions = {}) {
    this.id = options.id ?? 'rule-based-player-v2'
    this.label = options.label ?? 'Heuristic Bot'
    this.random = options.random ?? Math.random
    this.searchHorizonSteps = options.searchHorizonSteps ?? DEFAULT_SEARCH_HORIZON_STEPS
    this.rolloutDeltaMs = options.rolloutDeltaMs ?? DEFAULT_ROLLOUT_DELTA_MS
    this.topCandidateScoreBand = options.topCandidateScoreBand ?? DEFAULT_TOP_CANDIDATE_SCORE_BAND
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...options.weights
    }
  }

  decide(level: LevelData, state: StageState): SimulationInput {
    if (state.status !== 'playing') {
      return {}
    }

    const candidates = buildCandidateInputs(level, state)
    if (candidates.length === 0) {
      return {}
    }

    const ranked = candidates
      .map((candidate) => ({
        candidate,
        score: this.evaluateCandidate(level, state, candidate)
      }))
      .sort((a, b) => b.score - a.score)

    return chooseCandidateFromBand(ranked, this.topCandidateScoreBand, this.random)?.candidate.input ?? {}
  }

  private evaluateCandidate(level: LevelData, state: StageState, candidate: CandidateInput): number {
    const simulated = cloneStageState(state)
    const stats = createSearchStats(simulated)
    let score = 0

    score += this.applyStep(level, simulated, candidate.input, stats)
    if (simulated.status === 'won') {
      return score + this.weights.winReward
    }

    if (simulated.status === 'lost') {
      return score - this.weights.lossPenalty
    }

    for (let step = 1; step < this.searchHorizonSteps && simulated.status === 'playing'; step += 1) {
      const rolloutInput = this.chooseRolloutInput(level, simulated)
      score += this.applyStep(level, simulated, rolloutInput, stats) * Math.pow(0.92, step)
    }

    score += evaluateTerminalBoard(level, simulated, stats, this.weights)
    score += (this.random() - 0.5) * this.weights.randomNoise
    return score
  }

  private applyStep(level: LevelData, state: StageState, input: SimulationInput, stats: SearchStats): number {
    const previousEnemyCount = countLivingEnemies(state)
    const outcome = stepStageState(level, state, input, this.rolloutDeltaMs)
    const livingEnemies = countLivingEnemies(state)
    const kills = previousEnemyCount - livingEnemies

    stats.totalEnemyKills += kills
    stats.totalDestroyedBlocks += outcome.destroyedBlockIds.length
    if (input.throwDirection && outcome.pushedBlockId) {
      stats.totalLaunches += 1
    }
    if (!input.throwDirection && outcome.pushedBlockId) {
      stats.totalPushes += 1
    }
    stats.uniquePlayerTiles.add(pointKey(getPlanningPlayerPoint(state)))

    let score = 0
    score += kills * this.weights.killReward
    score -= outcome.destroyedBlockIds.length * this.weights.destroyedBlockPenalty
    score += outcome.crushedEnemyIds.length * this.weights.immediateAttackReward
    score += input.throwDirection && outcome.pushedBlockId ? this.weights.launchReward : 0
    score += !input.throwDirection && outcome.pushedBlockId ? this.weights.pushReward : 0

    if (state.status === 'won') {
      score += this.weights.winReward
    } else if (state.status === 'lost') {
      score -= this.weights.lossPenalty
    }

    return score
  }

  private chooseRolloutInput(level: LevelData, state: StageState): SimulationInput {
    const immediateAttack = chooseBestImmediateAttack(level, state, this.weights)
    if (immediateAttack) {
      return immediateAttack.kind === 'throw'
        ? { moveDirection: immediateAttack.direction, throwDirection: immediateAttack.direction }
        : { moveDirection: immediateAttack.direction }
    }

    const safestMove = chooseSafestMove(level, state, this.weights, this.random)
    const bestSetup = chooseBestBlockSetup(level, state, this.weights)

    if (safestMove && bestSetup) {
      return safestMove.score >= bestSetup.score
        ? { moveDirection: safestMove.direction }
        : { moveDirection: bestSetup.direction }
    }

    if (bestSetup) {
      return { moveDirection: bestSetup.direction }
    }

    if (safestMove) {
      return { moveDirection: safestMove.direction }
    }

    const chaseMove = chooseMoveTowardEnemy(level, state, this.weights, this.random)
    return chaseMove ? { moveDirection: chaseMove } : {}
  }
}

function buildCandidateInputs(level: LevelData, state: StageState): CandidateInput[] {
  const candidates = new Map<string, CandidateInput>()
  let directionalCandidateCount = 0

  for (const direction of POLICY_DIRECTIONS) {
    if (canAttemptDirection(level, state, direction)) {
      const adjacentBlock = getAdjacentIdleBlock(state, direction)
      addCandidate(candidates, {
        input: { moveDirection: direction },
        kind: adjacentBlock ? 'push' : 'move',
        direction,
        signature: `move:${direction}`
      })
      directionalCandidateCount += 1
    }

    if (canThrowFromDirection(level, state, direction)) {
      addCandidate(candidates, {
        input: { moveDirection: direction, throwDirection: direction },
        kind: 'throw',
        direction,
        signature: `throw:${direction}`
      })
      directionalCandidateCount += 1
    }
  }

  if (directionalCandidateCount === 0 || state.player.motion || state.player.pushCooldownMs > 0) {
    addCandidate(candidates, { input: {}, kind: 'wait', signature: 'wait' })
  }

  return [...candidates.values()]
}

function addCandidate(store: Map<string, CandidateInput>, candidate: CandidateInput): void {
  if (!store.has(candidate.signature)) {
    store.set(candidate.signature, candidate)
  }
}

function chooseCandidateFromBand(ranked: RankedCandidate[], band: number, random: () => number): RankedCandidate | undefined {
  if (ranked.length === 0) {
    return undefined
  }

  const bestScore = ranked[0]?.score ?? 0
  const pool = ranked.filter((candidate) => candidate.score >= bestScore - band)
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[index] ?? ranked[0]
}

function chooseBestImmediateAttack(
  level: LevelData,
  state: StageState,
  weights: RuleBasedPlayerPolicyWeights
): AttackPotential | undefined {
  if (state.player.motion || state.player.pushCooldownMs > 0) {
    return undefined
  }

  const attacks: AttackPotential[] = []
  for (const direction of POLICY_DIRECTIONS) {
    const block = getAdjacentIdleBlock(state, direction)
    if (!block) {
      continue
    }

    if (canPushCrushEnemy(level, state, block, direction)) {
      attacks.push({
        kind: 'push',
        direction,
        killCount: 1,
        laneDistance: 1,
        score: weights.killReward + weights.pushReward
      })
    }

    const launch = evaluateThrowKills(level, state, block.gridPosition, direction)
    if (launch && launch.killCount > 0) {
      attacks.push({
        kind: 'throw',
        direction,
        killCount: launch.killCount,
        laneDistance: launch.laneDistance,
        score: launch.killCount * (weights.killReward + weights.launchReward) - launch.laneDistance * 36
      })
    }
  }

  return attacks.sort((a, b) => b.score - a.score || a.laneDistance - b.laneDistance)[0]
}

function chooseBestBlockSetup(
  level: LevelData,
  state: StageState,
  weights: RuleBasedPlayerPolicyWeights
): BlockSetupTarget | undefined {
  const playerAnchor = getPlanningPlayerPoint(state)
  const setups: BlockSetupTarget[] = []

  for (const block of state.blocks) {
    if (block.motion) {
      continue
    }

    for (const direction of POLICY_DIRECTIONS) {
      const playerStand = addPoints(block.gridPosition, inverseDirectionVector(direction))
      if (!canPlayerStageAt(level, state, playerAnchor, playerStand)) {
        continue
      }

      const pathDistance = getPlayerPathDistance(level, state, playerAnchor, playerStand)
      if (pathDistance === undefined) {
        continue
      }

      const throwPotential = evaluateThrowKills(level, state, block.gridPosition, direction)
      const pushPotential = canPushCrushEnemy(level, state, block, direction) ? 1 : 0
      const openLane = canBlockInitiateAction(level, state, block, direction) ? 1 : 0
      if (!throwPotential && pushPotential === 0 && openLane === 0) {
        continue
      }

      const threatDistance = getNearestEnemyPathDistance(level, state, playerStand)
      const setupPower = (throwPotential?.killCount ?? 0) * 2.4 + pushPotential * 1.3 + openLane * 0.8
      setups.push({
        direction: pathDistance === 0 ? direction : getFirstStepToward(level, state, playerAnchor, playerStand) ?? direction,
        distance: pathDistance,
        score: setupPower * weights.setupReward
          + threatDistance * weights.safetyReward * 0.25
          - pathDistance * weights.setupDistancePenalty
      })
    }
  }

  return setups.sort((a, b) => b.score - a.score || a.distance - b.distance)[0]
}

function chooseSafestMove(
  level: LevelData,
  state: StageState,
  weights: RuleBasedPlayerPolicyWeights,
  random: () => number
): { direction: Direction; score: number } | undefined {
  const playerAnchor = getPlanningPlayerPoint(state)
  const moves: Array<{ direction: Direction; score: number }> = []

  for (const direction of POLICY_DIRECTIONS) {
    const destination = addPoints(playerAnchor, directionVectors[direction])
    if (!canPlayerWalkTo(level, state, playerAnchor, destination)) {
      continue
    }

    const nearestEnemyPath = getNearestEnemyPathDistance(level, state, destination)
    const mobility = countLegalPlayerMoves(level, state, destination)
    const adjacentAttack = countAdjacentAttackOptions(level, state, destination)
    const score = nearestEnemyPath * weights.safetyReward
      + mobility * weights.mobilityReward
      + adjacentAttack * weights.immediateAttackReward
      + (random() - 0.5) * weights.randomNoise * 0.4

    moves.push({ direction, score })
  }

  return moves.sort((a, b) => b.score - a.score)[0]
}

function chooseMoveTowardEnemy(
  level: LevelData,
  state: StageState,
  weights: RuleBasedPlayerPolicyWeights,
  random: () => number
): Direction | undefined {
  const playerAnchor = getPlanningPlayerPoint(state)
  const livingEnemies = getThreateningEnemies(state)
  const options: Array<{ direction: Direction; score: number }> = []

  for (const direction of POLICY_DIRECTIONS) {
    const destination = addPoints(playerAnchor, directionVectors[direction])
    if (!canPlayerWalkTo(level, state, playerAnchor, destination)) {
      continue
    }

    const nearestEnemy = Math.min(...livingEnemies.map((enemy) => manhattan(destination, enemy.gridPosition)))
    const adjacentAttack = countAdjacentAttackOptions(level, state, destination)
    const mobility = countLegalPlayerMoves(level, state, destination)
    options.push({
      direction,
      score: -nearestEnemy * 40 + adjacentAttack * weights.immediateAttackReward + mobility * weights.mobilityReward * 0.5 + (random() - 0.5) * 12
    })
  }

  return options.sort((a, b) => b.score - a.score)[0]?.direction
}

function evaluateTerminalBoard(
  level: LevelData,
  state: StageState,
  stats: SearchStats,
  weights: RuleBasedPlayerPolicyWeights
): number {
  if (state.status === 'won') {
    return weights.winReward
  }

  if (state.status === 'lost') {
    return -weights.lossPenalty
  }

  const playerAnchor = getPlanningPlayerPoint(state)
  const livingEnemies = countLivingEnemies(state)
  const nearestEnemyPath = getNearestEnemyPathDistance(level, state, playerAnchor)
  const mobility = countLegalPlayerMoves(level, state, playerAnchor)
  const adjacentAttack = chooseBestImmediateAttack(level, state, weights)
  const setup = chooseBestBlockSetup(level, state, weights)

  return -livingEnemies * weights.remainingEnemyPenalty
    + nearestEnemyPath * weights.safetyReward
    + mobility * weights.mobilityReward
    + (adjacentAttack?.score ?? 0) * 0.45
    + (setup?.score ?? 0) * 0.55
    + state.blocks.length * 24
    + stats.uniquePlayerTiles.size * weights.uniqueTileReward
    - stats.totalDestroyedBlocks * weights.destroyedBlockPenalty
}

function createSearchStats(state: StageState): SearchStats {
  return {
    uniquePlayerTiles: new Set([pointKey(getPlanningPlayerPoint(state))]),
    totalEnemyKills: 0,
    totalDestroyedBlocks: 0,
    totalLaunches: 0,
    totalPushes: 0
  }
}

function cloneStageState(state: StageState): StageState {
  if (typeof structuredClone === 'function') {
    return structuredClone(state)
  }

  return JSON.parse(JSON.stringify(state)) as StageState
}

function canAttemptDirection(level: LevelData, state: StageState, direction: Direction): boolean {
  const playerAnchor = getPlanningPlayerPoint(state)
  const destination = addPoints(playerAnchor, directionVectors[direction])
  return canPlayerWalkTo(level, state, playerAnchor, destination)
    || Boolean(getAdjacentIdleBlock(state, direction))
}

function canThrowFromDirection(level: LevelData, state: StageState, direction: Direction): boolean {
  if (state.player.motion || state.player.pushCooldownMs > 0) {
    return false
  }

  const block = getAdjacentIdleBlock(state, direction)
  if (!block) {
    return false
  }

  const next = addPoints(block.gridPosition, directionVectors[direction])
  return canBlockMoveInto(level, state, block.id, next)
}

function countLivingEnemies(state: StageState): number {
  return state.enemies.filter((enemy) => enemy.alive).length
}

function getPlanningPlayerPoint(state: StageState): GridPoint {
  return state.player.motion?.to ?? state.player.gridPosition
}

function getThreateningEnemies(state: StageState): EnemyState[] {
  return state.enemies.filter((enemy) => enemy.alive && enemy.phase !== 'spawning')
}

function getNearestEnemyPathDistance(level: LevelData, state: StageState, point: GridPoint): number {
  const enemies = getThreateningEnemies(state)
  if (enemies.length === 0) {
    return 12
  }

  return Math.min(...enemies.map((enemy) => getEnemyPathDistance(level, state, enemy.gridPosition, point) ?? manhattan(enemy.gridPosition, point) + 4))
}

function getEnemyPathDistance(level: LevelData, state: StageState, start: GridPoint, target: GridPoint): number | undefined {
  if (samePoint(start, target)) {
    return 0
  }

  const queue: Array<{ point: GridPoint; distance: number }> = [{ point: start, distance: 0 }]
  const visited = new Set<string>([pointKey(start)])

  while (queue.length > 0) {
    const current = queue.shift() as { point: GridPoint; distance: number }
    for (const direction of POLICY_DIRECTIONS) {
      const next = addPoints(current.point, directionVectors[direction])
      const key = pointKey(next)
      if (visited.has(key) || !canEnemyPathOccupy(level, state, next)) {
        continue
      }

      if (samePoint(next, target)) {
        return current.distance + 1
      }

      visited.add(key)
      queue.push({
        point: next,
        distance: current.distance + 1
      })
    }
  }

  return undefined
}

function canEnemyPathOccupy(level: LevelData, state: StageState, point: GridPoint): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !isBlockOccupyingCell(state.blocks, point)
}

function evaluateThrowKills(
  level: LevelData,
  state: StageState,
  blockPosition: GridPoint,
  direction: Direction
): { killCount: number; laneDistance: number } | undefined {
  const start = addPoints(blockPosition, directionVectors[direction])
  if (isSolidForBlock(level, state, undefined, start)) {
    return undefined
  }

  let cursor = { ...start }
  let steps = 1
  let killCount = 0
  let firstHitDistance = Number.POSITIVE_INFINITY

  while (!isSolidForBlock(level, state, undefined, cursor)) {
    if (isEnemyOccupyingCell(state, cursor)) {
      killCount += 1
      firstHitDistance = Math.min(firstHitDistance, steps)
    }

    cursor = addPoints(cursor, directionVectors[direction])
    steps += 1
  }

  if (killCount === 0) {
    return undefined
  }

  return {
    killCount,
    laneDistance: firstHitDistance
  }
}

function countAdjacentAttackOptions(level: LevelData, state: StageState, playerAnchor: GridPoint): number {
  let count = 0
  for (const direction of POLICY_DIRECTIONS) {
    const blockOrigin = addPoints(playerAnchor, directionVectors[direction])
    const block = state.blocks.find((candidate) => samePoint(candidate.gridPosition, blockOrigin) && !candidate.motion)
    if (!block) {
      continue
    }

    if (canPushCrushEnemy(level, state, block, direction)) {
      count += 1
    }

    if (evaluateThrowKills(level, state, block.gridPosition, direction)) {
      count += 1
    }
  }

  return count
}

function countLegalPlayerMoves(level: LevelData, state: StageState, playerAnchor: GridPoint): number {
  let count = 0
  for (const direction of POLICY_DIRECTIONS) {
    const destination = addPoints(playerAnchor, directionVectors[direction])
    if (canPlayerWalkTo(level, state, playerAnchor, destination)) {
      count += 1
    }
  }

  return count
}

function canPushCrushEnemy(level: LevelData, state: StageState, block: BlockState, direction: Direction): boolean {
  const destination = addPoints(block.gridPosition, directionVectors[direction])
  return canBlockMoveInto(level, state, block.id, destination)
    && isEnemyOccupyingCell(state, destination)
}

function canBlockInitiateAction(level: LevelData, state: StageState, block: BlockState, direction: Direction): boolean {
  const next = addPoints(block.gridPosition, directionVectors[direction])
  return canBlockMoveInto(level, state, block.id, next)
}

function canPlayerStageAt(level: LevelData, state: StageState, playerAnchor: GridPoint, point: GridPoint): boolean {
  return samePoint(point, playerAnchor) || canPlayerWalkTo(level, state, playerAnchor, point)
}

function canPlayerWalkTo(level: LevelData, state: StageState, playerAnchor: GridPoint, point: GridPoint): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !samePoint(point, playerAnchor)
    && !isBlockOccupyingCell(state.blocks, point)
    && !isEnemyOccupyingCell(state, point)
}

function canBlockMoveInto(level: LevelData, state: StageState, blockId: string, point: GridPoint): boolean {
  return isInside(level, point)
    && !isWall(level, point)
    && !state.blocks.some((block) => block.id !== blockId && occupiesPoint(block.gridPosition, block.motion, point))
}

function isSolidForBlock(level: LevelData, state: StageState, movingBlockId: string | undefined, point: GridPoint): boolean {
  return !isInside(level, point)
    || isWall(level, point)
    || state.blocks.some((block) => block.id !== movingBlockId && occupiesPoint(block.gridPosition, block.motion, point))
}

function isBlockOccupyingCell(blocks: BlockState[], point: GridPoint): boolean {
  return blocks.some((block) => occupiesPoint(block.gridPosition, block.motion, point))
}

function isEnemyOccupyingCell(state: StageState, point: GridPoint): boolean {
  return state.enemies.some((enemy) => enemy.alive && occupiesPoint(enemy.gridPosition, enemy.motion, point))
}

function occupiesPoint(gridPosition: GridPoint, motion: MotionState | undefined, point: GridPoint): boolean {
  return samePoint(gridPosition, point) || (motion ? samePoint(motion.to, point) : false)
}

function isInside(level: LevelData, point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < level.width && point.y < level.height
}

function isWall(level: LevelData, point: GridPoint): boolean {
  return level.walls?.some((wall) => samePoint(wall, point)) ?? false
}

function getAdjacentIdleBlock(state: StageState, direction: Direction): BlockState | undefined {
  const blockOrigin = addPoints(state.player.gridPosition, directionVectors[direction])
  return state.blocks.find((candidate) => samePoint(candidate.gridPosition, blockOrigin) && !candidate.motion)
}

function inverseDirectionVector(direction: Direction): GridPoint {
  const vector = directionVectors[direction]
  return { x: -vector.x, y: -vector.y }
}

function getFirstStepToward(level: LevelData, state: StageState, start: GridPoint, target: GridPoint): Direction | undefined {
  return getFirstStepTowardWithDistance(level, state, start, target)?.direction
}

function getFirstStepTowardWithDistance(
  level: LevelData,
  state: StageState,
  start: GridPoint,
  target: GridPoint
): { direction: Direction; distance: number } | undefined {
  if (samePoint(start, target)) {
    return undefined
  }

  const queue: Array<{ point: GridPoint; distance: number; firstDirection?: Direction }> = [{ point: start, distance: 0 }]
  const visited = new Set<string>([pointKey(start)])

  while (queue.length > 0) {
    const current = queue.shift() as { point: GridPoint; distance: number; firstDirection?: Direction }

    for (const direction of POLICY_DIRECTIONS) {
      const next = addPoints(current.point, directionVectors[direction])
      const key = pointKey(next)
      if (visited.has(key)) {
        continue
      }

      const isTarget = samePoint(next, target)
      if (!isTarget && !canPlayerWalkTo(level, state, start, next)) {
        continue
      }

      const firstDirection = current.firstDirection ?? direction
      if (isTarget) {
        return {
          direction: firstDirection,
          distance: current.distance + 1
        }
      }

      visited.add(key)
      queue.push({
        point: next,
        distance: current.distance + 1,
        firstDirection
      })
    }
  }

  return undefined
}

function getPlayerPathDistance(level: LevelData, state: StageState, start: GridPoint, target: GridPoint): number | undefined {
  if (samePoint(start, target)) {
    return 0
  }

  return getFirstStepTowardWithDistance(level, state, start, target)?.distance
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

function manhattan(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
