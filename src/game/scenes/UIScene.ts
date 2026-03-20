import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../config'

interface UIState {
  levelName: string
  enemiesRemaining: number
  objective: string
  status: string
  help: string
}

export class UIScene extends Phaser.Scene {
  private titleText?: Phaser.GameObjects.Text
  private objectiveText?: Phaser.GameObjects.Text
  private enemiesText?: Phaser.GameObjects.Text
  private statusText?: Phaser.GameObjects.Text
  private helpText?: Phaser.GameObjects.Text

  constructor() {
    super('UIScene')
  }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, 40, GAME_WIDTH - 48, 76, 0x020617, 0.78)
      .setStrokeStyle(2, 0x38bdf8, 0.2)

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 36, GAME_WIDTH - 48, 72, 0x020617, 0.78)
      .setStrokeStyle(2, 0x38bdf8, 0.14)

    this.titleText = this.add.text(32, 16, '', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#f8fafc',
      fontStyle: 'bold'
    })

    this.objectiveText = this.add.text(32, 46, '', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: '#cbd5e1',
      wordWrap: { width: 760 }
    })

    this.enemiesText = this.add.text(GAME_WIDTH - 32, 18, '', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#facc15',
      fontStyle: 'bold'
    }).setOrigin(1, 0)

    this.statusText = this.add.text(32, GAME_HEIGHT - 56, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#e2e8f0',
      wordWrap: { width: 520 }
    })

    this.helpText = this.add.text(GAME_WIDTH - 32, GAME_HEIGHT - 58, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#93c5fd',
      align: 'right',
      wordWrap: { width: 560 }
    }).setOrigin(1, 0)

    this.game.events.on('ui:update', this.handleUpdate, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('ui:update', this.handleUpdate, this)
    })
  }

  private handleUpdate(payload: UIState): void {
    this.titleText?.setText(payload.levelName)
    this.objectiveText?.setText(payload.objective)
    this.enemiesText?.setText(`Raiders Remaining: ${payload.enemiesRemaining}`)
    this.statusText?.setText(payload.status)
    this.helpText?.setText(payload.help)
  }
}
