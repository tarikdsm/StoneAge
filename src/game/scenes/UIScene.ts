import Phaser from 'phaser'
import { clamp, getHudMetrics } from '../utils/layout'

interface UIState {
  levelName: string
  enemiesRemaining: number
  objective: string
  status: string
  help: string
  simulatorPolicyLabel?: string
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
  private menuButton?: Phaser.GameObjects.Rectangle
  private menuButtonText?: Phaser.GameObjects.Text
  private simulatorPolicyButton?: Phaser.GameObjects.Rectangle
  private simulatorPolicyButtonText?: Phaser.GameObjects.Text
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

    this.menuButton = this.add.rectangle(0, 0, 10, 10, 0x1e293b, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0x38bdf8, 0.28)
      .setInteractive({ useHandCursor: true })

    this.menuButtonText = this.add.text(0, 0, 'Menu', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.simulatorPolicyButton = this.add.rectangle(0, 0, 10, 10, 0x1e3a5f, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0x7dd3fc, 0.36)
      .setInteractive({ useHandCursor: true })
      .setVisible(false)

    this.simulatorPolicyButtonText = this.add.text(0, 0, 'Bot: Heuristico', {
      fontFamily: 'Arial',
      color: '#e0f2fe',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false)

    this.menuButton.on('pointerup', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      this.scene.stop('GameScene')
      this.scene.start('MenuScene')
    })

    this.simulatorPolicyButton.on('pointerup', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      this.game.events.emit('ui:toggle-simulator-player-policy')
    })

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
    const showSimulatorPolicy = Boolean(payload.simulatorPolicyLabel)
    this.simulatorPolicyButton?.setVisible(showSimulatorPolicy)
    this.simulatorPolicyButtonText
      ?.setVisible(showSimulatorPolicy)
      .setText(payload.simulatorPolicyLabel ?? '')
    this.layoutScene(this.scale.width, this.scale.height)
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
    const menuButtonWidth = clamp(width * 0.1, 74, 108)
    const simulatorButtonWidth = clamp(width * 0.16, 112, 164)
    const menuButtonHeight = clamp(height * 0.05, 30, 38)
    const showSimulatorPolicy = this.simulatorPolicyButton?.visible ?? false
    const simulatorButtonX = innerRight - menuButtonWidth - 10 - simulatorButtonWidth

    this.menuButton
      ?.setPosition(innerRight - menuButtonWidth, topPanelTop + 12)
      .setSize(menuButtonWidth, menuButtonHeight)

    this.menuButtonText
      ?.setPosition(innerRight - menuButtonWidth / 2, topPanelTop + 12 + menuButtonHeight / 2)
      .setFontSize(clamp(width * 0.012, 12, 14))

    this.titleText
      ?.setPosition(innerLeft, topPanelTop + 12)
      .setOrigin(0, 0)
      .setFontSize(titleSize)
      .setWordWrapWidth(panelWidth - menuButtonWidth - (showSimulatorPolicy ? simulatorButtonWidth + 62 : 52))

    this.simulatorPolicyButton
      ?.setPosition(simulatorButtonX, topPanelTop + 12)
      .setSize(simulatorButtonWidth, menuButtonHeight)

    this.simulatorPolicyButtonText
      ?.setPosition(simulatorButtonX + simulatorButtonWidth / 2, topPanelTop + 12 + menuButtonHeight / 2)
      .setFontSize(clamp(width * 0.0115, 11, 13))

    this.enemiesText
      ?.setPosition(innerRight, topPanelTop + 18 + menuButtonHeight)
      .setOrigin(1, 0)
      .setFontSize(enemiesSize)

    this.objectiveText
      ?.setPosition(innerLeft, topPanelTop + 14 + titleSize)
      .setOrigin(0, 0)
      .setFontSize(objectiveSize)
      .setWordWrapWidth(panelWidth - 32)

    if (hud.narrow) {
      const titleWrapWidth = Math.max(panelWidth - menuButtonWidth - 48, 120)

      this.menuButton
        ?.setPosition(innerRight - menuButtonWidth, topPanelTop + 10)
        .setSize(menuButtonWidth, menuButtonHeight)

      this.menuButtonText
        ?.setPosition(innerRight - menuButtonWidth / 2, topPanelTop + 10 + menuButtonHeight / 2)
        .setFontSize(clamp(width * 0.03, 11, 13))

      this.titleText
        ?.setPosition(innerLeft, topPanelTop + 10)
        .setOrigin(0, 0)
        .setFontSize(clamp(width * 0.045, 16, 22))
        .setWordWrapWidth(Math.max(titleWrapWidth - (showSimulatorPolicy ? simulatorButtonWidth + 12 : 0), 110))

      this.simulatorPolicyButton
        ?.setPosition(innerLeft, topPanelTop + hud.topPanelHeight - menuButtonHeight - 12)
        .setSize(Math.min(panelWidth - menuButtonWidth - 42, simulatorButtonWidth), menuButtonHeight)

      this.simulatorPolicyButtonText
        ?.setPosition(
          (this.simulatorPolicyButton?.x ?? innerLeft) + (this.simulatorPolicyButton?.width ?? simulatorButtonWidth) / 2,
          (this.simulatorPolicyButton?.y ?? topPanelTop) + menuButtonHeight / 2
        )
        .setFontSize(clamp(width * 0.028, 10, 12))

      this.objectiveText
        ?.setPosition(innerLeft, topPanelTop + 18 + titleSize)
        .setOrigin(0, 0)
        .setFontSize(clamp(width * 0.028, 10, 13))
        .setWordWrapWidth(panelWidth - 32)

      this.enemiesText
        ?.setPosition(innerLeft, topPanelTop + hud.topPanelHeight - enemiesSize - 12)
        .setOrigin(0, 0)
        .setFontSize(clamp(width * 0.04, 13, 18))
        .setWordWrapWidth(panelWidth - 32)

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
      this.menuButton
        ?.setPosition(innerRight - menuButtonWidth, topPanelTop + 12)
        .setSize(menuButtonWidth, menuButtonHeight)

      this.menuButtonText
        ?.setPosition(innerRight - menuButtonWidth / 2, topPanelTop + 12 + menuButtonHeight / 2)
        .setFontSize(clamp(width * 0.012, 12, 14))

      this.titleText
        ?.setPosition(innerLeft, topPanelTop + 12)
        .setOrigin(0, 0)
        .setFontSize(titleSize)
        .setWordWrapWidth(panelWidth - menuButtonWidth - (showSimulatorPolicy ? simulatorButtonWidth + 62 : 52))

      this.simulatorPolicyButton
        ?.setPosition(simulatorButtonX, topPanelTop + 12)
        .setSize(simulatorButtonWidth, menuButtonHeight)

      this.simulatorPolicyButtonText
        ?.setPosition(simulatorButtonX + simulatorButtonWidth / 2, topPanelTop + 12 + menuButtonHeight / 2)
        .setFontSize(clamp(width * 0.0115, 11, 13))

      this.enemiesText
        ?.setPosition(innerRight, topPanelTop + 18 + menuButtonHeight)
        .setOrigin(1, 0)
        .setFontSize(enemiesSize)

      this.objectiveText
        ?.setPosition(innerLeft, topPanelTop + 14 + titleSize)
        .setOrigin(0, 0)
        .setFontSize(objectiveSize)
        .setWordWrapWidth(panelWidth - 32)

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
