import { describe, expect, it } from 'vitest'
import { createStageState, stepStageState, type EnemyState, type StageState } from '../core/StageState'
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
    walls: createRuntimeBorderWalls(),
    ...overrides
  }
}

function activateEnemies(state: StageState): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) {
      continue
    }
    enemy.phase = 'active'
    enemy.phaseTimerMs = 0
  }
}

function advance(
  level: LevelData,
  state = createStageState(level),
  steps = 1,
  input: {
    moveDirection?: 'up' | 'down' | 'left' | 'right'
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
      enemies: [{ type: 'basic', x: 10, y: 10 }]
    })
    const state = createStageState(level)
    activateEnemies(state)

    const outcome = stepStageState(level, state, { moveDirection: 'left' }, 16)
    expect(outcome.playerMoved).toBe(false)
    expect(state.player.gridPosition).toEqual({ x: 1, y: 1 })
  })

  it('moves the player continuously while movement input is held', () => {
    const level = createCanonicalTestLevel({
      blocks: [],
      enemies: [{ type: 'basic', x: 10, y: 10 }]
    })
    const state = createStageState(level)
    activateEnemies(state)

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
    activateEnemies(state)

    stepStageState(idleLevel, state, {}, 100)
    expect(state.enemies[0]?.motion?.to).toEqual({ x: 7, y: 5 })

    stepStageState(idleLevel, state, {}, 400)
    expect(state.enemies[0]?.gridPosition).toEqual({ x: 7, y: 5 })
  })

  it('pushes blocks in real time and crushes enemies in the destination tile', () => {
    const crushLevel = createCanonicalTestLevel({
      enemies: [{ type: 'basic', x: 5, y: 5 }]
    })
    const state = createStageState(crushLevel)
    activateEnemies(state)

    const outcome = stepStageState(crushLevel, state, { moveDirection: 'right' }, 16)
    expect(outcome.pushedBlockId).toBe('block-0')
    expect(outcome.crushedEnemyIds).toEqual(['enemy-0'])
    expect(state.enemies[0]?.alive).toBe(false)
    expect(state.blocks[0]?.motion?.to).toEqual({ x: 5, y: 5 })
    expect(state.player.gridPosition).toEqual({ x: 3, y: 5 })
    expect(state.status).toBe('won')
  })

  it('launches a block that carries an enemy until crushing it against a wall', () => {
    const launchLevel = createCanonicalTestLevel({
      blocks: [{ x: 4, y: 5 }],
      enemies: [{ type: 'basic', x: 7, y: 5 }],
      walls: [...createRuntimeBorderWalls(), { x: 10, y: 5 }]
    })
    const state = createStageState(launchLevel)
    activateEnemies(state)

    const outcome = stepStageState(launchLevel, state, { moveDirection: 'right', throwDirection: 'right' }, 16)
    expect(outcome.pushedBlockId).toBe('block-0')
    expect(state.player.gridPosition).toEqual({ x: 3, y: 5 })
    expect(state.blocks[0]?.motion?.to).toEqual({ x: 5, y: 5 })

    advance(launchLevel, state, 12)
    expect(state.enemies[0]?.alive).toBe(false)
    expect(state.blocks[0]?.gridPosition).toEqual({ x: 8, y: 5 })
    expect(state.status).toBe('won')
  })

  it('allows a launched block to multi-kill enemies in sequence', () => {
    const launchLevel = createCanonicalTestLevel({
      blocks: [{ x: 4, y: 5 }],
      enemies: [
        { type: 'basic', x: 6, y: 5 },
        { type: 'basic', x: 8, y: 5 }
      ],
      walls: [...createRuntimeBorderWalls(), { x: 10, y: 5 }]
    })
    const state = createStageState(launchLevel)
    activateEnemies(state)

    stepStageState(launchLevel, state, { moveDirection: 'right', throwDirection: 'right' }, 16)
    advance(launchLevel, state, 16)

    expect(state.enemies.every((enemy) => !enemy.alive)).toBe(true)
    expect(state.blocks[0]?.gridPosition).toEqual({ x: 8, y: 5 })
    expect(state.status).toBe('won')
  })

  it('destroys an immovable block immediately when the player pushes into it', () => {
    const jammedLevel = createCanonicalTestLevel({
      enemies: [{ type: 'basic', x: 10, y: 10 }],
      walls: [...createRuntimeBorderWalls(), { x: 5, y: 5 }]
    })
    const state = createStageState(jammedLevel)
    activateEnemies(state)

    const outcome = stepStageState(jammedLevel, state, { moveDirection: 'right' }, 16)
    expect(outcome.destroyedBlockIds).toEqual(['block-0'])
    expect(state.blocks).toHaveLength(0)
    expect(state.player.gridPosition).toEqual({ x: 3, y: 5 })
  })

  it('hatches enemies over time before they join the chase', () => {
    const level = createCanonicalTestLevel({
      enemies: [
        { type: 'basic', x: 8, y: 5 },
        { type: 'basic', x: 9, y: 5 }
      ]
    })
    const state = createStageState(level)

    expect(state.enemies[0]?.phase).toBe('active')
    expect(state.enemies[1]?.phase).toBe('spawning')

    const hatchOutcome = stepStageState(level, state, {}, 600)
    expect(hatchOutcome.hatchedEnemyIds).toContain('enemy-1')
    expect(state.enemies[1]?.phase).toBe('active')
  })

  it('lets enemies dig through adjacent blocks when the path is sealed', () => {
    const digLevel = createCanonicalTestLevel({
      playerSpawn: { x: 8, y: 5 },
      blocks: [{ x: 4, y: 5 }],
      enemies: [{ type: 'basic', x: 3, y: 5 }],
      walls: [...createRuntimeBorderWalls(), { x: 3, y: 4 }, { x: 3, y: 6 }, { x: 2, y: 5 }]
    })
    const state = createStageState(digLevel)
    activateEnemies(state)

    stepStageState(digLevel, state, {}, 16)
    expect(state.enemies[0]?.phase).toBe('digging')

    advance(digLevel, state, 3)
    expect(state.blocks).toHaveLength(0)
  })

  it('accelerates the last surviving enemy', () => {
    const level = createCanonicalTestLevel({
      enemies: [{ type: 'basic', x: 8, y: 5 }]
    })
    const state = createStageState(level)
    activateEnemies(state)

    stepStageState(level, state, {}, 100)
    const enemy = state.enemies[0] as EnemyState
    expect(enemy.enraged).toBe(true)
    expect(enemy.worldPosition.x).toBeLessThan(8)
  })

  it('marks the game as lost when a moving enemy reaches the player without player movement', () => {
    const chaseLevel = createCanonicalTestLevel({
      blocks: [],
      enemies: [{ type: 'basic', x: 3, y: 3 }]
    })
    const state = createStageState(chaseLevel)
    activateEnemies(state)

    advance(chaseLevel, state, 4)
    expect(state.status).toBe('lost')
    expect(state.message).toContain('caught')
  })

  it('marks the game as won after all enemies are gone, without requiring an exit', () => {
    const winLevel = createCanonicalTestLevel({
      blocks: [{ x: 4, y: 5 }],
      enemies: [{ type: 'basic', x: 5, y: 5 }]
    })
    const state = createStageState(winLevel)
    activateEnemies(state)

    stepStageState(winLevel, state, { moveDirection: 'right' }, 16)
    stepStageState(winLevel, state, {}, 200)
    expect(state.status).toBe('won')
    expect(state.message).toContain('Stage clear')
  })
})
