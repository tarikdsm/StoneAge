import { describe, expect, it } from 'vitest'

import {
  StoneAgeHeadlessSimulator,
  mapActionToSimulationInput
} from '../simulation/headless/StoneAgeHeadlessSimulator'
import type { LevelData } from '../types/level'
import { createRuntimeBorderWalls, RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_WIDTH } from '../utils/boardGeometry'

function createHeadlessTestLevel(overrides: Partial<LevelData> = {}): LevelData {
  return {
    name: 'Headless Test Level',
    tileSize: 64,
    width: RUNTIME_BOARD_WIDTH,
    height: RUNTIME_BOARD_HEIGHT,
    par: 1,
    objective: 'Test',
    playerSpawn: { x: 5, y: 8 },
    blocks: [{ x: 5, y: 6 }],
    enemies: [{ type: 'basic', x: 5, y: 3 }],
    walls: createRuntimeBorderWalls(),
    ...overrides
  }
}

describe('StoneAgeHeadlessSimulator', () => {
  it('returns a stable numeric observation payload on reset', () => {
    const simulator = new StoneAgeHeadlessSimulator({
      mapId: 'map01',
      level: createHeadlessTestLevel(),
      seed: 123
    })

    const result = simulator.reset(123)

    expect(result.observation.grid).toHaveLength(100)
    expect(result.observation.player_position).toEqual([4, 7])
    expect(result.info.map_id).toBe('map01')
    expect(result.info.enemies_alive).toBe(1)
    expect(result.info.blocks_active).toBe(1)
    expect(result.info.raw_score).toBe(0)
    expect(result.terminated).toBe(false)
    expect(result.truncated).toBe(false)
  })

  it('stays deterministic for the same seed and action sequence', () => {
    const level = createHeadlessTestLevel()
    const simulatorA = new StoneAgeHeadlessSimulator({ mapId: 'map01', level, seed: 77 })
    const simulatorB = new StoneAgeHeadlessSimulator({ mapId: 'map01', level, seed: 77 })
    const actions = [4, 4, 0, 5, 0, 3]

    const signaturesA: string[] = []
    const signaturesB: string[] = []

    for (const action of actions) {
      const resultA = simulatorA.step(action, 4)
      const resultB = simulatorB.step(action, 4)
      signaturesA.push(resultA.info.state_signature)
      signaturesB.push(resultB.info.state_signature)
      expect(resultA.raw_score).toBe(resultB.raw_score)
      expect(resultA.terminated).toBe(resultB.terminated)
      expect(resultA.truncated).toBe(resultB.truncated)
    }

    expect(signaturesA).toEqual(signaturesB)
  })

  it('maps the standalone space action to a launch attempt in the current facing direction', () => {
    expect(mapActionToSimulationInput(9, 'left')).toEqual({
      throwDirection: 'left'
    })
  })
})
