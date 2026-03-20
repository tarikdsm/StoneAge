import { describe, expect, it } from 'vitest'
import { createStageState, resolveTurn } from '../core/StageState'
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

describe('StageState resolveTurn', () => {
  it('moves the player into open tiles but not into blocks', () => {
    const state = createStageState(testLevel)

    const moved = resolveTurn(testLevel, state, { type: 'move', direction: 'up' }).state
    expect(moved.player).toEqual({ x: 2, y: 2 })

    const blocked = resolveTurn(testLevel, state, { type: 'move', direction: 'right' }).state
    expect(blocked.player).toEqual({ x: 2, y: 3 })
  })

  it('pushes a block when space exists and does not move through walls', () => {
    const state = createStageState({
      ...testLevel,
      enemies: []
    })

    const outcome = resolveTurn({ ...testLevel, enemies: [] }, state, { type: 'push', direction: 'right' })
    expect(outcome.pushedBlockId).toBe('block-0')
    expect(outcome.state.blocks[0]?.position).toEqual({ x: 4, y: 3 })

    const wallLevel: LevelData = {
      ...testLevel,
      enemies: [],
      blocks: [{ x: 4, y: 3 }],
      walls: [...(testLevel.walls ?? []), { x: 5, y: 3 }]
    }
    const blockedOutcome = resolveTurn(wallLevel, createStageState(wallLevel), { type: 'push', direction: 'right' })
    expect(blockedOutcome.pushedBlockId).toBeUndefined()
    expect(blockedOutcome.state.blocks[0]?.position).toEqual({ x: 4, y: 3 })
  })

  it('crushes an enemy when a pushed block reaches its tile', () => {
    const crushLevel: LevelData = {
      ...testLevel,
      playerSpawn: { x: 2, y: 3 },
      blocks: [{ x: 3, y: 3 }],
      enemies: [{ type: 'basic', x: 4, y: 3 }]
    }

    const outcome = resolveTurn(crushLevel, createStageState(crushLevel), { type: 'push', direction: 'right' })
    expect(outcome.crushedEnemyIds).toEqual(['enemy-0'])
    expect(outcome.state.enemies[0]?.alive).toBe(false)
    expect(outcome.state.blocks[0]?.position).toEqual({ x: 4, y: 3 })
  })

  it('marks the game as lost when an enemy reaches the player', () => {
    const chaseLevel: LevelData = {
      ...testLevel,
      blocks: [],
      enemies: [{ type: 'basic', x: 2, y: 2 }]
    }

    const outcome = resolveTurn(chaseLevel, createStageState(chaseLevel), { type: 'push', direction: 'left' })
    expect(outcome.state.status).toBe('lost')
    expect(outcome.state.message).toContain('caught')
  })

  it('marks the game as won only after enemies are gone and the player reaches the goal', () => {
    const winLevel: LevelData = {
      ...testLevel,
      blocks: [],
      enemies: [],
      playerSpawn: { x: 4, y: 5 }
    }

    const outcome = resolveTurn(winLevel, createStageState(winLevel), { type: 'move', direction: 'right' })
    expect(outcome.state.player).toEqual({ x: 5, y: 5 })
    expect(outcome.state.status).toBe('won')
    expect(outcome.state.message).toContain('Stage clear')
  })
})
