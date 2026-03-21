import Phaser from 'phaser'
import { GridActor } from './GridActor'
import type { PlayerState } from '../core/StageState'
import type { GridPoint } from '../types/level'

export class Player extends GridActor {
  private readonly shadow: Phaser.GameObjects.Ellipse
  private readonly sprite: Phaser.GameObjects.Image
  private readonly accent: Phaser.GameObjects.Rectangle
  private consumed = false

  constructor(scene: Phaser.Scene, tileSize: number, boardOrigin: GridPoint, spawn: GridPoint) {
    super(scene, tileSize, boardOrigin, spawn)

    this.shadow = scene.add.ellipse(0, tileSize * 0.22, tileSize * 0.45, tileSize * 0.18, 0x020617, 0.35)
    this.sprite = scene.add.image(0, 0, 'player')
    this.sprite.setDisplaySize(tileSize * 0.72, tileSize * 0.72)

    this.accent = scene.add.rectangle(0, tileSize * 0.12, tileSize * 0.22, tileSize * 0.14, 0xfef3c7)
    this.accent.setStrokeStyle(2, 0x0f172a)

    this.add([this.shadow, this.sprite, this.accent])
    scene.add.existing(this)
  }

  syncFromState(state: PlayerState): void {
    if (this.consumed) {
      return
    }

    this.syncToGrid(state.worldPosition)
  }

  /** Plays the defeat animation where the player is visibly swallowed by a predator. */
  playConsumedBy(target: Phaser.GameObjects.Components.Transform): void {
    if (this.consumed) {
      return
    }

    this.consumed = true
    this.setDepth(10)
    this.sprite.setTint(0xff6b6b)
    this.accent.setFillStyle(0xf87171, 1)
    this.shadow.setFillStyle(0x7f1d1d, 0.42)

    this.scene.tweens.add({
      targets: this,
      angle: 10,
      scaleX: 1.08,
      scaleY: 0.94,
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this,
          x: target.x,
          y: target.y,
          scaleX: 0.12,
          scaleY: 0.12,
          angle: 96,
          alpha: 0.12,
          duration: 420,
          ease: 'Cubic.In',
          onStart: () => {
            this.scene.tweens.add({
              targets: this.shadow,
              alpha: 0.08,
              scaleX: 0.35,
              scaleY: 0.35,
              duration: 320,
              ease: 'Quad.In'
            })
          },
          onComplete: () => {
            this.setVisible(false)
          }
        })
      }
    })
  }
}
