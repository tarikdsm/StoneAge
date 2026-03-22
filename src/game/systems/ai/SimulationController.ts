import type { SimulationInput, StageState } from '../../core/StageState'
import type { LevelData } from '../../types/level'
import { ModelPlayerPolicy } from './ModelPlayerPolicy'
import type { PlayerSimulationPolicy } from './PlayerSimulationPolicy'

export type SimulatorPlayerPolicyMode = 'heuristic' | 'model'

export interface SimulationToggleResult {
  changed: boolean
  message: string
}

/**
 * Runtime controller that owns simulator player-policy selection.
 *
 * It keeps `GameScene` thin by:
 * - caching decisions while the discrete state signature stays the same
 * - switching between heuristic and model-backed policies
 * - exposing UI-friendly labels and failure messages
 */
export class SimulationController {
  private mode: SimulatorPlayerPolicyMode = 'heuristic'
  private readonly modelPolicy: ModelPlayerPolicy
  private cachedSignature?: string
  private cachedInput: SimulationInput = {}

  constructor(
    private readonly heuristicPolicy: PlayerSimulationPolicy,
    random: () => number = Math.random
  ) {
    this.modelPolicy = new ModelPlayerPolicy(random)
  }

  get label(): string {
    return this.getActivePolicy().label
  }

  get policyId(): string {
    return this.getActivePolicy().id
  }

  get currentMode(): SimulatorPlayerPolicyMode {
    return this.mode
  }

  get toggleLabel(): string {
    return this.mode === 'heuristic' ? 'Bot: Heuristico' : 'Bot: IA'
  }

  snapshot(level: LevelData, state: StageState): SimulationInput {
    const signature = buildDecisionSignature(this.mode, state)
    if (signature === this.cachedSignature) {
      return this.cachedInput
    }

    const input = this.getActivePolicy().decide(level, state)
    this.cachedSignature = signature
    this.cachedInput = input
    return input
  }

  async toggleMode(): Promise<SimulationToggleResult> {
    const nextMode: SimulatorPlayerPolicyMode = this.mode === 'heuristic' ? 'model' : 'heuristic'
    return this.setMode(nextMode)
  }

  async setMode(mode: SimulatorPlayerPolicyMode): Promise<SimulationToggleResult> {
    if (mode === this.mode) {
      return {
        changed: false,
        message: `Player bot already using ${this.mode === 'heuristic' ? 'the heuristic controller' : 'the trained model'}.`
      }
    }

    if (mode === 'model') {
      const loaded = await this.modelPolicy.ensureLoaded()
      if (!loaded) {
        this.clearCache()
        return {
          changed: false,
          message: this.modelPolicy.unavailableReason
        }
      }
    }

    this.mode = mode
    this.clearCache()
    return {
      changed: true,
      message: mode === 'heuristic'
        ? 'Simulator switched to the heuristic player bot.'
        : 'Simulator switched to the trained model policy.'
    }
  }

  private getActivePolicy(): PlayerSimulationPolicy {
    return this.mode === 'model' && this.modelPolicy.isReady
      ? this.modelPolicy
      : this.heuristicPolicy
  }

  private clearCache(): void {
    this.cachedSignature = undefined
    this.cachedInput = {}
  }
}

const PLAYER_COOLDOWN_BUCKET_MS = 60
const ENEMY_PHASE_TIMER_BUCKET_MS = 180

function buildDecisionSignature(mode: SimulatorPlayerPolicyMode, state: StageState): string {
  return JSON.stringify({
    mode,
    status: state.status,
    player: {
      x: state.player.gridPosition.x,
      y: state.player.gridPosition.y,
      cooldown: Math.floor(state.player.pushCooldownMs / PLAYER_COOLDOWN_BUCKET_MS),
      motionTo: state.player.motion?.to ?? null,
      motionDirection: state.player.motion?.direction ?? null
    },
    blocks: state.blocks.map((block) => ({
      id: block.id,
      x: block.gridPosition.x,
      y: block.gridPosition.y,
      motionTo: block.motion?.to ?? null,
      slide: block.slideDirection ?? null
    })),
    enemies: state.enemies.map((enemy) => ({
      id: enemy.id,
      alive: enemy.alive,
      phase: enemy.phase,
      phaseTimerBucket: enemy.phase === 'active'
        ? 0
        : Math.floor(enemy.phaseTimerMs / ENEMY_PHASE_TIMER_BUCKET_MS),
      x: enemy.gridPosition.x,
      y: enemy.gridPosition.y,
      motionTo: enemy.motion?.to ?? null
    }))
  })
}
