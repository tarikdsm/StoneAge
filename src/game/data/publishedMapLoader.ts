import type { LevelData } from '../types/level'
import { parseMapSlotFileText, sanitizeSlot } from './mapSlotCodec'

export const HEADLESS_SUPPORTED_MAP_IDS = ['map01', 'map02', 'map03'] as const

export type HeadlessSupportedMapId = typeof HEADLESS_SUPPORTED_MAP_IDS[number]

function parseMapIdSlot(mapId: string): number | undefined {
  const match = /^map(\d{2})$/i.exec(mapId.trim())
  if (!match) {
    return undefined
  }

  const slot = Number(match[1])
  return Number.isInteger(slot) ? sanitizeSlot(slot) : undefined
}

export function isSupportedHeadlessMapId(mapId: string): mapId is HeadlessSupportedMapId {
  return HEADLESS_SUPPORTED_MAP_IDS.includes(mapId as HeadlessSupportedMapId)
}

/**
 * Shared published-map loader used by the headless RL bridge.
 *
 * The browser-side repository still owns fetching/publishing concerns, but the
 * slot-file parsing and structural validation stay shared so Python training
 * consumes the same authoritative map JSON contract used by runtime gameplay.
 */
export function loadPublishedLevelFromSlotText(mapId: string, fileText: string): LevelData {
  if (!isSupportedHeadlessMapId(mapId)) {
    throw new Error(
      `Headless bridge currently supports ${HEADLESS_SUPPORTED_MAP_IDS.join(', ')}. Received ${mapId}.`
    )
  }

  const expectedSlot = parseMapIdSlot(mapId)
  if (expectedSlot === undefined) {
    throw new Error(`Invalid map id "${mapId}". Expected values like map01.`)
  }

  const parsed = parseMapSlotFileText(fileText)
  if (!parsed.value) {
    throw new Error(parsed.errors[0] ?? `Published slot ${mapId} failed validation.`)
  }

  if (parsed.value.slot !== expectedSlot) {
    throw new Error(`Published slot ${mapId} declared slot ${parsed.value.slot}, expected ${expectedSlot}.`)
  }

  if (parsed.value.empty) {
    throw new Error(`Published slot ${mapId} is empty and cannot be used by the headless bridge.`)
  }

  return parsed.value.level
}
