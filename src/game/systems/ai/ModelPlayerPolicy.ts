import type { SimulationInput, StageState } from '../../core/StageState'
import type { LevelData } from '../../types/level'
import type { PlayerSimulationPolicy } from './PlayerSimulationPolicy'
import { RuleBasedPlayerPolicy, type RuleBasedPlayerPolicyOptions, type RuleBasedPlayerPolicyWeights } from './RuleBasedPlayerPolicy'

const MODEL_URL = `${import.meta.env.BASE_URL}models/player-policy.json`

interface PlayerPolicyModelFile {
  type: 'stoneage-player-policy-model'
  version: 1
  id?: string
  label?: string
  searchHorizonSteps?: number
  rolloutDeltaMs?: number
  topCandidateScoreBand?: number
  weights?: Partial<RuleBasedPlayerPolicyWeights>
}

/**
 * Loader for a future trained player model exported as browser-friendly JSON.
 *
 * For this phase we keep the runtime contract simple: a trained export may
 * override planning weights and search parameters without touching `GameScene`
 * or the pure core. When the JSON is absent, simulator mode can safely fall
 * back to the heuristic policy.
 */
export class ModelPlayerPolicy implements PlayerSimulationPolicy {
  private loadedPolicy?: RuleBasedPlayerPolicy
  private loadAttempt?: Promise<boolean>
  private lastError = 'No trained player model loaded.'

  constructor(private readonly random: () => number = Math.random) {}

  get id(): string {
    return this.loadedPolicy?.id ?? 'model-player-policy-v1'
  }

  get label(): string {
    return this.loadedPolicy?.label ?? 'IA Model'
  }

  get isReady(): boolean {
    return Boolean(this.loadedPolicy)
  }

  get unavailableReason(): string {
    return this.lastError
  }

  async ensureLoaded(): Promise<boolean> {
    if (this.loadedPolicy) {
      return true
    }

    if (!this.loadAttempt) {
      this.loadAttempt = this.loadModel()
    }

    return this.loadAttempt
  }

  decide(level: LevelData, state: StageState): SimulationInput {
    return this.loadedPolicy?.decide(level, state) ?? {}
  }

  private async loadModel(): Promise<boolean> {
    try {
      const response = await fetch(MODEL_URL, { cache: 'no-store' })
      if (!response.ok) {
        this.lastError = 'No trained player model found in public/models/player-policy.json.'
        return false
      }

      const raw = await response.json()
      const artifact = validateModelFile(raw)
      const policyOptions: RuleBasedPlayerPolicyOptions = {
        id: artifact.id ?? this.id,
        label: artifact.label ?? this.label,
        searchHorizonSteps: artifact.searchHorizonSteps,
        rolloutDeltaMs: artifact.rolloutDeltaMs,
        topCandidateScoreBand: artifact.topCandidateScoreBand,
        weights: artifact.weights,
        random: this.random
      }

      this.loadedPolicy = new RuleBasedPlayerPolicy(policyOptions)
      this.lastError = ''
      return true
    } catch (error) {
      this.lastError = error instanceof Error
        ? error.message
        : 'Unable to load the trained player model.'
      return false
    }
  }
}

function validateModelFile(value: unknown): PlayerPolicyModelFile {
  if (!isRecord(value)) {
    throw new Error('The trained player model file must be a JSON object.')
  }

  if (value.type !== 'stoneage-player-policy-model') {
    throw new Error('The trained player model file has an invalid type.')
  }

  if (value.version !== 1) {
    throw new Error('The trained player model file has an unsupported version.')
  }

  const artifact: PlayerPolicyModelFile = {
    type: 'stoneage-player-policy-model',
    version: 1
  }

  if (typeof value.id === 'string') {
    artifact.id = value.id
  }

  if (typeof value.label === 'string') {
    artifact.label = value.label
  }

  if (typeof value.searchHorizonSteps === 'number') {
    artifact.searchHorizonSteps = value.searchHorizonSteps
  }

  if (typeof value.rolloutDeltaMs === 'number') {
    artifact.rolloutDeltaMs = value.rolloutDeltaMs
  }

  if (typeof value.topCandidateScoreBand === 'number') {
    artifact.topCandidateScoreBand = value.topCandidateScoreBand
  }

  if (isRecord(value.weights)) {
    artifact.weights = value.weights as Partial<RuleBasedPlayerPolicyWeights>
  }

  return artifact
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
