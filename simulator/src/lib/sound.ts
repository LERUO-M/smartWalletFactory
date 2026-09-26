// Tiny key-click generator (WebAudio) so we ship no audio files.

let ctx: AudioContext | null = null;

export function keyClick(kind: "key" | "call" | "end" = "key") {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = kind === "key" ? 1400 : kind === "call" ? 900 : 500;
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {
    /* audio blocked – ignore */
  }
}

/** Classic two-beep "new message" alert */
export function smsTone() {
  keyClick("call");
  setTimeout(() => keyClick("call"), 160);
}
