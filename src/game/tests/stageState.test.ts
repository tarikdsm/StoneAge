import { describe, expect, it } from 'vitest'
import { createStageState, stepStageState } from '../core/StageState'
import type { LevelData } from '../types/level'

const testLevel: LevelData = {
  name: 'Test Chamber',
  tileSize: 64,
  width: 7,
  height: 7,
  par: 1,
  objective: 'Test',
  playerSpawn: { x: 2, y: 3 },
  blocks: [{ x: 3, y: 3 }],
  enemies: [{ type: 'basic', x: 5, y: 3 }],
  goals: [{ x: 5, y: 5 }],
  walls: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 },
    { x: 0, y: 1 }, { x: 6, y: 1 },
    { x: 0, y: 2 }, { x: 6, y: 2 },
    { x: 0, y: 3 }, { x: 6, y: 3 },
    { x: 0, y: 4 }, { x: 6, y: 4 },
    { x: 0, y: 5 }, { x: 6, y: 5 },
    { x: 0, y: 6 }, { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }
  ]
}

function advance(
  level: LevelData,
  state = createStageState(level),
  steps = 1,
  input: {
    moveDirection?: 'up' | 'down' | 'left' | 'right'
    moveAttemptDirection?: 'up' | 'down' | 'left' | 'right'
    pushDirection?: 'up' | 'down' | 'left' | 'right'
  } = {}
): typeof state {
  for (let index = 0; index < steps; index += 1) {
    stepStageState(level, state, input, 200)
  }
  return state
}

describe('StageState real-time simulation', () => {
  it('moves the player continuously while movement input is held', () => {
    const state = createStageState({
      ...testLevel,
      enemies: []
    })

    stepStageState(testLevel, state, { moveDirection: 'up' }, 100)
    expect(state.player.motion?.to).toEqual({ x: 2, y: 2 })
    expect(state.player.worldPosition.y).toBeLessThan(3)

    stepStageState(testLevel, state, { moveDirection: 'up' }, 200)
    expect(state.player.gridPosition).toEqual({ x: 2, y: 2 })

    stepStageState(testLevel, state, { moveDirection: 'up' }, 200)
    expect(state.player.gridPosition).toEqual({ x: 2, y: 1 })
  })

  it('keeps enemies moving even while the player is idle', () => {
    const idleLevel: LevelData = {
      ...testLevel,
      blocks: []
    }
    const state = createStageState(idleLevel)

    stepStageState(idleLevel, state, {}, 100)
    expect(state.enemies[0]?.motion?.to).toEqual({ x: 4, y: 3 })

    stepStageState(idleLevel, state, {}, 400)
    expect(state.enemies[0]?.gridPosition).toEqual({ x: 4, y: 3 })
  })

  it('pushes blocks in real time and crushes enemies in the destination tile', () => {
    const crushLevel: LevelData = {
      ...testLevel,
      enemies: [{ type: 'basic', x: 4, y: 3 }]
    }
    const state = createStageState(crushLevel)

    const outcome = stepStageState(crushLevel, state, { pushDirection: 'right' }, 16)
    expect(outcome.pushedBlockId).toBe('block-0')
    expect(outcome.crushedEnemyIds).toEqual(['enemy-0'])
    expect(state.enemies[0]?.alive).toBe(false)
    expect(state.blocks[0]?.motion?.to).toEqual({ x: 4, y: 3 })

    stepStageState(crushLevel, state, {}, 200)
    expect(state.blocks[0]?.gridPosition).toEqual({ x: 4, y: 3 })
  })

  it('destroys an immovable block on the second movement attempt against it', () => {
    const jammedLevel: LevelData = {
      ...testLevel,
      enemies: [],
      walls: [...(testLevel.walls ?? []), { x: 4, y: 3 }]
    }
    const state = createStageState(jammedLevel)

    const firstOutcome = stepStageState(jammedLevel, state, { moveDirection: 'right', moveAttemptDirection: 'right' }, 16)
    expect(firstOutcome.destroyedBlockId).toBeUndefined()
    expect(state.blocks).toHaveLength(1)

    const secondOutcome = stepStageState(jammedLevel, state, { moveDirection: 'right', moveAttemptDirection: 'right' }, 16)
    expect(secondOutcome.destroyedBlockId).toBe('block-0')
    expect(state.blocks).toHaveLength(0)
    expect(state.player.gridPosition).toEqual({ x: 2, y: 3 })
  })

  it('marks the game as lost when a moving enemy reaches the player without a player turn', () => {
    const chaseLevel: LevelData = {
      ...testLevel,
      blocks: [],
      enemies: [{ type: 'basic', x: 2, y: 2 }]
    }
    const state = createStageState(chaseLevel)

    advance(chaseLevel, state, 3)
    expect(state.status).toBe('lost')
    expect(state.message).toContain('caught')
  })

  it('marks the game as won after all enemies are gone and the player reaches the goal', () => {
    const winLevel: LevelData = {
      ...testLevel,
      blocks: [],
      enemies: [],
      playerSpawn: { x: 4, y: 5 }
    }
    const state = createStageState(winLevel)

    advance(winLevel, state, 2, { moveDirection: 'right' })
    expect(state.player.gridPosition).toEqual({ x: 5, y: 5 })
    expect(state.status).toBe('won')
    expect(state.message).toContain('Stage clear')
  })
})
