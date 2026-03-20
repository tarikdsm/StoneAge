import Phaser from 'phaser'
import { GridActor } from './GridActor'
import type { GridPoint } from '../types/level'

export class Player extends GridActor {
  constructor(scene: Phaser.Scene, tileSize: number, boardOrigin: GridPoint, spawn: GridPoint) {
    super(scene, tileSize, boardOrigin, spawn)

    const shadow = scene.add.ellipse(0, tileSize * 0.22, tileSize * 0.45, tileSize * 0.18, 0x020617, 0.35)
    const body = scene.add.image(0, 0, 'player')
    body.setDisplaySize(tileSize * 0.72, tileSize * 0.72)

    const accent = scene.add.rectangle(0, tileSize * 0.12, tileSize * 0.22, tileSize * 0.14, 0xfef3c7)
    accent.setStrokeStyle(2, 0x0f172a)

    this.add([shadow, body, accent])
    scene.add.existing(this)
  }
}
