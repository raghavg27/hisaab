'use client';

/**
 * Optional sounds (§11.5), synthesised with Web Audio so nothing is downloaded:
 * a soft chip clink on confirm and a bell on the settlement reveal.
 */
let ctx: AudioContext | null = null;

function tone(at: number, freq: number, peak: number, decay: number, type: OscillatorType = 'sine') {
  const osc = ctx!.createOscillator();
  const gain = ctx!.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(gain).connect(ctx!.destination);
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

export function playSound(kind: 'clink' | 'bell') {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return;
  ctx ??= new AudioContext();
  void ctx.resume();
  const t = ctx.currentTime;
  if (kind === 'clink') {
    // Two ceramic chips touching: bright, inharmonic, gone in ~120 ms.
    tone(t, 2650, 0.06, 0.09, 'triangle');
    tone(t + 0.035, 3480, 0.04, 0.12, 'triangle');
  } else {
    // A small temple bell: fundamental plus inharmonic partials with a long tail.
    for (const [ratio, peak, decay] of [
      [1, 0.12, 1.8],
      [2.76, 0.05, 1.1],
      [5.4, 0.025, 0.6],
    ] as const)
      tone(t, 880 * ratio, peak, decay);
  }
}
