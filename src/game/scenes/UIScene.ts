import Phaser from 'phaser'
import { clamp, getHudMetrics } from '../utils/layout'

interface UIState {
  levelName: string
  enemiesRemaining: number
  objective: string
  status: string
  help: string
}

/**
 * HUD overlay scene.
 *
 * It stays separate from `GameScene` so HUD layout can react to browser resize
 * without becoming entangled with board rendering or gameplay rules.
 */
export class UIScene extends Phaser.Scene {
  private topPanel?: Phaser.GameObjects.Rectangle
  private bottomPanel?: Phaser.GameObjects.Rectangle
  private titleText?: Phaser.GameObjects.Text
  private objectiveText?: Phaser.GameObjects.Text
  private enemiesText?: Phaser.GameObjects.Text
  private statusText?: Phaser.GameObjects.Text
  private helpText?: Phaser.GameObjects.Text

  constructor() {
    super('UIScene')
  }

  create(): void {
    this.topPanel = this.add.rectangle(0, 0, 10, 10, 0x020617, 0.78)
      .setStrokeStyle(2, 0x38bdf8, 0.2)

    this.bottomPanel = this.add.rectangle(0, 0, 10, 10, 0x020617, 0.78)
      .setStrokeStyle(2, 0x38bdf8, 0.14)

    this.titleText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    })

    this.objectiveText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#cbd5e1'
    })

    this.enemiesText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#facc15',
      fontStyle: 'bold'
    })

    this.statusText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#e2e8f0'
    })

    this.helpText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      color: '#93c5fd'
    })

    this.layoutScene(this.scale.width, this.scale.height)

    this.game.events.on('ui:update', this.handleUpdate, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('ui:update', this.handleUpdate, this)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    })
  }

  private handleUpdate(payload: UIState): void {
    this.titleText?.setText(payload.levelName)
    this.objectiveText?.setText(payload.objective)
    this.enemiesText?.setText(`Raiders Remaining: ${payload.enemiesRemaining}`)
    this.statusText?.setText(payload.status)
    this.helpText?.setText(payload.help)
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.layoutScene(gameSize.width, gameSize.height)
  }

  private layoutScene(width: number, height: number): void {
    const hud = getHudMetrics(width, height)
    const panelWidth = Math.max(width - hud.panelPadding * 2, 120)
    const panelLeft = (width - panelWidth) / 2
    const innerLeft = panelLeft + 16
    const innerRight = panelLeft + panelWidth - 16
    const topPanelY = hud.topBandHeight / 2
    const topPanelTop = topPanelY - hud.topPanelHeight / 2
    const bottomPanelY = height - hud.bottomBandHeight / 2
    const bottomPanelTop = bottomPanelY - hud.bottomPanelHeight / 2

    this.topPanel?.setPosition(width / 2, topPanelY).setSize(panelWidth, hud.topPanelHeight)
    this.bottomPanel?.setPosition(width / 2, bottomPanelY).setSize(panelWidth, hud.bottomPanelHeight)

    const titleSize = clamp(width * 0.024, 18, 24)
    const objectiveSize = clamp(width * 0.014, 12, 15)
    const enemiesSize = clamp(width * 0.018, 16, 22)
    const statusSize = clamp(width * 0.015, 14, 18)
    const helpSize = clamp(width * 0.0115, 11, 14)

    this.titleText
      ?.setPosition(innerLeft, topPanelTop + 12)
      .setOrigin(0, 0)
      .setFontSize(titleSize)

    this.enemiesText
      ?.setPosition(innerRight, topPanelTop + 14)
      .setOrigin(1, 0)
      .setFontSize(enemiesSize)

    this.objectiveText
      ?.setPosition(innerLeft, topPanelTop + 14 + titleSize)
      .setOrigin(0, 0)
      .setFontSize(objectiveSize)
      .setWordWrapWidth(panelWidth - 32)

    if (hud.narrow) {
      this.statusText
        ?.setPosition(innerLeft, bottomPanelTop + 12)
        .setOrigin(0, 0)
        .setFontSize(statusSize)
        .setWordWrapWidth(panelWidth - 32)

      this.helpText
        ?.setPosition(innerLeft, bottomPanelTop + 20 + statusSize)
        .setOrigin(0, 0)
        .setFontSize(helpSize)
        .setWordWrapWidth(panelWidth - 32)
        .setStyle({ align: 'left' })
    } else {
      this.statusText
        ?.setPosition(innerLeft, bottomPanelTop + 14)
        .setOrigin(0, 0)
        .setFontSize(statusSize)
        .setWordWrapWidth(panelWidth * 0.42)

      this.helpText
        ?.setPosition(innerRight, bottomPanelTop + 14)
        .setOrigin(1, 0)
        .setFontSize(helpSize)
        .setWordWrapWidth(panelWidth * 0.44)
        .setStyle({ align: 'right' })
    }
  }
}
