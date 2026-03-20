import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { MenuScene } from './scenes/MenuScene'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'

export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#09111f',
  render: {
    pixelArt: false,
    antialias: true
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    expandParent: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  scene: [BootScene, MenuScene, GameScene, UIScene]
}
