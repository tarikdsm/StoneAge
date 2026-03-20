import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../config'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#09111f')

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b1324)
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.88, GAME_HEIGHT * 0.78, 0x12203a, 0.9)
      .setStrokeStyle(4, 0x38bdf8, 0.35)

    this.add.text(GAME_WIDTH / 2, 120, 'STONE AGE: ICE SHIFT', {
      fontFamily: 'Arial',
      fontSize: '46px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, 180, 'A production-minded Phaser prototype inspired by Stone Age / Pengo.', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5)

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 760, 290, 0x0f172a, 0.92)
    panel.setStrokeStyle(2, 0x94a3b8, 0.4)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, 'Controls', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#f8fafc',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 5,
      [
        'Desktop: Arrow keys / WASD move, Space pushes, left click moves, right click pushes.',
        'Touch: swipe to move, tap an adjacent block to shove it into a raider.',
        'Goal: crush every raider, then reach the glowing exit tile.'
      ].join('\n\n'),
      {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: '#dbeafe',
        align: 'center',
        wordWrap: { width: 680 }
      }).setOrigin(0.5)

    const cta = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 92, 'Click, tap, Enter, or Space to begin', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#facc15',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.tweens.add({
      targets: cta,
      alpha: 0.35,
      yoyo: true,
      repeat: -1,
      duration: 700
    })

    this.input.once('pointerdown', () => this.startGame())
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame())
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame())
  }

  private startGame(): void {
    this.scene.start('GameScene')
    this.scene.launch('UIScene')
  }
}
