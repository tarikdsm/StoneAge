import { describe, expect, it } from 'vitest'
import { createStageState, stepStageState } from '../core/StageState'
import type { LevelData } from '../types/level'
import { RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_WIDTH, createRuntimeBorderWalls } from '../utils/boardGeometry'

function createCanonicalTestLevel(overrides: Partial<LevelData> = {}): LevelData {
  return {
    name: 'Test Chamber',
    tileSize: 64,
    width: RUNTIME_BOARD_WIDTH,
    height: RUNTIME_BOARD_HEIGHT,
    par: 1,
    objective: 'Test',
    playerSpawn: { x: 3, y: 5 },
    blocks: [{ x: 4, y: 5 }],
    enemies: [{ type: 'basic', x: 8, y: 5 }],
    goals: [{ x: 8, y: 9 }],
    walls: createRuntimeBorderWalls(),
    ...overrides
  }
}

function advance(
  level: LevelData,
  state = createStageState(level),
  steps = 1,
  input: {
    moveDirection?: 'up' | 'down' | 'left' | 'right'
    moveAttemptDirection?: 'up' | 'down' | 'left' | 'right'
    pushDirection?: 'up' | 'down' | 'left' | 'right'
    throwDirection?: 'up' | 'down' | 'left' | 'right'
  } = {}
): typeof state {
  for (let index = 0; index < steps; index += 1) {
    stepStageState(level, state, input, 200)
  }
  return state
}

describe('StageState real-time simulation', () => {
  it('keeps the player inside the fixed runtime border walls', () => {
    const level = createCanonicalTestLevel({
      playerSpawn: { x: 1, y: 1 },
      blocks: [],
      enemies: []
    })
    const state = createStageState(level)

    const outcome = stepStageState(level, state, { moveDirection: 'left' }, 16)
    expect(outcome.playerMoved).toBe(false)
    expect(state.player.gridPosition).toEqual({ x: 1, y: 1 })
  })

  it('moves the player continuously while movement input is held', () => {
    const level = createCanonicalTestLevel({
      enemies: []
    })
    const state = createStageState(level)

    stepStageState(level, state, { moveDirection: 'up' }, 100)
    expect(state.player.motion?.to).toEqual({ x: 3, y: 4 })
    expect(state.player.worldPosition.y).toBeLessThan(5)

    stepStageState(level, state, { moveDirection: 'up' }, 200)
    expect(state.player.gridPosition).toEqual({ x: 3, y: 4 })

    stepStageState(level, state, { moveDirection: 'up' }, 200)
    expect(state.player.gridPosition).toEqual({ x: 3, y: 3 })
  })

  it('keeps enemies moving even while the player is idle', () => {
    const idleLevel = createCanonicalTestLevel({
      blocks: []
    })
    const state = createStageState(idleLevel)

    stepStageState(idleLevel, state, {}, 100)
    expect(state.enemies[0]?.motion?.to).toEqual({ x: 7, y: 5 })

    stepStageState(idleLevel, state, {}, 400)
    expect(state.enemies[0]?.gridPosition).toEqual({ x: 7, y: 5 })
  })

  it('routes enemies around blockers instead of bouncing left-right in place', () => {
    const mazeLevel = createCanonicalTestLevel({
      name: 'Loop Breaker',
      playerSpawn: { x: 5, y: 8 },
      blocks: [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }],
      enemies: [{ type: 'basic', x: 5, y: 2 }],
      goals: [{ x: 9, y: 9 }],
      walls: [...createRuntimeBorderWalls(), { x: 5, y: 4 }]
    })
    const state = createStageState(mazeLevel)

    advance(mazeLevel, state, 4)
    expect(state.enemies[0]?.gridPosition).toEqual({ x: 5, y: 3 })

    advance(mazeLevel, state, 2)
    expect(state.enemies[0]?.gridPosition).toEqual({ x: 4, y: 3 })
  })

  it('pushes blocks in real time and crushes enemies in the destination tile', () => {
    const crushLevel = createCanonicalTestLevel({
      enemies: [{ type: 'basic', x: 5, y: 5 }]
    })
    const state = createStageState(crushLevel)

    const outcome = stepStageState(crushLevel, state, { moveDirection: 'right' }, 16)
    expect(outcome.pushedBlockId).toBe('block-0')
    expect(outcome.crushedEnemyIds).toEqual(['enemy-0'])
    expect(state.enemies[0]?.alive).toBe(false)
    expect(state.blocks[0]?.motion?.to).toEqual({ x: 5, y: 5 })
    expect(state.player.gridPosition).toEqual({ x: 3, y: 5 })

    stepStageState(crushLevel, state, {}, 200)
    expect(state.blocks[0]?.gridPosition).toEqual({ x: 5, y: 5 })
  })

  it('launches a block horizontally across the canonical board until it hits a pursuing enemy', () => {
    const launchLevel = createCanonicalTestLevel({
      enemies: [{ type: 'basic', x: 8, y: 5 }]
    })
    const state = createStageState(launchLevel)

    const launchOutcome = stepStageState(launchLevel, state, { moveDirection: 'right', throwDirection: 'right' }, 16)
    expect(launchOutcome.pushedBlockId).toBe('block-0')
    expect(state.player.gridPosition).toEqual({ x: 3, y: 5 })
    expect(launchOutcome.playerMoved).toBe(false)
    expect(state.blocks[0]?.motion?.to).toEqual({ x: 5, y: 5 })

    advance(launchLevel, state, 12)
    expect(state.enemies[0]?.alive).toBe(false)
    expect(state.blocks[0]?.gridPosition).toEqual({ x: 7, y: 5 })
    expect(state.blocks[0]?.motion).toBeUndefined()
  })

  it('launches a block vertically until the next hard blocker on the 12x12 runtime board', () => {
    const verticalLaunchLevel = createCanonicalTestLevel({
      playerSpawn: { x: 5, y: 9 },
      blocks: [{ x: 5, y: 8 }],
      enemies: [],
      walls: [...createRuntimeBorderWalls(), { x: 5, y: 3 }]
    })
    const state = createStageState(verticalLaunchLevel)

    stepStageState(verticalLaunchLevel, state, { moveDirection: 'up', throwDirection: 'up' }, 16)
    expect(state.blocks[0]?.motion?.to).toEqual({ x: 5, y: 7 })

    advance(verticalLaunchLevel, state, 10)
    expect(state.blocks[0]?.gridPosition).toEqual({ x: 5, y: 4 })
    expect(state.blocks[0]?.motion).toBeUndefined()
  })

  it('destroys an immovable block on the second movement attempt against it', () => {
    const jammedLevel = createCanonicalTestLevel({
      enemies: [],
      walls: [...createRuntimeBorderWalls(), { x: 5, y: 5 }]
    })
    const state = createStageState(jammedLevel)

    const firstOutcome = stepStageState(jammedLevel, state, { moveDirection: 'right', moveAttemptDirection: 'right' }, 16)
    expect(firstOutcome.destroyedBlockId).toBeUndefined()
    expect(state.blocks).toHaveLength(1)

    const secondOutcome = stepStageState(jammedLevel, state, { moveDirection: 'right', moveAttemptDirection: 'right' }, 16)
    expect(secondOutcome.destroyedBlockId).toBe('block-0')
    expect(state.blocks).toHaveLength(0)
    expect(state.player.gridPosition).toEqual({ x: 3, y: 5 })
  })

  it('marks the game as lost when a moving enemy reaches the player without player movement', () => {
    const chaseLevel = createCanonicalTestLevel({
      blocks: [],
      enemies: [{ type: 'basic', x: 3, y: 3 }]
    })
    const state = createStageState(chaseLevel)

    advance(chaseLevel, state, 4)
    expect(state.status).toBe('lost')
    expect(state.message).toContain('caught')
  })

  it('marks the game as won after all enemies are gone and the player reaches the goal', () => {
    const winLevel = createCanonicalTestLevel({
      blocks: [],
      enemies: [],
      playerSpawn: { x: 7, y: 9 }
    })
    const state = createStageState(winLevel)

    advance(winLevel, state, 1, { moveDirection: 'right' })
    expect(state.player.gridPosition).toEqual({ x: 8, y: 9 })
    expect(state.status).toBe('won')
    expect(state.message).toContain('Stage clear')
  })
})
