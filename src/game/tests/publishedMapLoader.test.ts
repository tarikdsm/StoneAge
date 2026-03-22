import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  HEADLESS_SUPPORTED_MAP_IDS,
  loadPublishedLevelFromSlotText
} from '../data/publishedMapLoader'
import { RUNTIME_BOARD_HEIGHT, RUNTIME_BOARD_WIDTH } from '../utils/boardGeometry'

describe('publishedMapLoader', () => {
  it('loads the supported headless training maps from published slot files', async () => {
    for (const mapId of HEADLESS_SUPPORTED_MAP_IDS) {
      const fileUrl = new URL(`../../../public/maps/${mapId}.json`, import.meta.url)
      const level = loadPublishedLevelFromSlotText(mapId, await readFile(fileUrl, 'utf8'))

      expect(level.name.length).toBeGreaterThan(0)
      expect(level.width).toBe(RUNTIME_BOARD_WIDTH)
      expect(level.height).toBe(RUNTIME_BOARD_HEIGHT)
      expect(level.enemies.length).toBeGreaterThan(0)
    }
  })

  it('rejects unsupported map ids for the current bridge rollout', async () => {
    const fileUrl = new URL('../../../public/maps/map04.json', import.meta.url)
    const fileText = await readFile(fileUrl, 'utf8')

    expect(() => loadPublishedLevelFromSlotText('map04', fileText)).toThrow(
      'Headless bridge currently supports map01, map02, map03. Received map04.'
    )
  })
})
