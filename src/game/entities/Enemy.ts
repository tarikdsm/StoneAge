import Phaser from 'phaser'
import { GridActor } from './GridActor'
import type { EnemyState } from '../core/StageState'
import type { GridPoint } from '../types/level'

export class Enemy extends GridActor {
  alive = true
  private readonly shadow: Phaser.GameObjects.Ellipse
  private readonly sprite: Phaser.GameObjects.Image
  private readonly eyeL: Phaser.GameObjects.Arc
  private readonly eyeR: Phaser.GameObjects.Arc
  private devouring = false

  constructor(scene: Phaser.Scene, tileSize: number, boardOrigin: GridPoint, spawn: GridPoint) {
    super(scene, tileSize, boardOrigin, spawn)

    this.shadow = scene.add.ellipse(0, tileSize * 0.22, tileSize * 0.46, tileSize * 0.18, 0x020617, 0.35)
    this.sprite = scene.add.image(0, 0, 'enemy')
    this.sprite.setDisplaySize(tileSize * 0.72, tileSize * 0.72)
    this.eyeL = scene.add.circle(-tileSize * 0.1, -tileSize * 0.05, tileSize * 0.05, 0x0f172a)
    this.eyeR = scene.add.circle(tileSize * 0.1, -tileSize * 0.05, tileSize * 0.05, 0x0f172a)
    this.add([this.shadow, this.sprite, this.eyeL, this.eyeR])
    scene.add.existing(this)
  }

  syncFromState(state: EnemyState): void {
    this.syncToGrid(state.worldPosition)

    if (state.phase === 'spawning') {
      const pulse = 0.75 + Math.abs(Math.sin(state.phaseTimerMs / 85)) * 0.25
      this.alpha = 0.55 + pulse * 0.35
      this.scaleX = 0.86 + pulse * 0.12
      this.scaleY = 0.86 + pulse * 0.12
      this.sprite.setTint(0xf8fafc)
      this.shadow.setAlpha(0.18)
      this.angle = 0
      return
    }

    this.alpha = 1
    this.shadow.setAlpha(0.35)

    if (state.phase === 'digging') {
      const wobble = Math.sin(state.phaseTimerMs / 42) * 6
      this.angle = wobble
      this.scaleX = 0.95
      this.scaleY = 1.05
      this.sprite.setTint(state.enraged ? 0xfb7185 : 0xfda4af)
      return
    }

    if (state.pushedByBlockId) {
      const shoveAngle = state.motion?.direction === 'left' ? -10 : state.motion?.direction === 'right' ? 10 : 0
      this.angle = shoveAngle
      this.scaleX = 1.08
      this.scaleY = 0.9
      this.sprite.setTint(0xfbbf24)
      return
    }

    this.angle = 0
    this.scaleX = state.enraged ? 1.08 : 1
    this.scaleY = state.enraged ? 1.08 : 1
    this.sprite.setTint(state.enraged ? 0xfb7185 : 0xffffff)
  }

  playBlockPushReaction(): void {
    if (!this.alive) {
      return
    }

    this.scene.tweens.add({
      targets: [this.eyeL, this.eyeR],
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 80,
      yoyo: true,
      ease: 'Quad.Out'
    })
  }

  playHatchBurst(): void {
    if (!this.alive) {
      return
    }

    this.setDepth(8)
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 120,
      yoyo: true,
      ease: 'Back.Out',
      onComplete: () => this.setDepth(0)
    })
  }

  squash(): void {
    if (!this.alive) {
      return
    }

    this.alive = false
    this.sprite.setTint(0xfde68a)
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.3,
      scaleY: 0.16,
      alpha: 0.08,
      duration: 170,
      ease: 'Quad.In',
      onComplete: () => this.destroy()
    })
  }

  /** Briefly exaggerates the enemy pose so the caught-player animation reads as a chomp. */
  playDevourReaction(): void {
    if (!this.alive || this.devouring) {
      return
    }

    this.devouring = true
    this.setDepth(9)
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.18,
      scaleY: 0.82,
      angle: -8,
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.devouring = false
        this.setDepth(0)
      }
    })
  }
}
