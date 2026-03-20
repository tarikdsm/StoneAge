import Phaser from 'phaser'
import { GridActor } from './GridActor'
import type { BlockState } from '../core/StageState'
import type { GridPoint } from '../types/level'

export class Block extends GridActor {
  readonly id: string

  constructor(scene: Phaser.Scene, tileSize: number, boardOrigin: GridPoint, gridPosition: GridPoint, id: string) {
    super(scene, tileSize, boardOrigin, gridPosition)
    this.id = id

    const shadow = scene.add.ellipse(0, tileSize * 0.24, tileSize * 0.52, tileSize * 0.16, 0x020617, 0.28)
    const sprite = scene.add.image(0, 0, 'block')
    sprite.setDisplaySize(tileSize * 0.86, tileSize * 0.86)
    const shine = scene.add.rectangle(-tileSize * 0.12, -tileSize * 0.12, tileSize * 0.24, tileSize * 0.12, 0xfde68a, 0.9)
    const seam = scene.add.rectangle(0, 0, tileSize * 0.62, 4, 0x8b5e3c, 0.65)
    this.add([shadow, sprite, shine, seam])
    scene.add.existing(this)
  }

  syncFromState(state: BlockState): void {
    this.syncToGrid(state.worldPosition)
  }
}
