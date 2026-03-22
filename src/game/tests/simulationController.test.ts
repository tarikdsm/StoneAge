import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStageState, type SimulationInput } from '../core/StageState'
import { RuleBasedPlayerPolicy } from '../systems/ai/RuleBasedPlayerPolicy'
import { SimulationController } from '../systems/ai/SimulationController'
import type { PlayerSimulationPolicy } from '../systems/ai/PlayerSimulationPolicy'
import type { LevelData } from '../types/level'
import { RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_WIDTH, createRuntimeBorderWalls } from '../utils/boardGeometry'

function createSimulationTestLevel(overrides: Partial<LevelData> = {}): LevelData {
  return {
    name: 'Simulation Controller Test',
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

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('SimulationController', () => {
  it('reuses the cached decision when only elapsed time changes', () => {
    const policy: PlayerSimulationPolicy = {
      id: 'spy-policy',
      label: 'Spy Policy',
      decide: vi.fn<() => SimulationInput>(() => ({ moveDirection: 'right' }))
    }

    const controller = new SimulationController(policy, () => 0)
    const level = createSimulationTestLevel()
    const state = createStageState(level)
    const laterState = structuredClone(state)
    laterState.elapsedMs += 480

    const first = controller.snapshot(level, state)
    const second = controller.snapshot(level, laterState)

    expect(policy.decide).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('refreshes the cached decision when a timed enemy lifecycle bucket changes', () => {
    const policy: PlayerSimulationPolicy = {
      id: 'spy-policy',
      label: 'Spy Policy',
      decide: vi.fn<() => SimulationInput>(() => ({ moveDirection: 'right' }))
    }

    const controller = new SimulationController(policy, () => 0)
    const level = createSimulationTestLevel({
      enemies: [
        { type: 'basic', x: 8, y: 5 },
        { type: 'basic', x: 7, y: 4 }
      ]
    })
    const state = createStageState(level)
    const laterState = structuredClone(state)
    laterState.enemies[1]!.phaseTimerMs = 100

    controller.snapshot(level, state)
    controller.snapshot(level, laterState)

    expect(policy.decide).toHaveBeenCalledTimes(2)
  })

  it('stays on the heuristic policy when no trained model is present', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 404 })) as typeof fetch
    const controller = new SimulationController(new RuleBasedPlayerPolicy({ random: () => 0 }), () => 0)

    const result = await controller.toggleMode()
    expect(result.changed).toBe(false)
    expect(result.message).toContain('No trained player model')
    expect(controller.currentMode).toBe('heuristic')
    expect(controller.toggleLabel).toBe('Bot: Heuristico')
  })

  it('switches to model mode when a valid policy artifact is available', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      type: 'stoneage-player-policy-model',
      version: 1,
      label: 'Trained Policy',
      searchHorizonSteps: 2
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as typeof fetch

    const controller = new SimulationController(new RuleBasedPlayerPolicy({ random: () => 0 }), () => 0)
    const result = await controller.toggleMode()
    expect(result.changed).toBe(true)
    expect(controller.currentMode).toBe('model')
    expect(controller.label).toBe('Trained Policy')
    expect(controller.toggleLabel).toBe('Bot: IA')

    const level = createSimulationTestLevel()
    const state = createStageState(level)
    expect(controller.snapshot(level, state)).toEqual({
      moveDirection: 'right'
    })
  })
})
