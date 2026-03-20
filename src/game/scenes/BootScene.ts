import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload(): void {
    this.load.setPath('assets')
    this.load.image('player', 'sprites/player.svg')
    this.load.image('block', 'sprites/block.svg')
    this.load.image('enemy', 'sprites/enemy.svg')
  }

  create(): void {
    this.scene.start('MenuScene')
  }
}
