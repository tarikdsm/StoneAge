import Phaser from 'phaser'

/**
 * Plays a lightweight synthesized push sound without requiring a binary audio asset.
 *
 * The fallback is intentionally silent if Web Audio is unavailable.
 */
export function playPushSfx(scene: Phaser.Scene): void {
  const soundManager = scene.sound as Phaser.Sound.WebAudioSoundManager | Phaser.Sound.NoAudioSoundManager | Phaser.Sound.HTML5AudioSoundManager

  if (!('context' in soundManager) || !soundManager.context) {
    return
  }

  const context = soundManager.context
  const start = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(240, start)
  oscillator.frequency.linearRampToValueAtTime(120, start + 0.08)

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + 0.1)
}
