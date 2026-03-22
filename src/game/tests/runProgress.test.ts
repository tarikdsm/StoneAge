import { describe, expect, it } from 'vitest'
import {
  DEATH_SCORE_PENALTY,
  applyRunProgressUpdate,
  compareRunProgress,
  createRunProgressState,
  formatRunStats,
  getKillScore,
  getStageClearScore
} from '../core/RunProgress'

describe('RunProgress scoring', () => {
  it('awards kill score with a time-based bonus', () => {
    const progress = createRunProgressState()
    const result = applyRunProgressUpdate(progress, {
      stageElapsedMs: 4000,
      crushedEnemyCount: 2,
      stageStatus: 'playing',
      statusChanged: false
    })

    expect(result.progress.totalKills).toBe(2)
    expect(result.progress.score).toBe(getKillScore(4000) * 2)
    expect(result.scoreDeltas).toEqual([
      {
        id: 1,
        amount: getKillScore(4000) * 2,
        label: 'NPC x2'
      }
    ])
  })

  it('awards stage-clear score and accumulates elapsed time', () => {
    const progress = createRunProgressState({ score: 250 })
    const result = applyRunProgressUpdate(progress, {
      stageElapsedMs: 18500,
      crushedEnemyCount: 1,
      stageStatus: 'won',
      statusChanged: true
    })

    expect(result.progress.mapsCleared).toBe(1)
    expect(result.progress.totalElapsedMs).toBe(18500)
    expect(result.progress.score).toBe(250 + getKillScore(18500) + getStageClearScore(18500))
    expect(result.scoreDeltas).toHaveLength(2)
    expect(result.scoreDeltas[1]).toMatchObject({
      amount: getStageClearScore(18500),
      label: 'Stage clear'
    })
  })

  it('applies a large penalty and a death count increase on defeat', () => {
    const progress = createRunProgressState({ score: 900 })
    const result = applyRunProgressUpdate(progress, {
      stageElapsedMs: 9200,
      crushedEnemyCount: 0,
      stageStatus: 'lost',
      statusChanged: true
    })

    expect(result.progress.deaths).toBe(1)
    expect(result.progress.totalElapsedMs).toBe(9200)
    expect(result.progress.score).toBe(900 + DEATH_SCORE_PENALTY)
    expect(result.scoreDeltas).toEqual([
      {
        id: 1,
        amount: DEATH_SCORE_PENALTY,
        label: 'Caught'
      }
    ])
  })

  it('ranks runs by maps cleared, then deaths, then elapsed time, then score', () => {
    const saferRun = createRunProgressState({
      mapsCleared: 5,
      deaths: 1,
      totalElapsedMs: 45000,
      score: 3200
    })
    const fasterButRiskierRun = createRunProgressState({
      mapsCleared: 5,
      deaths: 2,
      totalElapsedMs: 39000,
      score: 5400
    })

    expect(compareRunProgress(saferRun, fasterButRiskierRun)).toBeLessThan(0)
    expect(compareRunProgress(fasterButRiskierRun, saferRun)).toBeGreaterThan(0)
  })

  it('formats run stats with cleared maps, deaths, total run time, and current stage time', () => {
    const progress = createRunProgressState({
      mapsCleared: 7,
      deaths: 3,
      totalElapsedMs: 125000
    })

    expect(formatRunStats(progress, 19000)).toBe('Cleared 07 | Deaths 3 | Run 02:24 | Stage 00:19')
  })
})
