import Phaser from 'phaser'
import { clamp } from '../utils/layout'

/**
 * Responsive title/menu scene.
 *
 * The menu mirrors the same viewport-resize behavior as the gameplay scenes so
 * the project remains comfortable to launch on desktop, tablet, and phone
 * browsers.
 */
export class MenuScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Rectangle
  private frame?: Phaser.GameObjects.Rectangle
  private panel?: Phaser.GameObjects.Rectangle
  private titleText?: Phaser.GameObjects.Text
  private subtitleText?: Phaser.GameObjects.Text
  private controlsTitle?: Phaser.GameObjects.Text
  private controlsText?: Phaser.GameObjects.Text
  private ctaText?: Phaser.GameObjects.Text

  constructor() {
    super('MenuScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#09111f')

    this.background = this.add.rectangle(0, 0, 10, 10, 0x0b1324).setOrigin(0)
    this.frame = this.add.rectangle(0, 0, 10, 10, 0x12203a, 0.9).setStrokeStyle(4, 0x38bdf8, 0.35)
    this.panel = this.add.rectangle(0, 0, 10, 10, 0x0f172a, 0.92).setStrokeStyle(2, 0x94a3b8, 0.4)

    this.titleText = this.add.text(0, 0, 'STONE AGE: ICE SHIFT', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.subtitleText = this.add.text(0, 0, 'A production-minded Phaser prototype inspired by Stone Age / Pengo.', {
      fontFamily: 'Arial',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5)

    this.controlsTitle = this.add.text(0, 0, 'Controls', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.controlsText = this.add.text(0, 0,
      [
        'Desktop: Arrow keys / WASD move, Space pushes, left click moves, right click pushes.',
        'Touch: swipe to move, tap an adjacent block to shove it into a raider.',
        'Goal: crush every raider, then reach the glowing exit tile.'
      ].join('\n\n'),
      {
        fontFamily: 'Arial',
        color: '#dbeafe',
        align: 'center'
      }).setOrigin(0.5)

    this.ctaText = this.add.text(0, 0, 'Click, tap, Enter, or Space to begin', {
      fontFamily: 'Arial',
      color: '#facc15',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.layoutScene(this.scale.width, this.scale.height)

    this.tweens.add({
      targets: this.ctaText,
      alpha: 0.35,
      yoyo: true,
      repeat: -1,
      duration: 700
    })

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    })

    this.input.once('pointerdown', () => this.startGame())
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame())
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame())
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.layoutScene(gameSize.width, gameSize.height)
  }

  private layoutScene(width: number, height: number): void {
    const frameWidth = width * 0.88
    const frameHeight = height * 0.78
    const panelWidth = Math.min(width * 0.82, 760)
    const panelHeight = clamp(height * 0.42, 250, 320)
    const titleSize = clamp(width * 0.036, 28, 46)
    const subtitleSize = clamp(width * 0.018, 16, 22)
    const controlsTitleSize = clamp(width * 0.022, 22, 28)
    const controlsSize = clamp(width * 0.016, 14, 20)
    const ctaSize = clamp(width * 0.019, 16, 24)

    this.background?.setSize(width, height)

    this.frame
      ?.setPosition(width / 2, height / 2)
      .setSize(frameWidth, frameHeight)

    this.panel
      ?.setPosition(width / 2, height / 2 + height * 0.04)
      .setSize(panelWidth, panelHeight)

    this.titleText
      ?.setPosition(width / 2, height * 0.16)
      .setFontSize(titleSize)

    this.subtitleText
      ?.setPosition(width / 2, height * 0.24)
      .setFontSize(subtitleSize)
      .setWordWrapWidth(Math.min(width * 0.82, 820))

    this.controlsTitle
      ?.setPosition(width / 2, height / 2 - panelHeight * 0.33)
      .setFontSize(controlsTitleSize)

    this.controlsText
      ?.setPosition(width / 2, height / 2 + height * 0.03)
      .setFontSize(controlsSize)
      .setWordWrapWidth(panelWidth - 48)

    this.ctaText
      ?.setPosition(width / 2, height - Math.max(60, height * 0.1))
      .setFontSize(ctaSize)
  }

  private startGame(): void {
    this.scene.start('GameScene')
    this.scene.launch('UIScene')
  }
}
