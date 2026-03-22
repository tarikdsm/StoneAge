import type { SimulationInput, StageState } from '../../core/StageState'
import type { LevelData } from '../../types/level'
import type { PlayerSimulationPolicy } from './PlayerSimulationPolicy'

/**
 * Thin runtime wrapper around a pure player-control policy.
 *
 * The simulator mode uses this indirection so today's handcrafted rule policy
 * can later be swapped for a trained model without changing `GameScene`.
 */
export class SimulationController {
  constructor(private readonly policy: PlayerSimulationPolicy) {}

  get label(): string {
    return this.policy.label
  }

  get policyId(): string {
    return this.policy.id
  }

  snapshot(level: LevelData, state: StageState): SimulationInput {
    return this.policy.decide(level, state)
  }
}
