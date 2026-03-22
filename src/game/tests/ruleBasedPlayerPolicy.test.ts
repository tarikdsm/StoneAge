import { describe, expect, it } from 'vitest'
import { createStageState } from '../core/StageState'
import { RuleBasedPlayerPolicy } from '../systems/ai/RuleBasedPlayerPolicy'
import type { LevelData } from '../types/level'
import { RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_WIDTH, createRuntimeBorderWalls } from '../utils/boardGeometry'

function createPolicyTestLevel(overrides: Partial<LevelData> = {}): LevelData {
  return {
    name: 'Policy Test',
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

describe('RuleBasedPlayerPolicy', () => {
  it('launches an adjacent block when it can crush an enemy in lane', () => {
    const level = createPolicyTestLevel()
    const state = createStageState(level)
    const policy = new RuleBasedPlayerPolicy()

    const input = policy.decide(level, state)
    expect(input).toEqual({
      moveDirection: 'right',
      throwDirection: 'right'
    })
  })

  it('moves toward a reachable block setup when no immediate launch exists', () => {
    const level = createPolicyTestLevel({
      playerSpawn: { x: 2, y: 5 },
      blocks: [{ x: 6, y: 5 }],
      enemies: [{ type: 'basic', x: 8, y: 5 }]
    })
    const state = createStageState(level)
    const policy = new RuleBasedPlayerPolicy()

    const input = policy.decide(level, state)
    expect(input).toEqual({
      moveDirection: 'right'
    })
  })

  it('prefers evasive movement when an active enemy gets too close and no block kill is available', () => {
    const level = createPolicyTestLevel({
      blocks: [],
      enemies: [{ type: 'basic', x: 4, y: 5 }]
    })
    const state = createStageState(level)
    const policy = new RuleBasedPlayerPolicy()

    const input = policy.decide(level, state)
    expect(input).toEqual({
      moveDirection: 'up'
    })
  })
})
