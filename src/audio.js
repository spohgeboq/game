/**
 * Real-time procedural Web Audio soundscape for alpine skiing
 * (Wind rush, edge carving snow hiss, braking crunch, jump/landing thuds, slalom chimes)
 */
export class AlpineAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = false;
    this.initialized = false;

    this.windGain = null;
    this.windFilter = null;
    this.carveGain = null;
    this.carveFilter = null;
    this.glideGain = null;
    this.glideFilter = null;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.72;
    this.masterGain.connect(this.ctx.destination);

    // Create 3-second seamless pink/white noise buffer
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const out = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
      b6 = white * 0.115926;
    }

    const whiteBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const wOut = whiteBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      wOut[i] = (Math.random() * 2 - 1) * 0.35;
    }

    // 1. Alpine Wind Channel (Pink noise -> Lowpass/Bandpass)
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 260;
    this.windFilter.Q.value = 0.75;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.04;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSrc.start();

    // 2. Smooth Snow Glide Channel
    const glideSrc = this.ctx.createBufferSource();
    glideSrc.buffer = noiseBuffer;
    glideSrc.loop = true;
    this.glideFilter = this.ctx.createBiquadFilter();
    this.glideFilter.type = 'highpass';
    this.glideFilter.frequency.value = 900;
    this.glideGain = this.ctx.createGain();
    this.glideGain.gain.value = 0.0;
    glideSrc.connect(this.glideFilter);
    this.glideFilter.connect(this.glideGain);
    this.glideGain.connect(this.masterGain);
    glideSrc.start();

    // 3. Crisp Ski Edge Carve / Hockey-Stop Scrape Channel (White noise -> Bandpass)
    const carveSrc = this.ctx.createBufferSource();
    carveSrc.buffer = whiteBuffer;
    carveSrc.loop = true;
    this.carveFilter = this.ctx.createBiquadFilter();
    this.carveFilter.type = 'bandpass';
    this.carveFilter.frequency.value = 1850;
    this.carveFilter.Q.value = 1.1;
    this.carveGain = this.ctx.createGain();
    this.carveGain.gain.value = 0.0;
    carveSrc.connect(this.carveFilter);
    this.carveFilter.connect(this.carveGain);
    this.carveGain.connect(this.masterGain);
    carveSrc.start();

    this.noiseBuffer = noiseBuffer;
    this.whiteBuffer = whiteBuffer;
    this.initialized = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.04);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  updateContinuous(state, active) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (!active) {
      // Soft ambient mountain breeze on title/pause screen
      this.windGain.gain.setTargetAtTime(0.06, now, 0.2);
      this.windFilter.frequency.setTargetAtTime(220, now, 0.2);
      this.glideGain.gain.setTargetAtTime(0.0, now, 0.1);
      this.carveGain.gain.setTargetAtTime(0.0, now, 0.1);
      return;
    }

    const speedRatio = Math.min(1.4, state.speed / 30);
    const carveMag = Math.abs(state.carveVisual);

    // Wind roars smoothly with speed and shifts higher pitched when soaring in air!
    const airBoost = state.grounded ? 1.0 : 1.32;
    const targetWindGain = 0.05 + Math.pow(speedRatio, 1.45) * 0.36 * airBoost;
    const targetWindFreq = 210 + speedRatio * 740 + (state.grounded ? 0 : 280);
    this.windGain.gain.setTargetAtTime(Math.min(0.65, targetWindGain), now, 0.08);
    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.08);

    if (state.grounded && state.speed > 1.2) {
      const targetGlide = Math.min(0.28, speedRatio * 0.18 * (1 + state.offPisteRatio * 0.55));
      this.glideGain.gain.setTargetAtTime(targetGlide, now, 0.05);
      this.glideFilter.frequency.setTargetAtTime(1150 - state.offPisteRatio * 350 + speedRatio * 450, now, 0.08);

      const scrapeIntensity = Math.min(1.2, carveMag * 0.95 + (state.braking ? 1.05 : 0));
      const targetCarve = scrapeIntensity * Math.min(1, speedRatio * 1.15) * 0.32;
      this.carveGain.gain.setTargetAtTime(targetCarve, now, 0.045);
      this.carveFilter.frequency.setTargetAtTime(
        1550 + scrapeIntensity * 1150 + (state.braking ? 450 : 0),
        now,
        0.06
      );
    } else {
      // Complete silence of snow friction while soaring through the air!
      this.glideGain.gain.setTargetAtTime(0, now, 0.035);
      this.carveGain.gain.setTargetAtTime(0, now, 0.035);
    }
  }

  playJump(strength = 1.0) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    // Punchy spring pop
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(240 + strength * 70, now + 0.13);
    g.gain.setValueAtTime(0.18 * Math.min(1.3, strength), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);

    // Quick airy snow-lift burst
    const src = this.ctx.createBufferSource();
    src.buffer = this.whiteBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(1600, now);
    flt.frequency.exponentialRampToValueAtTime(650, now + 0.22);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.16, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    src.connect(flt);
    flt.connect(ng);
    ng.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.26);
  }

  playLanding(intensity = 0.7, clean = true) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1.0, 0.25 + intensity * 0.55);

    // Deep muffled snowy impact thump
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(clean ? 105 : 88, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    g.gain.setValueAtTime(vol * 0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);

    // Crisp crunchy powder stomp burst
    const src = this.ctx.createBufferSource();
    src.buffer = this.whiteBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = clean ? 1350 : 950;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.42, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    src.connect(flt);
    flt.connect(ng);
    ng.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.28);

    if (clean && intensity > 0.35) {
      this._playTone(587.33, 0.08, 0.14, 'sine', 0.04);
      this._playTone(880.0, 0.07, 0.22, 'sine', 0.09);
    }
  }

  playGateChime(combo = 1) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const semitoneShift = Math.min(12, (combo - 1));
    const base = 523.25 * Math.pow(2, semitoneShift / 12); // Rising C5 scale!
    this._playTone(base, 0.13, 0.16, 'triangle', 0);
    this._playTone(base * 1.25, 0.1, 0.22, 'sine', 0.06);
  }

  playTrickComplete() {
    if (!this.initialized || !this.ctx || this.muted) return;
    this._playTone(659.25, 0.12, 0.16, 'triangle', 0);
    this._playTone(783.99, 0.12, 0.18, 'triangle', 0.06);
    this._playTone(1046.5, 0.14, 0.28, 'sine', 0.12);
  }

  playGrabSnap(chainIdx = 1) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const base = 440 * Math.pow(2, Math.min(10, (chainIdx - 1) * 2) / 12);
    this._playTone(base, 0.1, 0.09, 'triangle', 0);
    this._playTone(base * 1.5, 0.07, 0.12, 'sine', 0.03);
  }

  playNewTrickDiscovery() {
    if (!this.initialized || !this.ctx || this.muted) return;
    this._playTone(880, 0.09, 0.14, 'sine', 0.04);
    this._playTone(1174.66, 0.09, 0.16, 'sine', 0.1);
    this._playTone(1567.98, 0.1, 0.26, 'sine', 0.16);
  }

  playComboBank(multiplier = 1) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const chord = multiplier >= 4 ? [392.0, 493.88, 587.33, 783.99] : [392.0, 493.88, 587.33];
    chord.forEach((f, idx) => {
      this._playTone(f, 0.09, 0.34, 'triangle', idx * 0.045);
    });
  }

  playCollision(intensity = 0.8) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.22);
    g.gain.setValueAtTime(0.32 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playFinishFanfare() {
    if (!this.initialized || !this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this._playTone(freq, 0.14, 0.42, 'triangle', idx * 0.09);
    });
  }

  _playTone(freq, peakGain, duration, type = 'sine', delay = 0) {
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peakGain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
