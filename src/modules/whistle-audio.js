/**
 * Synthesizes a referee whistle sound using the standard Web Audio API.
 * 100% offline with zero external audio assets.
 */
export function playWhistleSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Play two sharp referee whistle blasts
    [0, 0.18].forEach((startTimeOffset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // High-pitched frequency characteristic of a referee whistle
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2600, now + startTimeOffset);
      osc.frequency.exponentialRampToValueAtTime(2900, now + startTimeOffset + 0.12);

      gain.gain.setValueAtTime(0.01, now + startTimeOffset);
      gain.gain.linearRampToValueAtTime(0.3, now + startTimeOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startTimeOffset + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + startTimeOffset);
      osc.stop(now + startTimeOffset + 0.15);
    });
  } catch (_) {
    // AudioContext blocked or unsupported in test environments
  }
}
