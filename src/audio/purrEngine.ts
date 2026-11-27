/**
 * Procedural Web Audio API Cat Purring Engine
 *
 * Real cat purring is generated during both inhalation and exhalation via
 * ~22–28 Hz laryngeal muscle contractions modulating soft respiratory airflow
 * and low chest-cavity formant resonances.
 *
 * Zero audio asset downloads, zero licensing concerns, continuous organic
 * response to petting speed, pressure, and breed resonance.
 */
export class PurrEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private purrEnvGain: GainNode | null = null;
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
      this.masterGain.gain.setTargetAtTime(next ? 0.85 : 0.0, now, 0.18);
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
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    // Master output with gentle warmth lowpass
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    const finalWarmth = ctx.createBiquadFilter();
    finalWarmth.type = 'lowpass';
    finalWarmth.frequency.value = 460;
    finalWarmth.Q.value = 0.7;

    // Envelope controlled every frame by breath cycle + petting pleasure
    const purrEnvGain = ctx.createGain();
    purrEnvGain.gain.value = 0;

    // 1) Low throaty fundamental + 2nd harmonic
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

    // Organic slight pitch flutter (0.35 Hz LFO)
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

    // 2) Glottal-modulated filtered brown/pink breath noise (gives authentic fur/throat rattle)
    const noiseBuffer = this.createBrownNoiseBuffer(ctx, 3.0);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 175;
    noiseFilter.Q.value = 1.1;

    // Amplitude-modulate the breath noise at the purr frequency (~25 Hz)
    const noiseModGain = ctx.createGain();
    noiseModGain.gain.value = 0.48;

    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = this.baseHz;

    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.44;
    pulseOsc.connect(pulseDepth);
    pulseDepth.connect(noiseModGain.gain);

    // Subtle soft higher-frequency fur/breath airiness
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
    masterGain.connect(ctx.destination);

    baseOsc.start();
    subHarmonicOsc.start();
    flutterLfo.start();
    pulseOsc.start();
    noiseSource.start();

    this.masterGain = masterGain;
    this.purrEnvGain = purrEnvGain;
    this.baseOsc = baseOsc;
    this.subHarmonicOsc = subHarmonicOsc;
    this.pulseOsc = pulseOsc;
    this.noiseFilter = noiseFilter;
    this.chestFilter = chestFilter;
    this.initialized = true;
  }

  private createBrownNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = Math.max(-1, Math.min(1, last * 4.2));
    }
    // Crossfade end into start for seamless looping
    const fade = Math.min(2048, Math.floor(length * 0.05));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[length - fade + i] = data[length - fade + i] * (1 - t) + data[i] * t;
    }
    return buffer;
  }

  /**
   * Call once per animation frame.
   * @param dt Delta time in seconds
   * @param contentment 0..1 petting pleasure level
   * @param strokeSpeed 0..1 normalized hand stroking speed
   * @param isHeadZone 0..1 whether petting head/ears/chin (extra deep purr)
   */
  public update(dt: number, contentment: number, strokeSpeed: number, isHeadZone: number): void {
    // Advance dual-phase respiratory purr cycle (~2.8s per full inhale+exhale)
    const cycleSpeed = 0.34 + contentment * 0.05;
    this.breathPhase = (this.breathPhase + dt * cycleSpeed) % 1.0;

    // Gentle idle purr when sound is on (soft sleeping rumble), rises richly when petted
    this.targetIntensity = 0.14 + contentment * 0.86;
    const smoothRate = this.targetIntensity > this.currentIntensity ? 2.4 : 0.75;
    this.currentIntensity += (this.targetIntensity - this.currentIntensity) * Math.min(1, dt * smoothRate);
    this.currentSpeed += (strokeSpeed - this.currentSpeed) * Math.min(1, dt * 5.0);

    if (!this.initialized || !this.enabled || !this.ctx || !this.purrEnvGain) return;
    if (this.ctx.state !== 'running') return;

    // Shape inhale (0..0.46) and exhale (0.50..0.96) with natural soft pauses between phases
    let breathEnv = 0;
    let isInhale = true;
    if (this.breathPhase < 0.46) {
      const p = this.breathPhase / 0.46;
      breathEnv = Math.sin(p * Math.PI);
      breathEnv = Math.pow(breathEnv, 0.72);
      isInhale = true;
    } else if (this.breathPhase > 0.50 && this.breathPhase < 0.96) {
      const p = (this.breathPhase - 0.50) / 0.46;
      breathEnv = Math.sin(p * Math.PI);
      breathEnv = Math.pow(breathEnv, 0.85) * 0.84;
      isInhale = false;
    } else {
      breathEnv = 0.06;
    }

    const now = this.ctx.currentTime;
    const envLevel = this.currentIntensity * (0.12 + 0.88 * breathEnv) * (0.88 + this.currentSpeed * 0.22);
    this.purrEnvGain.gain.setTargetAtTime(envLevel, now, 0.04);

    // Subtle tonal difference between inhale and exhale + head-petting warmth
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
