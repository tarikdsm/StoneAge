export const KILL_SCORE_BASE = 100
export const KILL_TIME_BONUS_MAX = 80
export const KILL_TIME_BONUS_DECAY_PER_SECOND = 3
export const STAGE_CLEAR_SCORE_BASE = 500
export const STAGE_CLEAR_TIME_BONUS_MAX = 700
export const STAGE_CLEAR_TIME_BONUS_DECAY_PER_SECOND = 12
export const DEATH_SCORE_PENALTY = -1500

export interface RunProgressState {
  score: number
  mapsCleared: number
  deaths: number
  totalElapsedMs: number
  totalKills: number
  nextScoreEventId: number
}

export interface RunProgressUpdateContext {
  stageElapsedMs: number
  crushedEnemyCount: number
  stageStatus: 'playing' | 'won' | 'lost'
  statusChanged: boolean
}

export interface ScoreDeltaEvent {
  id: number
  amount: number
  label: string
}

export interface RunProgressUpdateResult {
  progress: RunProgressState
  scoreDeltas: ScoreDeltaEvent[]
}

/**
 * Campaign-wide progress model used by both human play and simulator runs.
 *
 * Ranking intent:
 * 1. clear more maps
 * 2. die fewer times
 * 3. spend less total time
 * 4. use score as a final tiebreaker / visible arcade metric
 */
export function createRunProgressState(seed: Partial<RunProgressState> = {}): RunProgressState {
  return {
    score: seed.score ?? 0,
    mapsCleared: seed.mapsCleared ?? 0,
    deaths: seed.deaths ?? 0,
    totalElapsedMs: seed.totalElapsedMs ?? 0,
    totalKills: seed.totalKills ?? 0,
    nextScoreEventId: seed.nextScoreEventId ?? 1
  }
}

export function cloneRunProgressState(progress: RunProgressState | undefined): RunProgressState {
  return createRunProgressState(progress)
}

export function applyRunProgressUpdate(
  progress: RunProgressState,
  context: RunProgressUpdateContext
): RunProgressUpdateResult {
  const next = cloneRunProgressState(progress)
  const scoreDeltas: ScoreDeltaEvent[] = []

  if (context.crushedEnemyCount > 0) {
    const killScore = getKillScore(context.stageElapsedMs) * context.crushedEnemyCount
    next.totalKills += context.crushedEnemyCount
    next.score += killScore
    scoreDeltas.push(createScoreDelta(
      next,
      killScore,
      context.crushedEnemyCount > 1 ? `NPC x${context.crushedEnemyCount}` : 'NPC'
    ))
  }

  if (context.statusChanged) {
    next.totalElapsedMs += Math.max(0, context.stageElapsedMs)

    if (context.stageStatus === 'won') {
      const clearScore = getStageClearScore(context.stageElapsedMs)
      next.mapsCleared += 1
      next.score += clearScore
      scoreDeltas.push(createScoreDelta(next, clearScore, 'Stage clear'))
    } else if (context.stageStatus === 'lost') {
      next.deaths += 1
      next.score += DEATH_SCORE_PENALTY
      scoreDeltas.push(createScoreDelta(next, DEATH_SCORE_PENALTY, 'Caught'))
    }
  }

  return {
    progress: next,
    scoreDeltas
  }
}

export function compareRunProgress(a: RunProgressState, b: RunProgressState): number {
  if (a.mapsCleared !== b.mapsCleared) {
    return b.mapsCleared - a.mapsCleared
  }

  if (a.deaths !== b.deaths) {
    return a.deaths - b.deaths
  }

  if (a.totalElapsedMs !== b.totalElapsedMs) {
    return a.totalElapsedMs - b.totalElapsedMs
  }

  return b.score - a.score
}

export function formatRunStats(progress: RunProgressState, currentStageElapsedMs: number): string {
  return `Cleared ${padCount(progress.mapsCleared)} | Deaths ${progress.deaths} | Run ${formatDuration(progress.totalElapsedMs + Math.max(0, currentStageElapsedMs))} | Stage ${formatDuration(currentStageElapsedMs)}`
}

export function formatScoreValue(score: number): string {
  return new Intl.NumberFormat('en-US').format(score)
}

export function getKillScore(stageElapsedMs: number): number {
  return KILL_SCORE_BASE + Math.max(10, KILL_TIME_BONUS_MAX - elapsedSeconds(stageElapsedMs) * KILL_TIME_BONUS_DECAY_PER_SECOND)
}

export function getStageClearScore(stageElapsedMs: number): number {
  return STAGE_CLEAR_SCORE_BASE + Math.max(0, STAGE_CLEAR_TIME_BONUS_MAX - elapsedSeconds(stageElapsedMs) * STAGE_CLEAR_TIME_BONUS_DECAY_PER_SECOND)
}

function createScoreDelta(progress: RunProgressState, amount: number, label: string): ScoreDeltaEvent {
  const event: ScoreDeltaEvent = {
    id: progress.nextScoreEventId,
    amount,
    label
  }
  progress.nextScoreEventId += 1
  return event
}

function elapsedSeconds(elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / 1000)
}

function padCount(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0')
}

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
