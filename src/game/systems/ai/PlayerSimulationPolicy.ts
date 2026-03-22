import type { SimulationInput, StageState } from '../../core/StageState'
import type { LevelData } from '../../types/level'

export interface PlayerSimulationPolicy {
  readonly id: string
  readonly label: string
  decide(level: LevelData, state: StageState): SimulationInput
}
