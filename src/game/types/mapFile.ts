import type { LevelData } from './level'

/** Canonical JSON shape stored under `public/maps/mapNN.json`. */
export interface EmptyMapSlotFile {
  type: 'stoneage-map-slot'
  version: 2
  slot: number
  empty: true
}

/** Non-empty published slot that carries runtime level data. */
export interface FilledMapSlotFile {
  type: 'stoneage-map-slot'
  version: 2
  slot: number
  empty: false
  level: LevelData
}

/** Full discriminated union used by fetch, upload, download, and GitHub sync. */
export type MapSlotFile = EmptyMapSlotFile | FilledMapSlotFile
