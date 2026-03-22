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

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x100000000
  }
}

describe('RuleBasedPlayerPolicy', () => {
  it('launches an adjacent block when it can crush an enemy in lane', () => {
    const level = createPolicyTestLevel()
    const state = createStageState(level)
    const policy = new RuleBasedPlayerPolicy({ random: () => 0 })

    const input = policy.decide(level, state)
    expect(input).toEqual({
      moveDirection: 'right',
      throwDirection: 'right'
    })
  })

  it('can choose a safer staging route when no immediate launch exists', () => {
    const level = createPolicyTestLevel({
      playerSpawn: { x: 2, y: 5 },
      blocks: [{ x: 6, y: 5 }],
      enemies: [{ type: 'basic', x: 8, y: 5 }]
    })
    const state = createStageState(level)
    const policy = new RuleBasedPlayerPolicy({ random: () => 0 })

    const input = policy.decide(level, state)
    expect(input).toEqual({
      moveDirection: 'up'
    })
  })

  it('prefers evasive movement when an active enemy gets too close and no block kill is available', () => {
    const level = createPolicyTestLevel({
      blocks: [],
      enemies: [{ type: 'basic', x: 4, y: 5 }]
    })
    const state = createStageState(level)
    const policy = new RuleBasedPlayerPolicy({ random: () => 0 })

    const input = policy.decide(level, state)
    expect(input).toEqual({
      moveDirection: 'up'
    })
  })

  it('uses controlled randomness to vary between near-equal tactical openings', () => {
    const level = createPolicyTestLevel({
      playerSpawn: { x: 6, y: 8 },
      blocks: [{ x: 4, y: 4 }, { x: 8, y: 4 }],
      enemies: [{ type: 'basic', x: 6, y: 2 }]
    })

    const openings = [1, 2, 3, 4].map((seed) => {
      const policy = new RuleBasedPlayerPolicy({
        random: createSeededRandom(seed),
        topCandidateScoreBand: 5000,
        weights: {
          randomNoise: 0
        }
      })
      return policy.decide(level, createStageState(level)).moveDirection
    })

    expect(new Set(openings).size).toBeGreaterThan(1)
  })
})
