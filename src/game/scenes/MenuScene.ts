import Phaser from 'phaser'
import { PLAYABLE_AREA_LABEL } from '../utils/boardGeometry'
import { clamp } from '../utils/layout'

interface MenuButton {
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  description: Phaser.GameObjects.Text
  onClick: () => void
  hovered: boolean
}

/**
 * Responsive title/menu scene.
 *
 * The menu acts as the hub for both campaign play and the published map-slot
 * workflow, routing players either into the runtime campaign or the GitHub-
 * backed editor without adding app-shell complexity outside Phaser.
 */
export class MenuScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Rectangle
  private frame?: Phaser.GameObjects.Rectangle
  private panel?: Phaser.GameObjects.Rectangle
  private titleText?: Phaser.GameObjects.Text
  private subtitleText?: Phaser.GameObjects.Text
  private controlsTitle?: Phaser.GameObjects.Text
  private controlsText?: Phaser.GameObjects.Text
  private playButton?: MenuButton
  private editorButton?: MenuButton

  constructor() {
    super('MenuScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#09111f')
    this.scene.stop('UIScene')

    this.background = this.add.rectangle(0, 0, 10, 10, 0x0b1324).setOrigin(0)
    this.frame = this.add.rectangle(0, 0, 10, 10, 0x12203a, 0.9).setStrokeStyle(4, 0x38bdf8, 0.35)
    this.panel = this.add.rectangle(0, 0, 10, 10, 0x0f172a, 0.92).setStrokeStyle(2, 0x94a3b8, 0.4)

    this.titleText = this.add.text(0, 0, 'STONE AGE: ICE SHIFT', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.subtitleText = this.add.text(0, 0, `Play the campaign from Map 01 or manage published ${PLAYABLE_AREA_LABEL} stage slots in the generator.`, {
      fontFamily: 'Arial',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5)

    this.controlsTitle = this.add.text(0, 0, 'How It Works', {
      fontFamily: 'Arial',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.controlsText = this.add.text(0, 0,
      [
        'Play: always starts at Map 01 and advances to the next available map number after each clear.',
        'Generator: edits Map 01, publishes maps 02-99, and can upload/download validated JSON slot files.',
        'Gameplay: Arrow keys / WASD move and auto-push, Space + direction launches, mouse/touch also steer and push.'
      ].join('\n\n'),
      {
        fontFamily: 'Arial',
        color: '#dbeafe',
        align: 'center'
      }).setOrigin(0.5)

    this.playButton = this.createMenuButton(
      'Play',
      'Start from Map 01 and progress through the published map slots.',
      () => this.startGame()
    )

    this.editorButton = this.createMenuButton(
      'Generate Maps',
      `Open the ${PLAYABLE_AREA_LABEL} map generator and manage published maps 01-99.`,
      () => this.openEditor()
    )

    this.layoutScene(this.scale.width, this.scale.height)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    })

    this.input.keyboard?.once('keydown-ENTER', () => this.startGame())
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame())
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.layoutScene(gameSize.width, gameSize.height)
  }

  private layoutScene(width: number, height: number): void {
    const frameWidth = width * 0.9
    const frameHeight = height * 0.82
    const panelWidth = Math.min(width * 0.84, 840)
    const panelHeight = clamp(height * 0.52, 320, 420)
    const titleSize = clamp(width * 0.036, 28, 46)
    const subtitleSize = clamp(width * 0.017, 16, 22)
    const controlsTitleSize = clamp(width * 0.022, 22, 28)
    const controlsSize = clamp(width * 0.0145, 13, 18)
    const buttonWidth = Math.min(panelWidth - 60, 620)
    const buttonHeight = clamp(height * 0.09, 72, 96)

    this.background?.setSize(width, height)

    this.frame
      ?.setPosition(width / 2, height / 2)
      .setSize(frameWidth, frameHeight)

    this.panel
      ?.setPosition(width / 2, height / 2 + height * 0.06)
      .setSize(panelWidth, panelHeight)

    this.titleText
      ?.setPosition(width / 2, height * 0.14)
      .setFontSize(titleSize)

    this.subtitleText
      ?.setPosition(width / 2, height * 0.22)
      .setFontSize(subtitleSize)
      .setWordWrapWidth(Math.min(width * 0.82, 820))

    this.controlsTitle
      ?.setPosition(width / 2, height / 2 - panelHeight * 0.36)
      .setFontSize(controlsTitleSize)

    this.controlsText
      ?.setPosition(width / 2, height / 2 - panelHeight * 0.12)
      .setFontSize(controlsSize)
      .setWordWrapWidth(panelWidth - 70)

    const primaryButtonY = height / 2 + panelHeight * 0.16
    this.setButtonLayout(this.playButton, width / 2 - buttonWidth / 2, primaryButtonY, buttonWidth, buttonHeight, clamp(width * 0.018, 18, 24), clamp(width * 0.0115, 11, 14))
    this.setButtonLayout(this.editorButton, width / 2 - buttonWidth / 2, primaryButtonY + buttonHeight + 18, buttonWidth, buttonHeight, clamp(width * 0.018, 18, 24), clamp(width * 0.0115, 11, 14))
  }

  private createMenuButton(label: string, description: string, onClick: () => void): MenuButton {
    const button: MenuButton = {
      background: this.add.rectangle(0, 0, 10, 10, 0x1e293b, 1).setOrigin(0),
      label: this.add.text(0, 0, label, {
        fontFamily: 'Arial',
        color: '#f8fafc',
        fontStyle: 'bold'
      }).setOrigin(0.5),
      description: this.add.text(0, 0, description, {
        fontFamily: 'Arial',
        color: '#cbd5e1',
        align: 'center'
      }).setOrigin(0.5),
      onClick,
      hovered: false
    }

    button.background.setStrokeStyle(2, 0x38bdf8, 0.28)
    button.background.setInteractive({ useHandCursor: true })
    button.background.on('pointerdown', () => button.onClick())
    button.background.on('pointerover', () => {
      button.hovered = true
      this.applyButtonStyle(button)
    })
    button.background.on('pointerout', () => {
      button.hovered = false
      this.applyButtonStyle(button)
    })

    return button
  }

  private setButtonLayout(button: MenuButton | undefined, x: number, y: number, width: number, height: number, labelSize: number, descriptionSize: number): void {
    if (!button) {
      return
    }

    button.background.setPosition(x, y).setSize(width, height)
    button.label.setPosition(x + width / 2, y + height * 0.34).setFontSize(labelSize)
    button.description.setPosition(x + width / 2, y + height * 0.7).setFontSize(descriptionSize).setWordWrapWidth(width - 26)
    this.applyButtonStyle(button)
  }

  private applyButtonStyle(button: MenuButton): void {
    if (button.hovered) {
      button.background.setFillStyle(0x2563eb, 0.78).setStrokeStyle(2, 0x93c5fd, 0.35)
      return
    }

    button.background.setFillStyle(0x1e293b, 1).setStrokeStyle(2, 0x38bdf8, 0.28)
  }

  private startGame(): void {
    this.scene.start('GameScene', { levelSlot: 1 })
  }

  private openEditor(): void {
    this.scene.start('MapEditorScene')
  }
}
