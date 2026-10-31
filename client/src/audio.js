// Tiny synthesized sounds (no files needed yet). Swap for real sounds in assets/sounds later.
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.6; }

  start() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = this.ctx.sampleRate * 0.3;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  shot(loud = 1, gun = 'ar_auto') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = gun === 'pistol_fast' ? 2600 : gun === 'smg_fast' ? 3400 : 2000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5 * loud, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (gun === 'smg_fast' ? 0.08 : 0.14));
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.2);
  }

  tone(freq, dur, type = 'square', vol = 0.15) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  hit(head) { this.tone(head ? 1500 : 1100, 0.05, 'square', 0.08); }
  kill() { this.tone(880, 0.08, 'triangle', 0.2); setTimeout(() => this.tone(1320, 0.12, 'triangle', 0.2), 70); }
  hurt() { this.tone(160, 0.12, 'sawtooth', 0.12); }
  reload() { this.tone(420, 0.04, 'square', 0.06); setTimeout(() => this.tone(620, 0.04, 'square', 0.06), 120); }
}
