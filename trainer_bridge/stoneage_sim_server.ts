import { createInterface } from 'node:readline'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  StoneAgeHeadlessSimulator,
  type HeadlessStepResult
} from '../src/game/simulation/headless/StoneAgeHeadlessSimulator.js'
import {
  HEADLESS_SUPPORTED_MAP_IDS,
  loadPublishedLevelFromSlotText
} from '../src/game/data/publishedMapLoader.js'

type BridgeRequest =
  | { type: 'ping' }
  | { type: 'init' | 'create_env'; mapId?: string; seed?: number; maxDecisionSteps?: number }
  | { type: 'reset'; mapId?: string; seed?: number; maxDecisionSteps?: number }
  | { type: 'step'; action: number; decisionRepeat?: number }
  | { type: 'heuristic_action'; deterministic?: boolean }
  | { type: 'close' }

interface BridgeResponse {
  ok: boolean
  action?: number
  observation?: HeadlessStepResult['observation']
  raw_score?: number
  terminated?: boolean
  truncated?: boolean
  info?: HeadlessStepResult['info']
  message?: string
  error?: string
}

interface InternalBridgeResponse extends BridgeResponse {
  closeProcess?: boolean
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let activeMapId = 'map01'
let activeMaxDecisionSteps: number | undefined
let simulator: StoneAgeHeadlessSimulator | undefined

const readline = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
})

readline.on('line', async (line) => {
  readline.pause()
  const response = await handleLine(line)
  process.stdout.write(`${JSON.stringify(response)}\n`)
  if (response.closeProcess) {
    process.exit(0)
  }
  readline.resume()
})

readline.on('close', () => {
  simulator?.close()
  process.exit(0)
})

async function handleLine(line: string): Promise<InternalBridgeResponse> {
  if (!line.trim()) {
    return { ok: false, error: 'Received an empty JSON-line request.' }
  }

  try {
    const request = JSON.parse(line) as BridgeRequest
    return await handleRequest(request)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown bridge error.'
    }
  }
}

async function handleRequest(request: BridgeRequest): Promise<InternalBridgeResponse> {
  switch (request.type) {
    case 'ping':
      return {
        ok: true,
        message: `pong:${HEADLESS_SUPPORTED_MAP_IDS.join(',')}`
      }

    case 'init':
    case 'create_env': {
      const mapId = request.mapId ?? activeMapId
      activeMaxDecisionSteps = request.maxDecisionSteps ?? activeMaxDecisionSteps
      const level = await loadPublishedLevel(mapId)
      simulator?.close()
      simulator = new StoneAgeHeadlessSimulator({
        mapId,
        level,
        seed: request.seed,
        maxDecisionSteps: activeMaxDecisionSteps
      })
      activeMapId = mapId
      return toBridgeResponse(simulator.reset(request.seed), `initialized ${mapId}`)
    }

    case 'reset': {
      const mapId = request.mapId ?? activeMapId
      activeMaxDecisionSteps = request.maxDecisionSteps ?? activeMaxDecisionSteps
      if (!simulator || mapId !== activeMapId) {
        const level = await loadPublishedLevel(mapId)
        simulator?.close()
        simulator = new StoneAgeHeadlessSimulator({
          mapId,
          level,
          seed: request.seed,
          maxDecisionSteps: activeMaxDecisionSteps
        })
        activeMapId = mapId
      }

      return toBridgeResponse(simulator.reset(request.seed), `reset ${mapId}`)
    }

    case 'step': {
      if (!simulator) {
        throw new Error('Simulator is not initialized. Send init/create_env first.')
      }

      return toBridgeResponse(simulator.step(request.action, request.decisionRepeat))
    }

    case 'heuristic_action': {
      if (!simulator) {
        throw new Error('Simulator is not initialized. Send init/create_env first.')
      }

      return {
        ok: true,
        action: simulator.getHeuristicAction(request.deterministic ?? true)
      }
    }

    case 'close':
      simulator?.close()
      simulator = undefined
      return {
        ok: true,
        message: 'closed',
        closeProcess: true
      }

    default:
      throw new Error('Unsupported bridge message.')
  }
}

async function loadPublishedLevel(mapId: string) {
  const filePath = path.join(projectRoot, 'public', 'maps', `${mapId}.json`)
  const fileText = await readFile(filePath, 'utf8')
  return loadPublishedLevelFromSlotText(mapId, fileText)
}

function toBridgeResponse(result: HeadlessStepResult, message?: string): BridgeResponse {
  return {
    ok: true,
    observation: result.observation,
    raw_score: result.raw_score,
    terminated: result.terminated,
    truncated: result.truncated,
    info: result.info,
    message
  }
}
