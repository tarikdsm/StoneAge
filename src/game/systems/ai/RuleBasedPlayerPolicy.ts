import type { BlockState, EnemyState, MotionState, SimulationInput, StageState } from '../../core/StageState'
import type { Direction, GridPoint, LevelData } from '../../types/level'
import { addPoints, directionVectors, samePoint } from '../../utils/grid'
import type { PlayerSimulationPolicy } from './PlayerSimulationPolicy'

const POLICY_DIRECTIONS: Direction[] = ['up', 'left', 'right', 'down']
const PANIC_DISTANCE = 2

interface BlockOpportunity {
  playerStand: GridPoint
  actionDirection: Direction
  actionType: 'push' | 'throw'
  kills: number
  pathDistance: number
  score: number
}

/**
 * First-pass autonomous player for simulator mode.
 *
 * This intentionally stays pure and explainable:
 * - opportunistically launches or pushes for kills
 * - otherwise moves toward useful block setups
 * - falls back to evasive movement when enemies get too close
 *
 * The policy boundary is also the swap point for future trained models.
 */
export class RuleBasedPlayerPolicy implements PlayerSimulationPolicy {
  readonly id = 'rule-based-player-v1'
  readonly label = 'Rule-Based Pursuit'

  decide(level: LevelData, state: StageState): SimulationInput {
    if (state.status !== 'playing') {
      return {}
    }

    const playerAnchor = getPlanningPlayerPoint(state)
    const activeEnemies = getThreateningEnemies(state)

    if (!state.player.motion && state.player.pushCooldownMs <= 0) {
      const adjacentAttack = chooseAdjacentAttack(level, state)
      if (adjacentAttack) {
        return adjacentAttack
      }
    }

    const bestOpportunity = chooseBestBlockOpportunity(level, state, playerAnchor)
    if (bestOpportunity) {
      if (samePoint(playerAnchor, bestOpportunity.playerStand)) {
        if (state.player.motion || state.player.pushCooldownMs > 0) {
          return {}
        }

        return bestOpportunity.actionType === 'throw'
          ? { moveDirection: bestOpportunity.actionDirection, throwDirection: bestOpportunity.actionDirection }
          : { moveDirection: bestOpportunity.actionDirection }
      }

      const approachDirection = getFirstStepToward(level, state, playerAnchor, bestOpportunity.playerStand)
      if (approachDirection) {
        return { moveDirection: approachDirection }
      }
    }

    if (getNearestEnemyDistance(playerAnchor, activeEnemies) <= PANIC_DISTANCE) {
      const evasiveDirection = chooseSafestMove(level, state, playerAnchor)
      if (evasiveDirection) {
        return { moveDirection: evasiveDirection }
      }
    }

    const blockDirection = chooseMoveTowardUsableBlock(level, state, playerAnchor)
    if (blockDirection) {
      return { moveDirection: blockDirection }
    }

    const chaseDirection = chooseMoveTowardEnemy(level, state, playerAnchor)
    if (chaseDirection) {
      return { moveDirection: chaseDirection }
    }

    return {}
  }
}

function chooseAdjacentAttack(level: LevelData, state: StageState): SimulationInput | undefined {
  let bestThrow: { direction: Direction; kills: number; distance: number } | undefined
  let bestPush: Direction | undefined

  for (const direction of POLICY_DIRECTIONS) {
    const block = getAdjacentIdleBlock(state, direction)
    if (!block) {
      continue
    }

    if (canPushCrushEnemy(level, state, block, direction)) {
      bestPush ??= direction
    }

    const throwEvaluation = evaluateThrowKills(level, state, block.gridPosition, direction)
    if (!throwEvaluation || throwEvaluation.kills <= 0) {
      continue
    }

    if (!bestThrow || throwEvaluation.kills > bestThrow.kills || (throwEvaluation.kills === bestThrow.kills && throwEvaluation.distance < bestThrow.distance)) {
      bestThrow = {
        direction,
        kills: throwEvaluation.kills,
        distance: throwEvaluation.distance
      }
    }
  }

  if (bestThrow) {
    return {
      moveDirection: bestThrow.direction,
      throwDirection: bestThrow.direction
    }
  }

  if (bestPush) {
    return {
      moveDirection: bestPush
    }
  }

  return undefined
}

function chooseBestBlockOpportunity(level: LevelData, state: StageState, playerAnchor: GridPoint): BlockOpportunity | undefined {
  const opportunities: BlockOpportunity[] = []

  for (const block of state.blocks) {
    if (block.motion) {
      continue
    }

    for (const direction of POLICY_DIRECTIONS) {
      const playerStand = addPoints(block.gridPosition, inverseDirectionVector(direction))
      if (!canPlayerStageAt(level, state, playerAnchor, playerStand)) {
        continue
      }

      const throwEvaluation = evaluateThrowKills(level, state, block.gridPosition, direction)
      const canPushKill = canPushCrushEnemy(level, state, block, direction)
      if (!throwEvaluation && !canPushKill) {
        continue
      }

      const pathDistance = getPlayerPathDistance(level, state, playerAnchor, playerStand)
      if (pathDistance === undefined) {
        continue
      }

      if (throwEvaluation && throwEvaluation.kills > 0) {
        opportunities.push({
          playerStand,
          actionDirection: direction,
          actionType: 'throw',
          kills: throwEvaluation.kills,
          pathDistance,
          score: throwEvaluation.kills * 220 - pathDistance * 18 - throwEvaluation.distance * 6
        })
      }

      if (canPushKill) {
        opportunities.push({
          playerStand,
          actionDirection: direction,
          actionType: 'push',
          kills: 1,
          pathDistance,
          score: 120 - pathDistance * 12
        })
      }
    }
  }

  return opportunities.sort((a, b) => b.score - a.score || a.pathDistance - b.pathDistance)[0]
}

function chooseMoveTowardUsableBlock(level: LevelData, state: StageState, playerAnchor: GridPoint): Direction | undefined {
  let bestTarget: { direction: Direction; score: number } | undefined

  for (const block of state.blocks) {
    if (block.motion) {
      continue
    }

    for (const direction of POLICY_DIRECTIONS) {
      const playerStand = addPoints(block.gridPosition, inverseDirectionVector(direction))
      if (!canPlayerStageAt(level, state, playerAnchor, playerStand)) {
        continue
      }

      if (!canBlockInitiateAction(level, state, block, direction)) {
        continue
      }

      const pathResult = getFirstStepTowardWithDistance(level, state, playerAnchor, playerStand)
      if (!pathResult) {
        continue
      }

      const nearestEnemyDistance = getNearestEnemyDistance(block.gridPosition, getThreateningEnemies(state))
      const score = pathResult.distance * 10 + nearestEnemyDistance * 4
      if (!bestTarget || score < bestTarget.score) {
        bestTarget = {
          direction: pathResult.direction,
          score
        }
      }
    }
  }

  return bestTarget?.direction
}

function chooseMoveTowardEnemy(level: LevelData, state: StageState, playerAnchor: GridPoint): Direction | undefined {
  const livingEnemies = getThreateningEnemies(state)
  let best: { direction: Direction; distance: number } | undefined

  for (const enemy of livingEnemies) {
    for (const direction of POLICY_DIRECTIONS) {
      const target = addPoints(enemy.gridPosition, directionVectors[direction])
      if (!canPlayerStageAt(level, state, playerAnchor, target)) {
        continue
      }

      const pathResult = getFirstStepTowardWithDistance(level, state, playerAnchor, target)
      if (!pathResult) {
        continue
      }

      if (!best || pathResult.distance < best.distance) {
        best = {
          direction: pathResult.direction,
          distance: pathResult.distance
        }
      }
    }
  }

  return best?.direction
}

function chooseSafestMove(level: LevelData, state: StageState, playerAnchor: GridPoint): Direction | undefined {
  const livingEnemies = getThreateningEnemies(state)
  let safest: { direction: Direction; score: number } | undefined

  for (const direction of POLICY_DIRECTIONS) {
    const destination = addPoints(playerAnchor, directionVectors[direction])
    if (!canPlayerWalkTo(level, state, playerAnchor, destination)) {
      continue
    }

    const score = getNearestEnemyDistance(destination, livingEnemies)
    if (!safest || score > safest.score) {
      safest = {
        direction,
        score
      }
    }
  }

  return safest?.direction
}

function getPlanningPlayerPoint(state: StageState): GridPoint {
  return state.player.motion?.to ?? state.player.gridPosition
}

function getThreateningEnemies(state: StageState): EnemyState[] {
  return state.enemies.filter((enemy) => enemy.alive && enemy.phase !== 'spawning')
}

function getNearestEnemyDistance(point: GridPoint, enemies: EnemyState[]): number {
  if (enemies.length === 0) {
    return 99
  }

  return Math.min(...enemies.map((enemy) => manhattan(point, enemy.gridPosition)))
}

function evaluateThrowKills(
  level: LevelData,
  state: StageState,
  blockPosition: GridPoint,
  direction: Direction
): { kills: number; distance: number } | undefined {
  const start = addPoints(blockPosition, directionVectors[direction])
  if (isSolidForBlock(level, state, blockPosition, start)) {
    return undefined
  }

  let cursor = { ...start }
  let steps = 1
  let kills = 0
  let firstEnemyDistance = Number.POSITIVE_INFINITY

  while (!isSolidForBlock(level, state, blockPosition, cursor)) {
    if (isEnemyOccupyingCell(state, cursor)) {
      kills += 1
      firstEnemyDistance = Math.min(firstEnemyDistance, steps)
    }

    cursor = addPoints(cursor, directionVectors[direction])
    steps += 1
  }

  if (kills === 0) {
    return undefined
  }

  return {
    kills,
    distance: firstEnemyDistance
  }
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

function isSolidForBlock(level: LevelData, state: StageState, blockId: string | GridPoint, point: GridPoint): boolean {
  const movingBlockId = typeof blockId === 'string' ? blockId : undefined
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
  const target = addPoints(state.player.gridPosition, directionVectors[direction])
  return state.blocks.find((block) => samePoint(block.gridPosition, target) && !block.motion)
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
