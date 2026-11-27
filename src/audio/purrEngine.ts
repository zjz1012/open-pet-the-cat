/**
 * Real-Sampled Cat Purring + Procedural Ambience Engine (v2.3)
 *
 * - Primary purr: Real Public Domain domestic cat purring recording (`public/assets/cat-purr.mp3`),
 *   decoded via Web Audio API with sample-accurate PCM crossfade looping (zero MP3 gap/click!),
 *   dynamic breed pitch scaling (`playbackRate`), and petting-responsive volume & warmth filter.
 * - Ambience & tactile SFX: Rainy Afternoon window rainwash, soft bongo butt-pat thump,
 *   raspy ASMR self-grooming lick, and brief warning hiss.
 */
export class PurrEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private purrGain: GainNode | null = null;
  private purrFilter: BiquadFilterNode | null = null;
  private purrSource: AudioBufferSourceNode | null = null;
  private purrBuffer: AudioBuffer | null = null;
  private purrLoadPromise: Promise<void> | null = null;
  private rainGain: GainNode | null = null;

  private enabled = false;
  private initialized = false;
  private baseHz = 25.0;

  private targetIntensity = 0;
  private currentIntensity = 0;
  private currentSpeed = 0;

  private targetRainLevel = 0;
  private currentRainLevel = 0;
  private dropletTimer = 0;
  private lastHissTime = -10;
  private lastLickTime = -10;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setBreedPurrHz(hz: number): void {
    this.baseHz = hz;
    if (this.ctx && this.purrSource) {
      const rate = Math.max(0.84, Math.min(1.16, hz / 25.0));
      this.purrSource.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.25);
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
      void this.ensurePurrSampleLoaded();
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(next ? 0.92 : 0.0, now, 0.20);
    }
  }

  public unlock(): void {
    if (!this.enabled) return;
    this.ensureInitialized();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    void this.ensurePurrSampleLoaded();
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

    // ----- 1) Real Cat Purr Sample Bus -----
    const purrFilter = ctx.createBiquadFilter();
    purrFilter.type = 'lowpass';
    purrFilter.frequency.value = 900;
    purrFilter.Q.value = 0.6;

    const purrGain = ctx.createGain();
    purrGain.gain.value = 0;

    purrFilter.connect(purrGain);
    purrGain.connect(masterGain);

    // ----- 2) Rainy Afternoon Window ASMR Bus -----
    const pinkBuffer = this.createNoiseBuffer(ctx, 4.0, 'pink');
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = pinkBuffer;
    rainSource.loop = true;

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
    rainSource.start();

    this.masterGain = masterGain;
    this.purrGain = purrGain;
    this.purrFilter = purrFilter;
    this.rainGain = rainGain;
    this.initialized = true;
  }

  /**
   * Fetches and decodes `public/assets/cat-purr.mp3`, then trims MP3 priming padding
   * and builds a 100% seamless PCM crossfaded loop buffer so there is ZERO loop click!
   */
  private async ensurePurrSampleLoaded(): Promise<void> {
    if (this.purrBuffer || !this.ctx) {
      if (this.purrBuffer && !this.purrSource) this.startPurrLoop();
      return;
    }
    if (this.purrLoadPromise) return this.purrLoadPromise;

    this.purrLoadPromise = (async () => {
      try {
        const resp = await fetch('./assets/cat-purr.mp3');
        if (!resp.ok) return;
        const arrayBuf = await resp.arrayBuffer();
        if (!this.ctx) return;
        const raw = await this.ctx.decodeAudioData(arrayBuf);
        this.purrBuffer = this.buildSeamlessLoopBuffer(this.ctx, raw);
        this.startPurrLoop();
      } catch (err) {
        console.warn('Failed to load real cat purr audio sample:', err);
      }
    })();

    return this.purrLoadPromise;
  }

  private buildSeamlessLoopBuffer(ctx: AudioContext, raw: AudioBuffer): AudioBuffer {
    const sr = raw.sampleRate;
    // Trim 0.20s off start & end to remove any MP3 priming silence
    const trimStart = Math.min(Math.floor(sr * 0.20), Math.floor(raw.length * 0.1));
    const trimEnd = Math.min(Math.floor(sr * 0.20), Math.floor(raw.length * 0.1));
    const usableLen = Math.max(Math.floor(sr * 1.5), raw.length - trimStart - trimEnd);
    // Overlap 0.65s tail seamlessly onto head using equal-power sine/cosine crossfade
    const fadeLen = Math.min(Math.floor(sr * 0.65), Math.floor(usableLen * 0.25));
    const outLen = usableLen - fadeLen;

    const out = ctx.createBuffer(raw.numberOfChannels, outLen, sr);
    for (let ch = 0; ch < raw.numberOfChannels; ch++) {
      const src = raw.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < outLen; i++) {
        dst[i] = src[trimStart + i];
      }
      // Crossfade the trimmed tail into the beginning of `dst`
      for (let i = 0; i < fadeLen; i++) {
        const t = i / fadeLen;
        const fadeIn = Math.sin(t * Math.PI * 0.5);
        const fadeOut = Math.cos(t * Math.PI * 0.5);
        const tailSample = src[trimStart + outLen + i];
        dst[i] = dst[i] * fadeIn + tailSample * fadeOut;
      }
    }
    return out;
  }

  private startPurrLoop(): void {
    if (!this.ctx || !this.purrBuffer || !this.purrFilter || this.purrSource) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.purrBuffer;
    src.loop = true;
    src.playbackRate.value = Math.max(0.84, Math.min(1.16, this.baseHz / 25.0));
    src.connect(this.purrFilter);
    src.start(0);
    this.purrSource = src;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number, kind: 'pink' | 'white'): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (kind === 'white') {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } else {
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
    thumpGain.gain.linearRampToValueAtTime(0.32, now + 0.009);
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

  /** Kept as a no-op hook so pure real purring stays natural without robotic synth meows */
  public playSoftMeow(): void {
    // Intentionally silent — real cat purr swell conveys contentment naturally
  }

  /** Brief feline warning hiss when annoyed by rough against-grain rubbing */
  public playHiss(): void {
    if (!this.enabled || !this.initialized || !this.ctx || !this.masterGain) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastHissTime < 1.8) return;
    this.lastHissTime = now;

    const ctx = this.ctx;
    const buf = this.createNoiseBuffer(ctx, 0.36, 'white');
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200, now);
    bp.frequency.exponentialRampToValueAtTime(1950, now + 0.32);
    bp.Q.value = 1.6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.12, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    src.connect(bp);
    bp.connect(env);
    env.connect(this.masterGain);

    src.start(now);
    src.stop(now + 0.34);
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

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1450, now);
    bp.frequency.exponentialRampToValueAtTime(2450, now + 0.11);
    bp.frequency.exponentialRampToValueAtTime(1550, now + 0.19);
    bp.Q.value = 1.9;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.09, now + 0.045);
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
    const vol = (0.007 + Math.random() * 0.014) * this.currentRainLevel;
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
    // Irritated cat temporarily stops purring!
    const calmFactor = Math.max(0, 1 - annoyance * 1.5);
    // Gentle cozy idle purr (0.20) when sound is on; blooms warmly up to 1.0 when petted!
    this.targetIntensity = (0.20 + contentment * 0.80) * calmFactor;
    const smoothRate = this.targetIntensity > this.currentIntensity ? 2.6 : 1.0;
    this.currentIntensity += (this.targetIntensity - this.currentIntensity) * Math.min(1, dt * smoothRate);
    this.currentSpeed += (strokeSpeed - this.currentSpeed) * Math.min(1, dt * 5.0);

    this.currentRainLevel += (this.targetRainLevel - this.currentRainLevel) * Math.min(1, dt * 2.2);

    if (!this.initialized || !this.enabled || !this.ctx || !this.purrGain) return;
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(this.currentRainLevel * 0.26, now, 0.12);
      if (this.currentRainLevel > 0.2) {
        this.dropletTimer -= dt;
        if (this.dropletTimer <= 0) {
          this.playRainDroplet();
          this.dropletTimer = 0.18 + Math.random() * 0.55;
        }
      }
    }

    // Real recorded cat purr volume & warmth envelope
    const purrLevel = this.currentIntensity * (0.90 + this.currentSpeed * 0.18);
    this.purrGain.gain.setTargetAtTime(purrLevel, now, 0.08);

    // Subtle tonal warmth: deeper muffled rumble when idling, rich clear purr when actively petting!
    if (this.purrFilter) {
      const targetCutoff = 560 + this.currentIntensity * 2400 - isHeadZone * 180;
      this.purrFilter.frequency.setTargetAtTime(targetCutoff, now, 0.14);
    }
  }

  public dispose(): void {
    try {
      this.purrSource?.stop();
    } catch {
      // ignore
    }
    this.purrSource = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
