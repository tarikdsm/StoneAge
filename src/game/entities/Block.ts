import Phaser from 'phaser'
import { GridActor } from './GridActor'
import type { BlockState } from '../core/StageState'
import type { GridPoint } from '../types/level'

export class Block extends GridActor {
  readonly id: string
  private readonly shadow: Phaser.GameObjects.Ellipse
  private readonly sprite: Phaser.GameObjects.Image
  private readonly shine: Phaser.GameObjects.Rectangle
  private readonly seam: Phaser.GameObjects.Rectangle
  private exploding = false
  private comboLevel = 0

  constructor(scene: Phaser.Scene, tileSize: number, boardOrigin: GridPoint, gridPosition: GridPoint, id: string) {
    super(scene, tileSize, boardOrigin, gridPosition)
    this.id = id

    this.shadow = scene.add.ellipse(0, tileSize * 0.24, tileSize * 0.52, tileSize * 0.16, 0x020617, 0.28)
    this.sprite = scene.add.image(0, 0, 'block')
    this.sprite.setDisplaySize(tileSize * 0.86, tileSize * 0.86)
    this.shine = scene.add.rectangle(-tileSize * 0.12, -tileSize * 0.12, tileSize * 0.24, tileSize * 0.12, 0xfde68a, 0.9)
    this.seam = scene.add.rectangle(0, 0, tileSize * 0.62, 4, 0x8b5e3c, 0.65)
    this.add([this.shadow, this.sprite, this.shine, this.seam])
    scene.add.existing(this)
  }

  syncFromState(state: BlockState): void {
    if (this.exploding) {
      return
    }

    this.syncToGrid(state.worldPosition)
    if (state.slideDirection && state.motion) {
      const laneProgress = state.motion.progress
      const tilt = Math.sin(laneProgress * Math.PI * 2) * 7
      this.sprite.setAngle(tilt)
      this.shine.setAlpha(1)
      this.seam.setAlpha(0.85)
      this.shadow.setScale(1.06, 1)
    } else {
      this.sprite.setAngle(0)
      this.shine.setAlpha(0.9)
      this.seam.setAlpha(0.65)
      this.shadow.setScale(1, 1)
      this.comboLevel = 0
    }
  }

  pulseLaunch(): void {
    if (this.exploding) {
      return
    }

    this.scene.tweens.add({
      targets: this,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 90,
      yoyo: true,
      ease: 'Sine.Out'
    })
  }

  playCombo(comboCount: number): void {
    if (this.exploding || comboCount <= this.comboLevel) {
      return
    }

    this.comboLevel = comboCount
    this.sprite.setTint(comboCount >= 2 ? 0xfacc15 : 0xffffff)
    this.shine.setFillStyle(comboCount >= 2 ? 0xfef08a : 0xfde68a, 1)
    this.scene.tweens.add({
      targets: [this.sprite, this.shine],
      alpha: 0.35,
      yoyo: true,
      duration: 140,
      repeat: comboCount >= 2 ? 1 : 0,
      onComplete: () => {
        this.sprite.clearTint()
        this.sprite.setAlpha(1)
        this.shine.setAlpha(0.9)
      }
    })
  }

  /** Plays a one-shot explosion so destroyed blocks disappear with readable feedback. */
  explode(): void {
    if (this.exploding) {
      return
    }

    this.exploding = true
    this.setDepth(8)
    this.sprite.setTint(0xfb7185)
    this.shine.setFillStyle(0xfef08a, 1)
    this.seam.setFillStyle(0xf97316, 0.9)

    const sparks = Array.from({ length: 6 }, (_, index) => {
      const spark = this.scene.add.rectangle(0, 0, this.tileSize * 0.12, this.tileSize * 0.12, index % 2 === 0 ? 0xfbbf24 : 0xfb7185, 1)
      spark.setAngle(index * 18)
      this.add(spark)
      return spark
    })

    this.scene.tweens.add({
      targets: this,
      scaleX: 1.18,
      scaleY: 1.18,
      angle: 18,
      duration: 90,
      yoyo: true,
      ease: 'Sine.Out'
    })

    sparks.forEach((spark, index) => {
      const angle = Phaser.Math.DegToRad(index * 60)
      this.scene.tweens.add({
        targets: spark,
        x: Math.cos(angle) * this.tileSize * 0.56,
        y: Math.sin(angle) * this.tileSize * 0.56,
        alpha: 0,
        scaleX: 0.25,
        scaleY: 0.25,
        angle: spark.angle + 70,
        duration: 260,
        ease: 'Cubic.Out'
      })
    })

    this.scene.tweens.add({
      targets: [this.sprite, this.shine, this.seam, this.shadow],
      alpha: 0,
      duration: 240,
      ease: 'Quad.In'
    })

    this.scene.tweens.add({
      targets: this,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: 280,
      ease: 'Quad.In',
      onComplete: () => this.destroy()
    })
  }
}
