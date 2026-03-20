import Phaser from 'phaser'
import { GridActor } from './GridActor'
import type { GridPoint } from '../types/level'

export class Enemy extends GridActor {
  alive = true

  constructor(scene: Phaser.Scene, tileSize: number, boardOrigin: GridPoint, spawn: GridPoint) {
    super(scene, tileSize, boardOrigin, spawn)

    const shadow = scene.add.ellipse(0, tileSize * 0.22, tileSize * 0.46, tileSize * 0.18, 0x020617, 0.35)
    const sprite = scene.add.image(0, 0, 'enemy')
    sprite.setDisplaySize(tileSize * 0.72, tileSize * 0.72)
    const eyeL = scene.add.circle(-tileSize * 0.1, -tileSize * 0.05, tileSize * 0.05, 0x0f172a)
    const eyeR = scene.add.circle(tileSize * 0.1, -tileSize * 0.05, tileSize * 0.05, 0x0f172a)
    this.add([shadow, sprite, eyeL, eyeR])
    scene.add.existing(this)
  }

  squash(): void {
    if (!this.alive) {
      return
    }

    this.alive = false
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.15,
      scaleY: 0.2,
      alpha: 0.1,
      duration: 140,
      ease: 'Quad.In',
      onComplete: () => this.destroy()
    })
  }
}
