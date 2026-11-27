export type PurrVoiceId = 'warm' | 'deep' | 'soft';
export type PurrVoicePreference = 'auto' | PurrVoiceId;

const PURR_VOICE_URLS: Record<PurrVoiceId, string> = {
  warm: './assets/cat-purr-warm.mp3',
  deep: './assets/cat-purr-deep.mp3',
  soft: './assets/cat-purr-soft.mp3',
};

/**
 * Multi-Voice Real-Sampled Cat Purring + Ambience Engine (v2.4)
 *
 * Includes 3 distinct real cat purring recordings:
 *  - `warm`: Cozy close-mic domestic cat purr (Public Domain)
 *  - `deep`: Deep resonant big-cat rumble (CC BY-SA 3.0)
 *  - `soft`: Ultra-gentle sleepy whisper purr (CC BY-SA 4.0)
 *
 * Features gentle default volume (~40%), smooth crossfading when switching voices/breeds,
 * and sample-accurate PCM crossfade looping (zero MP3 gap/click).
 */
export class PurrEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private purrBusGain: GainNode | null = null;
  private purrFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;

  private readonly voiceBuffers = new Map<PurrVoiceId, AudioBuffer>();
  private readonly voiceLoading = new Map<PurrVoiceId, Promise<void>>();
  private activeVoiceId: PurrVoiceId = 'warm';
  private activeSource: AudioBufferSourceNode | null = null;
  private activeVoiceGain: GainNode | null = null;

  private enabled = false;
  private initialized = false;
  private userVolume = 0.40; // Gentle, comfortable default volume (0..1)
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

  public getVolume(): number {
    return this.userVolume;
  }

  public setVolume(vol: number): void {
    this.userVolume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && this.enabled) {
      // Soft perceptual volume curve (max 0.65 so even 100% stays warm & never harsh)
      const gain = Math.pow(this.userVolume, 1.35) * 0.65;
      this.masterGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.08);
    }
  }

  public setPurrVoice(voice: PurrVoiceId): void {
    if (this.activeVoiceId === voice && this.activeSource) return;
    this.activeVoiceId = voice;
    if (this.initialized && this.enabled) {
      void this.activateVoice(voice);
    }
  }

  public setBreedPurrHz(hz: number): void {
    this.baseHz = hz;
    if (this.ctx && this.activeSource) {
      const rate = Math.max(0.88, Math.min(1.12, hz / 25.0));
      this.activeSource.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.25);
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
      void this.activateVoice(this.activeVoiceId);
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      const target = next ? Math.pow(this.userVolume, 1.35) * 0.65 : 0.0;
      this.masterGain.gain.setTargetAtTime(target, now, 0.22);
    }
  }

  public unlock(): void {
    if (!this.enabled) return;
    this.ensureInitialized();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    void this.activateVoice(this.activeVoiceId);
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

    // ----- 1) Real Multi-Voice Cat Purr Bus -----
    const purrFilter = ctx.createBiquadFilter();
    purrFilter.type = 'lowpass';
    purrFilter.frequency.value = 850;
    purrFilter.Q.value = 0.55;

    const purrBusGain = ctx.createGain();
    purrBusGain.gain.value = 0;

    purrFilter.connect(purrBusGain);
    purrBusGain.connect(masterGain);

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
    this.purrBusGain = purrBusGain;
    this.purrFilter = purrFilter;
    this.rainGain = rainGain;
    this.initialized = true;
  }

  private async loadVoiceBuffer(voice: PurrVoiceId): Promise<AudioBuffer | null> {
    if (this.voiceBuffers.has(voice)) return this.voiceBuffers.get(voice)!;
    if (!this.ctx) return null;

    let pending = this.voiceLoading.get(voice);
    if (!pending) {
      pending = (async () => {
        try {
          const resp = await fetch(PURR_VOICE_URLS[voice]);
          if (!resp.ok || !this.ctx) return;
          const arrayBuf = await resp.arrayBuffer();
          if (!this.ctx) return;
          const raw = await this.ctx.decodeAudioData(arrayBuf);
          this.voiceBuffers.set(voice, this.buildSeamlessLoopBuffer(this.ctx, raw));
        } catch (err) {
          console.warn(`Failed to load purr voice "${voice}":`, err);
        }
      })();
      this.voiceLoading.set(voice, pending);
    }
    await pending;
    return this.voiceBuffers.get(voice) ?? null;
  }

  private async activateVoice(voice: PurrVoiceId): Promise<void> {
    const buffer = await this.loadVoiceBuffer(voice);
    if (!buffer || !this.ctx || !this.purrFilter) return;
    // If user switched to another voice while this one was loading, skip starting stale voice
    if (this.activeVoiceId !== voice) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Smoothly fade out previous voice source (zero click!)
    const prevSource = this.activeSource;
    const prevGain = this.activeVoiceGain;
    if (prevSource && prevGain) {
      prevGain.gain.cancelScheduledValues(now);
      prevGain.gain.setValueAtTime(prevGain.gain.value, now);
      prevGain.gain.linearRampToValueAtTime(0, now + 0.38);
      window.setTimeout(() => {
        try {
          prevSource.stop();
          prevSource.disconnect();
          prevGain.disconnect();
        } catch {
          // ignore
        }
      }, 450);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = Math.max(0.88, Math.min(1.12, this.baseHz / 25.0));

    const vGain = ctx.createGain();
    vGain.gain.setValueAtTime(0.0001, now);
    vGain.gain.linearRampToValueAtTime(1.0, now + 0.38);

    src.connect(vGain);
    vGain.connect(this.purrFilter);
    src.start(0);

    this.activeSource = src;
    this.activeVoiceGain = vGain;
  }

  private buildSeamlessLoopBuffer(ctx: AudioContext, raw: AudioBuffer): AudioBuffer {
    const sr = raw.sampleRate;
    const trimStart = Math.min(Math.floor(sr * 0.20), Math.floor(raw.length * 0.1));
    const trimEnd = Math.min(Math.floor(sr * 0.20), Math.floor(raw.length * 0.1));
    const usableLen = Math.max(Math.floor(sr * 1.5), raw.length - trimStart - trimEnd);
    const fadeLen = Math.min(Math.floor(sr * 0.65), Math.floor(usableLen * 0.25));
    const outLen = usableLen - fadeLen;

    const out = ctx.createBuffer(raw.numberOfChannels, outLen, sr);
    for (let ch = 0; ch < raw.numberOfChannels; ch++) {
      const src = raw.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < outLen; i++) {
        dst[i] = src[trimStart + i];
      }
      for (let i = 0; i < fadeLen; i++) {
        const t = i / fadeLen;
        const fadeIn = Math.sin(t * Math.PI * 0.5);
        const fadeOut = Math.cos(t * Math.PI * 0.5);
        dst[i] = dst[i] * fadeIn + src[trimStart + outLen + i] * fadeOut;
      }
    }
    return out;
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
    thumpGain.gain.linearRampToValueAtTime(0.28, now + 0.009);
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

  public playSoftMeow(): void {
    // Kept silent — real purr swell conveys contentment naturally
  }

  public playHiss(): void {
    if (!this.enabled || !this.initialized || !this.ctx || !this.masterGain) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastHissTime < 1.8) return;
    this.lastHissTime = now;

    const ctx = this.ctx;
    const buf = this.createNoiseBuffer(ctx, 0.34, 'white');
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3100, now);
    bp.frequency.exponentialRampToValueAtTime(1900, now + 0.30);
    bp.Q.value = 1.6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.11, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

    src.connect(bp);
    bp.connect(env);
    env.connect(this.masterGain);

    src.start(now);
    src.stop(now + 0.32);
  }

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
    bp.frequency.exponentialRampToValueAtTime(2400, now + 0.11);
    bp.frequency.exponentialRampToValueAtTime(1550, now + 0.19);
    bp.Q.value = 1.9;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.085, now + 0.045);
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
    const calmFactor = Math.max(0, 1 - annoyance * 1.5);
    // Gentle cozy idle purr (0.28) rising smoothly to rich lap-cat purr (1.0) while petting
    this.targetIntensity = (0.28 + contentment * 0.72) * calmFactor;
    const smoothRate = this.targetIntensity > this.currentIntensity ? 2.6 : 1.0;
    this.currentIntensity += (this.targetIntensity - this.currentIntensity) * Math.min(1, dt * smoothRate);
    this.currentSpeed += (strokeSpeed - this.currentSpeed) * Math.min(1, dt * 5.0);

    this.currentRainLevel += (this.targetRainLevel - this.currentRainLevel) * Math.min(1, dt * 2.2);

    if (!this.initialized || !this.enabled || !this.ctx || !this.purrBusGain) return;
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(this.currentRainLevel * 0.34, now, 0.12);
      if (this.currentRainLevel > 0.2) {
        this.dropletTimer -= dt;
        if (this.dropletTimer <= 0) {
          this.playRainDroplet();
          this.dropletTimer = 0.18 + Math.random() * 0.55;
        }
      }
    }

    const purrLevel = this.currentIntensity * (0.85 + this.currentSpeed * 0.16);
    this.purrBusGain.gain.setTargetAtTime(purrLevel, now, 0.08);

    if (this.purrFilter) {
      const targetCutoff = 540 + this.currentIntensity * 2200 - isHeadZone * 160;
      this.purrFilter.frequency.setTargetAtTime(targetCutoff, now, 0.14);
    }
  }

  public dispose(): void {
    try {
      this.activeSource?.stop();
    } catch {
      // ignore
    }
    this.activeSource = null;
    this.activeVoiceGain = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
