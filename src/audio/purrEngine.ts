/**
 * Procedural Web Audio API Cat & Ambience Engine (v2.0)
 *
 * Synthesizes everything in real time with zero external audio downloads:
 * 1. Dual-phase respiratory cat purring (22–28 Hz throat modulation + breath noise)
 * 2. Rainy Afternoon ASMR ambience (layered soft window rainwash + random raindrops)
 * 3. Bongo-butt patting cushioned low-frequency thump
 * 4. Soft content trill-meow & gentle warning hiss when ruffled against the grain
 * 5. Subtle comb grooming brush whisper
 */
export class PurrEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private purrEnvGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private baseOsc: OscillatorNode | null = null;
  private subHarmonicOsc: OscillatorNode | null = null;
  private pulseOsc: OscillatorNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private chestFilter: BiquadFilterNode | null = null;

  private enabled = false;
  private initialized = false;
  private baseHz = 25.0;

  private breathPhase = 0;
  private targetIntensity = 0;
  private currentIntensity = 0;
  private currentSpeed = 0;

  private targetRainLevel = 0;
  private currentRainLevel = 0;
  private dropletTimer = 0;
  private lastMeowTime = -10;
  private lastHissTime = -10;
  private lastLickTime = -10;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setBreedPurrHz(hz: number): void {
    this.baseHz = hz;
    if (this.ctx && this.baseOsc && this.subHarmonicOsc && this.pulseOsc) {
      const now = this.ctx.currentTime;
      this.baseOsc.frequency.setTargetAtTime(hz, now, 0.15);
      this.subHarmonicOsc.frequency.setTargetAtTime(hz * 2.01, now, 0.15);
      this.pulseOsc.frequency.setTargetAtTime(hz, now, 0.15);
    }
  }

  public setRainAmbience(active: boolean): void {
    this.targetRainLevel = active ? 1.0 : 0.0;
  }

  public async setEnabled(next: boolean): Promise<void> {
    this.enabled = next;
    if (next) {
      this.ensureInitialized();
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(next ? 0.88 : 0.0, now, 0.18);
    }
  }

  public unlock(): void {
    if (!this.enabled) return;
    this.ensureInitialized();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    // ----- 1) Purr Bus -----
    const finalWarmth = ctx.createBiquadFilter();
    finalWarmth.type = 'lowpass';
    finalWarmth.frequency.value = 460;
    finalWarmth.Q.value = 0.7;

    const purrEnvGain = ctx.createGain();
    purrEnvGain.gain.value = 0;

    const baseOsc = ctx.createOscillator();
    baseOsc.type = 'triangle';
    baseOsc.frequency.value = this.baseHz;

    const subHarmonicOsc = ctx.createOscillator();
    subHarmonicOsc.type = 'sine';
    subHarmonicOsc.frequency.value = this.baseHz * 2.01;

    const baseGain = ctx.createGain();
    baseGain.gain.value = 0.30;
    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.16;

    const flutterLfo = ctx.createOscillator();
    flutterLfo.type = 'sine';
    flutterLfo.frequency.value = 0.37;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.75;
    flutterLfo.connect(flutterDepth);
    flutterDepth.connect(baseOsc.frequency);

    const chestFilter = ctx.createBiquadFilter();
    chestFilter.type = 'bandpass';
    chestFilter.frequency.value = 92;
    chestFilter.Q.value = 1.4;

    baseOsc.connect(baseGain);
    subHarmonicOsc.connect(harmonicGain);
    baseGain.connect(chestFilter);
    harmonicGain.connect(chestFilter);
    chestFilter.connect(purrEnvGain);

    const brownBuffer = this.createNoiseBuffer(ctx, 3.5, 'brown');
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = brownBuffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 175;
    noiseFilter.Q.value = 1.1;

    const noiseModGain = ctx.createGain();
    noiseModGain.gain.value = 0.48;

    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = this.baseHz;

    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.44;
    pulseOsc.connect(pulseDepth);
    pulseDepth.connect(noiseModGain.gain);

    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 340;
    airFilter.Q.value = 0.9;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.12;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseModGain);
    noiseModGain.connect(purrEnvGain);

    noiseSource.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(noiseModGain);

    purrEnvGain.connect(finalWarmth);
    finalWarmth.connect(masterGain);

    // ----- 2) Rainy Afternoon Window ASMR Bus -----
    const pinkBuffer = this.createNoiseBuffer(ctx, 4.0, 'pink');
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = pinkBuffer;
    rainSource.loop = true;

    // Muffled indoor window-pane steady rainwash
    const rainLow = ctx.createBiquadFilter();
    rainLow.type = 'lowpass';
    rainLow.frequency.value = 1350;
    rainLow.Q.value = 0.55;

    const rainHigh = ctx.createBiquadFilter();
    rainHigh.type = 'highpass';
    rainHigh.frequency.value = 260;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;

    rainSource.connect(rainHigh);
    rainHigh.connect(rainLow);
    rainLow.connect(rainGain);
    rainGain.connect(masterGain);

    baseOsc.start();
    subHarmonicOsc.start();
    flutterLfo.start();
    pulseOsc.start();
    noiseSource.start();
    rainSource.start();

    this.masterGain = masterGain;
    this.purrEnvGain = purrEnvGain;
    this.rainGain = rainGain;
    this.baseOsc = baseOsc;
    this.subHarmonicOsc = subHarmonicOsc;
    this.pulseOsc = pulseOsc;
    this.noiseFilter = noiseFilter;
    this.chestFilter = chestFilter;
    this.initialized = true;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number, kind: 'brown' | 'pink' | 'white'): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (kind === 'white') {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } else if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.06 * white) / 1.06;
        data[i] = Math.max(-1, Math.min(1, last * 4.2));
      }
    } else {
      // Paul Kellet's pink noise filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = Math.max(-1, Math.min(1, pink * 0.14));
      }
    }

    // Seamless crossfade loop
    const fade = Math.min(2048, Math.floor(length * 0.05));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[length - fade + i] = data[length - fade + i] * (1 - t) + data[i] * t;
    }
    return buffer;
  }

  /** Soft cushioned hollow "bongo" pat on the cat's plump rump */
  public playButtPat(combo = 0): void {
    if (!this.enabled || !this.initialized || !this.ctx || !this.masterGain) return;
    if (this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const baseFreq = 92 + Math.min(combo, 8) * 5.5 + (Math.random() - 0.5) * 6;
    osc.frequency.setValueAtTime(baseFreq * 1.45, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.62, now + 0.095);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.001, now);
    thumpGain.gain.linearRampToValueAtTime(0.36, now + 0.009);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;

    osc.connect(lp);
    lp.connect(thumpGain);
    thumpGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  /** Gentle content feline trill / soft "mrrp-meow" */
  public playSoftMeow(): void {
    if (!this.enabled || !this.initialized || !this.ctx || !this.masterGain) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastMeowTime < 3.2) return;
    this.lastMeowTime = now;

    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const pitchScale = this.baseHz / 25.0;
    const startF = 440 * pitchScale;
    const peakF = 680 * pitchScale;
    const endF = 490 * pitchScale;

    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(peakF, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(endF, now + 0.34);

    // Subtle trill vibrato
    const trill = ctx.createOscillator();
    trill.frequency.value = 27;
    const trillGain = ctx.createGain();
    trillGain.gain.value = 18;
    trill.connect(trillGain);
    trillGain.connect(osc.frequency);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(950, now);
    formant.frequency.linearRampToValueAtTime(1450, now + 0.15);
    formant.frequency.linearRampToValueAtTime(820, now + 0.34);
    formant.Q.value = 2.6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.14, now + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc.connect(formant);
    formant.connect(env);
    env.connect(this.masterGain);

    osc.start(now);
    trill.start(now);
    osc.stop(now + 0.40);
    trill.stop(now + 0.40);
  }

  /** Brief feline warning hiss when annoyed by rough against-grain rubbing */
  public playHiss(): void {
    if (!this.enabled || !this.initialized || !this.ctx || !this.masterGain) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastHissTime < 1.8) return;
    this.lastHissTime = now;

    const ctx = this.ctx;
    const buf = this.createNoiseBuffer(ctx, 0.42, 'white');
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3400, now);
    bp.frequency.exponentialRampToValueAtTime(2100, now + 0.36);
    bp.Q.value = 1.6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.16, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    src.connect(bp);
    bp.connect(env);
    env.connect(this.masterGain);

    src.start(now);
    src.stop(now + 0.38);
  }

  /** Soft raspy ASMR cat-tongue licking sound while self-grooming ruffled fur */
  public playLickSound(): void {
    if (!this.enabled || !this.initialized || !this.ctx || !this.masterGain) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastLickTime < 0.32) return;
    this.lastLickTime = now;

    const ctx = this.ctx;
    const buf = this.createNoiseBuffer(ctx, 0.22, 'pink');
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Raspy feline papillae sweep across fur (1400 Hz -> 2500 Hz -> 1600 Hz)
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1450, now);
    bp.frequency.exponentialRampToValueAtTime(2450, now + 0.11);
    bp.frequency.exponentialRampToValueAtTime(1550, now + 0.19);
    bp.Q.value = 1.9;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.11, now + 0.045);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);

    src.connect(bp);
    bp.connect(env);
    env.connect(this.masterGain);

    src.start(now);
    src.stop(now + 0.21);
  }

  private playRainDroplet(): void {
    if (!this.ctx || !this.masterGain || this.currentRainLevel < 0.15) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f0 = 720 + Math.random() * 980;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, now + 0.045);

    const g = ctx.createGain();
    const vol = (0.008 + Math.random() * 0.015) * this.currentRainLevel;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public update(
    dt: number,
    contentment: number,
    strokeSpeed: number,
    isHeadZone: number,
    annoyance = 0,
  ): void {
    const cycleSpeed = 0.34 + contentment * 0.05;
    this.breathPhase = (this.breathPhase + dt * cycleSpeed) % 1.0;

    // Irritated cat temporarily stops purring!
    const calmFactor = Math.max(0, 1 - annoyance * 1.45);
    this.targetIntensity = (0.14 + contentment * 0.86) * calmFactor;
    const smoothRate = this.targetIntensity > this.currentIntensity ? 2.4 : 1.1;
    this.currentIntensity += (this.targetIntensity - this.currentIntensity) * Math.min(1, dt * smoothRate);
    this.currentSpeed += (strokeSpeed - this.currentSpeed) * Math.min(1, dt * 5.0);

    // Smooth rain crossfade
    this.currentRainLevel += (this.targetRainLevel - this.currentRainLevel) * Math.min(1, dt * 2.2);

    if (!this.initialized || !this.enabled || !this.ctx || !this.purrEnvGain) return;
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(this.currentRainLevel * 0.28, now, 0.12);
      if (this.currentRainLevel > 0.2) {
        this.dropletTimer -= dt;
        if (this.dropletTimer <= 0) {
          this.playRainDroplet();
          this.dropletTimer = 0.18 + Math.random() * 0.55;
        }
      }
    }

    let breathEnv = 0;
    let isInhale = true;
    if (this.breathPhase < 0.46) {
      const p = this.breathPhase / 0.46;
      breathEnv = Math.pow(Math.sin(p * Math.PI), 0.72);
      isInhale = true;
    } else if (this.breathPhase > 0.50 && this.breathPhase < 0.96) {
      const p = (this.breathPhase - 0.50) / 0.46;
      breathEnv = Math.pow(Math.sin(p * Math.PI), 0.85) * 0.84;
      isInhale = false;
    } else {
      breathEnv = 0.06;
    }

    const envLevel =
      this.currentIntensity * (0.12 + 0.88 * breathEnv) * (0.88 + this.currentSpeed * 0.22);
    this.purrEnvGain.gain.setTargetAtTime(envLevel, now, 0.04);

    if (this.noiseFilter && this.chestFilter && this.pulseOsc) {
      const targetNoiseFreq = (isInhale ? 195 : 148) + this.currentSpeed * 38 - isHeadZone * 18;
      this.noiseFilter.frequency.setTargetAtTime(targetNoiseFreq, now, 0.08);

      const targetChestFreq = (isInhale ? 96 : 84) + this.currentIntensity * 14;
      this.chestFilter.frequency.setTargetAtTime(targetChestFreq, now, 0.08);

      const dynamicHz = this.baseHz * (isInhale ? 1.03 : 0.96) + this.currentSpeed * 1.4;
      this.pulseOsc.frequency.setTargetAtTime(dynamicHz, now, 0.09);
    }
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
