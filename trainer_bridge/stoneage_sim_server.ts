import { createInterface } from 'node:readline'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  StoneAgeHeadlessSimulator,
  type HeadlessStepResult
} from '../src/game/simulation/headless/StoneAgeHeadlessSimulator.js'
import type { LevelData } from '../src/game/types/level.js'
import type { FilledMapSlotFile } from '../src/game/types/mapFile.js'

type BridgeRequest =
  | { type: 'ping' }
  | { type: 'init' | 'create_env'; mapId?: string; seed?: number; maxDecisionSteps?: number }
  | { type: 'reset'; mapId?: string; seed?: number }
  | { type: 'step'; action: number; decisionRepeat?: number }
  | { type: 'close' }

interface BridgeResponse {
  ok: boolean
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
        message: 'pong'
      }

    case 'init':
    case 'create_env': {
      const mapId = request.mapId ?? activeMapId
      const level = await loadPublishedLevel(mapId)
      simulator?.close()
      simulator = new StoneAgeHeadlessSimulator({
        mapId,
        level,
        seed: request.seed,
        maxDecisionSteps: request.maxDecisionSteps
      })
      activeMapId = mapId
      return toBridgeResponse(simulator.reset(request.seed), `initialized ${mapId}`)
    }

    case 'reset': {
      const mapId = request.mapId ?? activeMapId
      if (!simulator || mapId !== activeMapId) {
        const level = await loadPublishedLevel(mapId)
        simulator?.close()
        simulator = new StoneAgeHeadlessSimulator({
          mapId,
          level,
          seed: request.seed
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

async function loadPublishedLevel(mapId: string): Promise<LevelData> {
  if (mapId !== 'map01') {
    throw new Error(`Headless bridge currently supports only map01. Received ${mapId}.`)
  }

  const filePath = path.join(projectRoot, 'public', 'maps', `${mapId}.json`)
  const fileText = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(fileText) as FilledMapSlotFile

  if (!parsed || parsed.empty !== false || !parsed.level) {
    throw new Error(`Published slot ${mapId} is empty or malformed.`)
  }

  const level = parsed.level
  if (
    typeof level.name !== 'string'
    || level.width !== 12
    || level.height !== 12
    || !level.playerSpawn
    || !Array.isArray(level.blocks)
    || !Array.isArray(level.enemies)
  ) {
    throw new Error(`Published level ${mapId} failed the minimal headless loader validation.`)
  }

  return level
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
