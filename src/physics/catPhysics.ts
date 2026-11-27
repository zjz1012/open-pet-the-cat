import type { CatTemperament } from '../creator/catCreator';

export type ToolMode = 'hand' | 'comb' | 'laser';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Furball {
  /** Position in stage UV (0..1) */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Visual radius in UV height units (0.015..0.036) */
  radius: number;
  /** RGB tint sampled from the breed that shed it */
  color: [number, number, number];
  /** Seed for fuzzy silhouette */
  seed: number;
}

export interface PhysicsEvents {
  /** Triggered when a bongo butt pat fires (value = combo count) */
  buttPatCombo: number;
  /** Triggered when cat purrs so happily it lets out a soft trill-meow */
  softMeow: boolean;
  /** Triggered when cat gets annoyed by against-grain rubbing / tail yanking */
  hissPushback: boolean;
  /** Triggered when grooming spawns a new shedding furball */
  furballSpawned: boolean;
  /** Triggered once when cat begins licking its own ruffled fur back smooth */
  startedSelfGroom: boolean;
  /** Triggered on each individual tongue lick stroke during self-grooming */
  lickStroke: boolean;
}

export interface CatPhysicsState {
  time: number;
  toolMode: ToolMode;
  breath: number;
  contentment: number;
  /** 0..1 feline irritability from rough against-grain rubbing / tail yanking */
  annoyance: number;
  /** 0..1 ruffled/bristled fur level ("炸毛") caused by combing/petting against the grain */
  ruffleLevel: number;
  /** 0..1 sudden feline dorsal skin twitch ripple */
  skinTwitch: number;
  /** Cat size scale 0.65..1.14 */
  catSize: number;
  /** Torso chonkiness scale 0.80..1.40 */
  torsoWidth: number;
  leftEarSquish: number;
  rightEarSquish: number;
  headPress: number;
  rumpLift: number;
  /** Whole-body position on cushion in stage UV (0..1) */
  catPos: Vec2;
  /** Whole-body heading in radians (0 = facing left; spins freely 360° chasing laser!) */
  catHeading: number;
  /** Flexible spine bend (-0.55..+0.55) curving naturally into turns */
  spineBend: number;
  /** Stalking/scampering stride phase & intensity (0..1) */
  walkPhase: number;
  walkAmp: number;
  /** 0 = relaxed oval pupils, 1 = huge dilated hunter pupils ("黑葡萄大眼") */
  pupilDilation: number;
  /** 0 = eyes wide open, 1 = happy squinted/closed eyes ("眯眯眼" / blinking) */
  eyeSquint: number;
  /** 0..1 front paws extending slightly when pouncing at laser */
  pawReach: number;
  /** Head yaw angle (radians) when tracking laser OR turning to groom shoulder */
  headYaw: number;
  /** Gentle head shift in cat-local coords during self-grooming lean */
  groomHeadShift: Vec2;
  /** Stage UV & strength of the cat's own grooming smoothing ruffled fur in SIM_FRAG */
  lickPos: Vec2;
  lickStrength: number;
  /** Forward crouch/pounce lunge when chasing laser dot (-0.02..+0.04) */
  pounceOffset: number;
  /** Active bongo butt-pat jelly ripple impulse */
  patPos: Vec2;
  patImpulse: number;
  /** Laser dot position in stage UV & visibility */
  laserPos: Vec2;
  laserVisible: number;
  /** Shedding furballs resting on the cushion (max 6) */
  furballs: Furball[];
  /** 13 smooth Catmull-Rom subdivided tail points */
  tailSpline: Vec2[];
  tailPoints: Vec2[];
  /** Pointer & hand/comb kinematics in stage UV */
  handPos: Vec2;
  handVel: Vec2;
  handAngle: number;
  handPress: number;
  handVisibility: number;
  isOverCat: boolean;
  isActivelyPetting: boolean;
  isHeadZone: number;
  strokeSpeed: number;
  autoPetting: boolean;
}

/**
 * Tactile Cat Behavior & Soft-Body Physics Engine (v2.0)
 *
 * - Real feline mood: gentle with-grain stroking -> deep contentment + occasional soft meow;
 *   rough against-grain rubbing / tail yanking -> dorsal skin twitch, airplane ears,
 *   rapid tail lash, and playful hiss pushback!
 * - Bongo butt-patting: quick taps on rump/back inject soft-body jelly bounce + elevator butt!
 * - Grooming comb: accumulates shedding progress and spawns interactive fuzzy furballs!
 * - Laser pointer chase: cat head & ears smoothly track the red dot + hunter crouch/pounce!
 */
export class CatPhysics {
  public readonly state: CatPhysicsState;

  private pointerActive = false;
  private pointerDown = false;
  private pointerTarget: Vec2 = { x: 0.52, y: 0.54 };
  private autoPetPhase = 0;
  private temperament: CatTemperament = 'normal';

  // Spring velocities
  private leftEarVel = 0;
  private rightEarVel = 0;
  private headPressVel = 0;
  private rumpLiftVel = 0;
  private handPressVel = 0;
  private headYawVel = 0;
  private pounceVel = 0;
  private headingVel = 0;
  private spineBendVel = 0;
  private catPosVel: Vec2 = { x: 0, y: 0 };
  private blinkTimer = 3.2;
  private blinkDur = 0;

  // Mood, twitch, hiss pushback, bongo-pat & self-grooming state
  private pushbackTimer = 0;
  private twitchPhase = 0;
  private patCombo = 0;
  private patComboTimer = 0;
  private happyStreak = 0;
  private pounceCooldown = 0;

  // Self-grooming (licking ruffled fur smooth!) & realistic feline tail state machine
  private idleSinceRuffle = 0;
  private isSelfGrooming = false;
  private groomSide = 1; // -1 = top flank, +1 = bottom flank
  private groomPhase = 0;
  private lastLickIdx = -1;
  private groomShiftVel: Vec2 = { x: 0, y: 0 };

  // Realistic feline tail moods:
  // 1) bristleLash: vigorous side-to-side tail lashes several times when ruffled, before self-grooming
  // 2) tailStiff: taut straight tail ("绷直") when butt-patted
  // 3) withGrainSway: soft gentle sway when stroked smoothly with the grain
  // 4) idleTail: calm rest with occasional random lazy sway or tip flick when untouched
  private bristleLashTimer = 0;
  private bristleLashPhase = 0;
  private bristleLashPending = false;
  private tailStiffTimer = 0;
  private tailStiff = 0;
  private withGrainSway = 0;
  private idleTailCooldown = 2.6;
  private idleTailTimer = 0;
  private idleTailDur = 1.6;
  private idleTailMode: 'sway' | 'tip' = 'sway';
  private idleTailDir = 1;

  // Grooming shedding accumulator
  private shedAccumulator = 0;

  private tailRest: Vec2[] = [
    { x: 0.195, y: -0.005 },
    { x: 0.305, y: 0.002 },
    { x: 0.395, y: 0.062 },
    { x: 0.405, y: 0.148 },
    { x: 0.335, y: 0.195 },
  ];
  /** Straightened taut tail pose for butt-patting ("拍屁股尾巴绷直") preserving segment lengths */
  private tailStraight: Vec2[] = [
    { x: 0.195, y: -0.005 },
    { x: 0.305, y: -0.010 },
    { x: 0.413, y: -0.016 },
    { x: 0.499, y: -0.022 },
    { x: 0.583, y: -0.026 },
  ];
  private tailVel: Vec2[] = this.tailRest.map(() => ({ x: 0, y: 0 }));

  constructor() {
    const initialPts = this.tailRest.map((p) => ({ ...p }));
    this.state = {
      time: 0,
      toolMode: 'hand',
      breath: 0,
      contentment: 0,
      annoyance: 0,
      ruffleLevel: 0,
      skinTwitch: 0,
      catSize: 1.0,
      torsoWidth: 1.0,
      leftEarSquish: 0,
      rightEarSquish: 0,
      headPress: 0,
      rumpLift: 0,
      catPos: { x: 0.525, y: 0.545 },
      catHeading: 0,
      spineBend: 0,
      walkPhase: 0,
      walkAmp: 0,
      pupilDilation: 0.68,
      eyeSquint: 0.72,
      pawReach: 0,
      headYaw: 0,
      groomHeadShift: { x: 0, y: 0 },
      lickPos: { x: 0.45, y: 0.54 },
      lickStrength: 0,
      pounceOffset: 0,
      patPos: { x: 0.62, y: 0.54 },
      patImpulse: 0,
      laserPos: { x: 0.28, y: 0.54 },
      laserVisible: 0,
      furballs: [],
      tailSpline: this.sampleCatmullRom(initialPts, 13),
      tailPoints: initialPts,
      handPos: { x: 0.52, y: 0.56 },
      handVel: { x: 0, y: 0 },
      handAngle: 0,
      handPress: 0,
      handVisibility: 0,
      isOverCat: false,
      isActivelyPetting: false,
      isHeadZone: 0,
      strokeSpeed: 0,
      autoPetting: false,
    };
  }

  private sampleCatmullRom(ctrl: Vec2[], outCount: number): Vec2[] {
    const n = ctrl.length;
    const out: Vec2[] = [];
    for (let k = 0; k < outCount; k++) {
      const u = (k / (outCount - 1)) * (n - 1);
      const seg = Math.min(n - 2, Math.floor(u));
      const t = u - seg;

      const p0 = ctrl[Math.max(0, seg - 1)];
      const p1 = ctrl[seg];
      const p2 = ctrl[Math.min(n - 1, seg + 1)];
      const p3 = ctrl[Math.min(n - 1, seg + 2)];

      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
    return out;
  }

  public setToolMode(mode: ToolMode): void {
    this.state.toolMode = mode;
    if (mode === 'laser') {
      this.state.autoPetting = false;
    }
  }

  public setTemperament(temp: CatTemperament): void {
    this.temperament = temp;
    if (temp === 'angel') {
      this.state.annoyance = 0;
    }
  }

  public clearFurballs(): void {
    this.state.furballs = [];
    this.shedAccumulator = 0;
  }

  public setProportions(sizeScale: number, widthScale: number): void {
    this.state.catSize = sizeScale;
    this.state.torsoWidth = widthScale;
  }

  public setPointer(u: number, v: number, active: boolean, down: boolean): void {
    this.pointerTarget.x = Math.max(0.02, Math.min(0.98, u));
    this.pointerTarget.y = Math.max(0.02, Math.min(0.98, v));
    this.pointerActive = active;
    this.pointerDown = down;
    if (active && down && (this.state.toolMode === 'hand' || this.state.toolMode === 'comb')) {
      this.state.autoPetting = false;
    }
  }

  public setPointerLeave(): void {
    this.pointerActive = false;
    this.pointerDown = false;
  }

  public toggleAutoPet(): boolean {
    if (this.state.toolMode === 'laser') {
      this.state.toolMode = 'hand';
    }
    this.state.autoPetting = !this.state.autoPetting;
    return this.state.autoPetting;
  }

  public triggerSingleStroke(): void {
    this.state.autoPetting = true;
  }

  /** Trigger a bouncy bongo butt-pat at stage UV (u, v) if over the cat's back/rump */
  public triggerTap(u: number, v: number, aspect: number): number {
    if (this.state.toolMode !== 'hand') return 0;
    const local = this.stageToCatLocal(u, v, aspect);
    const hit = this.hitTestCat(local);
    if (hit.zone === 'rump' || hit.zone === 'back') {
      this.patCombo = this.patComboTimer > 0 ? Math.min(12, this.patCombo + 1) : 1;
      this.patComboTimer = 1.25;
      this.state.patPos.x = u;
      this.state.patPos.y = v;
      this.state.patImpulse = 1.0;
      this.rumpLiftVel += hit.zone === 'rump' ? 5.2 : 2.8;
      this.state.contentment = Math.min(1, this.state.contentment + 0.16);
      // Butt-patting makes the cat's tail straighten tautly ("绷直")!
      this.tailStiffTimer = Math.min(2.2, 1.35 + this.patCombo * 0.12);
      this.bristleLashTimer = 0;
      this.tailVel[1].x += 0.35;
      this.tailVel[2].x += 0.55;
      this.tailVel[3].y -= 0.45;
      return this.patCombo;
    }
    return 0;
  }

  public stageToCatLocal(u: number, v: number, aspect: number): Vec2 {
    const s = Math.max(0.55, this.state.catSize) * 1.08;
    const dx = ((u - this.state.catPos.x) * aspect) / s;
    const dy = (v - this.state.catPos.y) / s;
    const c = Math.cos(-this.state.catHeading);
    const sn = Math.sin(-this.state.catHeading);
    return {
      x: c * dx - sn * dy,
      y: sn * dx + c * dy,
    };
  }

  public catLocalToStage(local: Vec2, aspect: number): Vec2 {
    const s = Math.max(0.55, this.state.catSize) * 1.08;
    const c = Math.cos(this.state.catHeading);
    const sn = Math.sin(this.state.catHeading);
    const rx = c * local.x - sn * local.y;
    const ry = sn * local.x + c * local.y;
    return {
      x: this.state.catPos.x + (rx * s) / Math.max(0.1, aspect),
      y: this.state.catPos.y + ry * s,
    };
  }

  public hitTestCat(local: Vec2): { inside: boolean; zone: 'none' | 'head' | 'back' | 'rump' | 'tail' } {
    const w = this.state.torsoWidth;
    const hx = (local.x + 0.305) / 0.145;
    const hy = (local.y + 0.01) / 0.135;
    if (hx * hx + hy * hy <= 1.25) {
      return { inside: true, zone: 'head' };
    }

    const tx = Math.max(-0.22, Math.min(0.205, local.x));
    const dx = local.x - tx;
    const dy = local.y / (0.145 * (0.35 + 0.65 * w));
    if ((dx * dx) / (0.15 * 0.15) + dy * dy <= 1.35) {
      if (local.x > 0.06) return { inside: true, zone: 'rump' };
      return { inside: true, zone: 'back' };
    }

    const tp = this.state.tailPoints;
    for (let i = 0; i < tp.length - 1; i++) {
      if (this.distToSegment(local, tp[i], tp[i + 1]) < 0.085) {
        return { inside: true, zone: 'tail' };
      }
    }

    return { inside: false, zone: 'none' };
  }

  private distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy + 1e-6;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  }

  public step(
    dt: number,
    aspect: number,
    furLength: number,
    breedColor: [number, number, number],
  ): PhysicsEvents {
    const clampedDt = Math.min(dt, 0.05);
    const st = this.state;
    st.time += clampedDt;

    const events: PhysicsEvents = {
      buttPatCombo: 0,
      softMeow: false,
      hissPushback: false,
      furballSpawned: false,
      startedSelfGroom: false,
      lickStroke: false,
    };

    // Decay transient impulse timers
    if (this.patComboTimer > 0) this.patComboTimer = Math.max(0, this.patComboTimer - clampedDt);
    st.patImpulse *= Math.exp(-clampedDt * 18.0);
    if (this.pushbackTimer > 0) this.pushbackTimer = Math.max(0, this.pushbackTimer - clampedDt);
    if (this.pounceCooldown > 0) this.pounceCooldown = Math.max(0, this.pounceCooldown - clampedDt);

    // 1) Organic asymmetric breathing
    const breathFreq = 0.25 - st.contentment * 0.03 + st.annoyance * 0.08;
    const rawBreath = 0.5 + 0.5 * Math.sin(st.time * Math.PI * 2 * breathFreq);
    st.breath = Math.pow(rawBreath, 1.35) * (0.72 + 0.28 * st.contentment);

    // 2) Pointer & Tool Kinematics
    const isTactileTool = st.toolMode === 'hand' || st.toolMode === 'comb';
    const isLaserTool = st.toolMode === 'laser';

    let targetU = this.pointerTarget.x;
    let targetV = this.pointerTarget.y;
    let activeNow = this.pointerActive;
    let pressingNow = this.pointerDown;

    if (st.autoPetting && isTactileTool) {
      this.autoPetPhase += clampedDt * 1.45;
      const sweep = Math.sin(this.autoPetPhase);
      const lift = Math.cos(this.autoPetPhase);
      const s = st.catSize;
      targetU = 0.51 + sweep * 0.20 * s;
      targetV = 0.535 - 0.025 * Math.sin(this.autoPetPhase * 2) * s;
      activeNow = true;
      pressingNow = lift > -0.35;
    }

    // Playful hiss pushback gently nudges the hand away briefly
    if (this.pushbackTimer > 0 && isTactileTool) {
      targetV = Math.min(0.95, targetV + 0.14 * (this.pushbackTimer / 0.55));
      pressingNow = false;
    }

    const prevX = st.handPos.x;
    const prevY = st.handPos.y;
    const followK = 1 - Math.exp(-22 * clampedDt);
    st.handPos.x += (targetU - st.handPos.x) * followK;
    st.handPos.y += (targetV - st.handPos.y) * followK;

    const rawVx = (st.handPos.x - prevX) / Math.max(clampedDt, 0.001);
    const rawVy = (st.handPos.y - prevY) / Math.max(clampedDt, 0.001);
    const velSmooth = 1 - Math.exp(-14 * clampedDt);
    st.handVel.x += (rawVx - st.handVel.x) * velSmooth;
    st.handVel.y += (rawVy - st.handVel.y) * velSmooth;

    const localHand = this.stageToCatLocal(st.handPos.x, st.handPos.y, aspect);
    const hit = this.hitTestCat(localHand);
    st.isOverCat = isTactileTool && activeNow && hit.inside;

    // Show hand/comb when over cat or pushing furballs
    const nearFurball =
      isTactileTool &&
      activeNow &&
      st.furballs.some((fb) => Math.hypot((fb.x - st.handPos.x) * aspect, fb.y - st.handPos.y) < 0.14);

    const wantVisible =
      isTactileTool && activeNow && (hit.inside || pressingNow || nearFurball) ? 1.0 : 0.0;
    const visRate = wantVisible > st.handVisibility ? 13.0 : 8.5;
    st.handVisibility += (wantVisible - st.handVisibility) * Math.min(1, clampedDt * visRate);

    const pivotX = 0.56;
    const pivotY = 1.24;
    // Hand pivots naturally from bottom edge; Wooden Comb stays aligned upright perpendicular to cat's spine!
    const targetAngle =
      st.toolMode === 'comb'
        ? Math.max(-0.14, Math.min(0.14, st.handVel.y * 0.18))
        : Math.atan2(st.handPos.x - pivotX, pivotY - st.handPos.y) * 0.72;
    st.handAngle += (targetAngle - st.handAngle) * Math.min(1, clampedDt * 12);

    const speedMag = Math.hypot(st.handVel.x, st.handVel.y);
    const grazing = st.isOverCat ? Math.min(0.45, 0.16 + speedMag * 0.25) : 0;
    const targetPress = st.isOverCat ? (pressingNow ? 1.0 : grazing) : 0.0;
    const pressForce = (targetPress - st.handPress) * 165 - this.handPressVel * 19;
    this.handPressVel += pressForce * clampedDt;
    st.handPress = Math.max(0, Math.min(1.15, st.handPress + this.handPressVel * clampedDt));

    const normSpeed = Math.min(1.0, speedMag * 0.75);
    st.strokeSpeed += ((st.isOverCat ? normSpeed : 0) - st.strokeSpeed) * Math.min(1, clampedDt * 7);

    // 3) Feline Mood, Against-Grain Bristling ("炸毛") & Self-Grooming Licking!
    const isActivelyPetting = st.isOverCat && (st.handPress > 0.25 || speedMag > 0.06);
    st.isActivelyPetting = isActivelyPetting;
    // Natural torso fur grows left -> right (+X).
    // Combing or rubbing right -> left (-X) is AGAINST the grain -> bristles fur (炸毛)!
    const againstGrainComb =
      isActivelyPetting &&
      st.toolMode === 'comb' &&
      (hit.zone === 'back' || hit.zone === 'rump') &&
      st.handVel.x < -0.14 &&
      st.handPress > 0.35;
    const againstGrainHand =
      isActivelyPetting &&
      st.toolMode === 'hand' &&
      (hit.zone === 'back' || hit.zone === 'rump') &&
      st.handVel.x < -0.26 &&
      st.handPress > 0.50;
    const againstGrainStroke = againstGrainComb || againstGrainHand;
    const withGrainStroke =
      isActivelyPetting &&
      (hit.zone === 'back' || hit.zone === 'rump') &&
      st.handVel.x > 0.14 &&
      st.handPress > 0.35;
    const tailYank =
      isActivelyPetting && hit.zone === 'tail' && speedMag > 0.35 && st.handPress > 0.55;

    // Interrupt self-grooming immediately if user touches the cat or turns on the laser
    if (isActivelyPetting || st.laserVisible > 0.25) {
      this.isSelfGrooming = false;
      this.idleSinceRuffle = 0;
    }

    // Build or smooth fur ruffle level ("炸毛")
    if (againstGrainStroke && furLength > 0.05) {
      const ruffleRate = againstGrainComb ? 1.35 : 0.78;
      st.ruffleLevel = Math.min(1.0, st.ruffleLevel + clampedDt * ruffleRate);
      this.groomSide = localHand.y >= 0 ? 1 : -1;
      this.idleSinceRuffle = 0;
      this.tailStiffTimer = 0;
      // Trigger vigorous side-to-side tail lashes when bristled!
      this.bristleLashTimer = Math.max(this.bristleLashTimer, 1.55);
      this.bristleLashPending = true;
    } else if (withGrainStroke) {
      // Combing or stroking WITH the grain also smooths ruffled fur!
      st.ruffleLevel = Math.max(0, st.ruffleLevel - clampedDt * (st.toolMode === 'comb' ? 1.4 : 0.7));
      if (st.ruffleLevel < 0.2) this.bristleLashPending = false;
    }

    if ((againstGrainStroke || tailYank) && this.temperament !== 'angel') {
      const spicyMul = this.temperament === 'spicy' ? 1.75 : 1.0;
      const rageRate = (tailYank ? 0.85 : againstGrainComb ? 0.72 : 0.58) * spicyMul;
      st.annoyance = Math.min(1.0, st.annoyance + clampedDt * rageRate);
      if (tailYank) {
        this.bristleLashTimer = Math.max(this.bristleLashTimer, 1.35);
      }
      if (st.annoyance > 0.24 && this.twitchPhase <= 0) {
        this.twitchPhase = 1.0;
      }
      if (st.annoyance >= 0.92 && this.pushbackTimer <= 0) {
        this.pushbackTimer = 0.55;
        st.annoyance = 0.62;
        this.bristleLashTimer = Math.max(this.bristleLashTimer, 1.75);
        events.hissPushback = true;
      }
    } else {
      const calmRate = this.temperament === 'angel' ? 1.6 : isActivelyPetting ? 0.28 : 0.45;
      st.annoyance = Math.max(0, st.annoyance - clampedDt * calmRate);
    }

    // Feline sequence after bristling: FIRST whip tail vigorously side-to-side several times,
    // THEN curl head down to self-groom & smooth the ruffled fur!
    if (!isActivelyPetting && st.laserVisible < 0.2 && st.ruffleLevel > 0.24) {
      if (this.bristleLashPending) {
        this.bristleLashPending = false;
        this.bristleLashTimer = Math.max(this.bristleLashTimer, 1.65);
      }
      this.idleSinceRuffle += clampedDt;
      if (!this.isSelfGrooming && this.bristleLashTimer <= 0.12 && this.idleSinceRuffle > 0.45) {
        this.isSelfGrooming = true;
        this.groomPhase = 0;
        this.lastLickIdx = -1;
        events.startedSelfGroom = true;
      }
    }

    // Step self-grooming animation: realistic top-down head turn & rhythmic shoulder-licking bob!
    // Keeps head smoothly attached to neck with BOTH ears visible (no anatomical distortion!)
    let targetGroomYaw = 0;
    let targetGroomShiftX = 0;
    let targetGroomShiftY = 0;
    st.lickStrength = 0;

    if (this.isSelfGrooming) {
      this.groomPhase += clampedDt * 1.48; // ~0.68s per natural rhythmic lick
      const lickIdx = Math.floor(this.groomPhase);
      const frac = this.groomPhase - lickIdx;
      const lickWave = Math.sin(Math.min(1, frac / 0.65) * Math.PI);
      const isLickingNow = frac < 0.65;

      if (isLickingNow && lickIdx !== this.lastLickIdx) {
        this.lastLickIdx = lickIdx;
        events.lickStroke = true;
      }

      // Natural overhead turn (~38°-52°) + gentle lean toward shoulder/flank — anatomically clean!
      const side = this.groomSide;
      targetGroomYaw = side * (0.64 + lickWave * 0.22);
      targetGroomShiftX = 0.018 + lickWave * 0.014;
      targetGroomShiftY = side * (0.026 + lickWave * 0.014);

      // Smooth ruffled fur progressively across back/shoulders as the cat grooms itself
      const lickLocal: Vec2 = {
        x: -0.14 + frac * 0.28,
        y: side * (0.03 + 0.02 * Math.sin(frac * 3.14)),
      };
      const lickStage = this.catLocalToStage(lickLocal, aspect);
      st.lickPos.x = lickStage.x;
      st.lickPos.y = lickStage.y;
      st.lickStrength = isLickingNow ? lickWave : 0;

      if (isLickingNow) {
        st.ruffleLevel = Math.max(0, st.ruffleLevel - clampedDt * 0.42);
      }
      if (st.ruffleLevel <= 0.02 && frac > 0.72) {
        st.ruffleLevel = 0;
        this.isSelfGrooming = false;
      }
    } else if (!againstGrainStroke && st.ruffleLevel > 0) {
      st.ruffleLevel = Math.max(0, st.ruffleLevel - clampedDt * 0.05);
    }

    this.groomShiftVel.x += ((targetGroomShiftX - st.groomHeadShift.x) * 48 - this.groomShiftVel.x * 9.5) * clampedDt;
    this.groomShiftVel.y += ((targetGroomShiftY - st.groomHeadShift.y) * 48 - this.groomShiftVel.y * 9.5) * clampedDt;
    st.groomHeadShift.x += this.groomShiftVel.x * clampedDt;
    st.groomHeadShift.y += this.groomShiftVel.y * clampedDt;

    // Crisp damped high-frequency dorsal skin twitch envelope
    if (this.twitchPhase > 0) {
      this.twitchPhase = Math.max(0, this.twitchPhase - clampedDt * 3.4);
      st.skinTwitch = Math.sin(this.twitchPhase * Math.PI * 5.0) * this.twitchPhase;
    } else {
      st.skinTwitch = 0;
    }

    const happyNow = isActivelyPetting && st.annoyance < 0.25;
    const targetContent = happyNow ? 1.0 : 0.0;
    const contentRate = happyNow ? 0.55 : 0.16;
    st.contentment += (targetContent - st.contentment) * Math.min(1, clampedDt * contentRate);

    // Occasional soft content trill-meow after prolonged gentle petting
    if (happyNow && st.contentment > 0.82 && normSpeed > 0.08) {
      this.happyStreak += clampedDt;
      if (this.happyStreak > 5.5) {
        this.happyStreak = 0;
        events.softMeow = true;
      }
    } else {
      this.happyStreak = Math.max(0, this.happyStreak - clampedDt * 0.5);
    }

    // 4) Grooming Comb -> Shedding Furballs!
    if (
      st.toolMode === 'comb' &&
      st.isOverCat &&
      st.handPress > 0.45 &&
      speedMag > 0.10 &&
      furLength > 0.08
    ) {
      // Longer-haired cats shed much faster!
      const shedRate = (0.14 + furLength * 0.65) * Math.min(1.5, speedMag);
      this.shedAccumulator += clampedDt * shedRate;
      if (this.shedAccumulator >= 1.0) {
        this.shedAccumulator = 0;
        this.spawnFurball(st.handPos, aspect, furLength, breedColor);
        events.furballSpawned = true;
      }
    }

    // Update interactive furballs on cushion (pushable by hand or comb!)
    for (const fb of st.furballs) {
      if (isTactileTool && activeNow) {
        const dx = (fb.x - st.handPos.x) * aspect;
        const dy = fb.y - st.handPos.y;
        const d = Math.hypot(dx, dy);
        const pushR = fb.radius + 0.055;
        if (d < pushR && d > 0.001) {
          const push = (1 - d / pushR) * 0.85;
          fb.vx += ((dx / d) * push + st.handVel.x * 0.35) * clampedDt * 10;
          fb.vy += ((dy / d) * push + st.handVel.y * 0.35) * clampedDt * 10;
        }
      }
      fb.x += fb.vx * clampedDt;
      fb.y += fb.vy * clampedDt;
      const drag = Math.exp(-clampedDt * 6.5);
      fb.vx *= drag;
      fb.vy *= drag;
      // Keep inside cushion frame softly
      fb.x = Math.max(0.06, Math.min(0.94, fb.x));
      fb.y = Math.max(0.10, Math.min(0.92, fb.y));
    }

    // 5) Whole-Body 360° Laser Chasing, Spinning in Circles, Pouncing & Returning to Cushion Center!
    const wantLaser = isLaserTool && activeNow ? 1.0 : 0.0;
    st.laserVisible += (wantLaser - st.laserVisible) * Math.min(1, clampedDt * 16);
    if (isLaserTool && activeNow) {
      const jitterX = Math.sin(st.time * 27.3) * 0.0022 + Math.cos(st.time * 41.7) * 0.0015;
      const jitterY = Math.cos(st.time * 31.1) * 0.0022 + Math.sin(st.time * 37.9) * 0.0015;
      st.laserPos.x += (targetU + jitterX - st.laserPos.x) * Math.min(1, clampedDt * 24);
      st.laserPos.y += (targetV + jitterY - st.laserPos.y) * Math.min(1, clampedDt * 24);
    }

    let targetYaw = 0;
    let targetPounce = 0;
    let targetSpineBend = 0;
    let targetPawReach = 0;
    let isChasing = false;

    const restPosX = 0.525;
    const restPosY = 0.545;

    if (st.laserVisible > 0.25) {
      isChasing = true;
      // Vector from cat center to red laser dot in aspect-corrected stage space
      const worldDx = (st.laserPos.x - st.catPos.x) * aspect;
      const worldDy = st.laserPos.y - st.catPos.y;
      const worldDist = Math.hypot(worldDx, worldDy);

      // Desired heading so the cat's head (-X in local space) points right at the laser!
      const desiredHeading = Math.atan2(-worldDy, -worldDx);
      // Shortest signed angular delta in [-PI, PI] so spinning around the cat rotates smoothly 360°!
      let angleDiff = desiredHeading - st.catHeading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Head leads the turn eagerly!
      targetYaw = Math.max(-0.58, Math.min(0.58, angleDiff * 0.85));
      // Spine curves organically into the turn while spinning in circles!
      targetSpineBend = Math.max(-0.48, Math.min(0.48, angleDiff * 0.45));

      // Whole body spins smoothly toward the red dot (faster when dot orbits around the cat!)
      const turnGain = worldDist > 0.06 ? 26.0 : 12.0;
      this.headingVel += (angleDiff * turnGain - this.headingVel * 6.8) * clampedDt;
      st.catHeading += this.headingVel * clampedDt;

      // Scamper / prowl forward toward the laser dot when it's outside paw reach!
      const stopDist = 0.24 * st.catSize;
      if (worldDist > stopDist && Math.abs(angleDiff) < 1.25) {
        const forwardSpeed = Math.min(0.48, (worldDist - stopDist) * 1.45) * Math.max(0.25, Math.cos(angleDiff));
        const dirX = worldDx / (worldDist + 1e-4);
        const dirY = worldDy / (worldDist + 1e-4);
        const targetVx = (dirX * forwardSpeed) / Math.max(0.5, aspect);
        const targetVy = dirY * forwardSpeed;
        this.catPosVel.x += (targetVx - this.catPosVel.x) * Math.min(1, clampedDt * 8.0);
        this.catPosVel.y += (targetVy - this.catPosVel.y) * Math.min(1, clampedDt * 8.0);
      } else {
        this.catPosVel.x *= Math.exp(-clampedDt * 9.0);
        this.catPosVel.y *= Math.exp(-clampedDt * 9.0);
      }

      // Playful pounce & front paw bat when dot gets close in front of nose!
      if (worldDist < 0.34 * st.catSize && Math.abs(angleDiff) < 0.72) {
        targetPawReach = 0.55;
        if (this.pounceCooldown <= 0 && (this.pointerDown || worldDist < 0.23 * st.catSize)) {
          this.pounceVel += 0.68;
          this.pounceCooldown = 0.95;
        } else {
          targetPounce = -0.014;
        }
      }
    } else {
      // Gently walk & rotate back to cozy horizontal resting position on the sunlit cushion
      let restAngleDiff = 0 - st.catHeading;
      while (restAngleDiff > Math.PI) restAngleDiff -= Math.PI * 2;
      while (restAngleDiff < -Math.PI) restAngleDiff += Math.PI * 2;

      this.headingVel += (restAngleDiff * 11.0 - this.headingVel * 5.8) * clampedDt;
      st.catHeading += this.headingVel * clampedDt;
      targetSpineBend = Math.max(-0.32, Math.min(0.32, restAngleDiff * 0.25));

      const toRestX = restPosX - st.catPos.x;
      const toRestY = restPosY - st.catPos.y;
      this.catPosVel.x += (toRestX * 3.8 - this.catPosVel.x * 5.5) * clampedDt;
      this.catPosVel.y += (toRestY * 3.8 - this.catPosVel.y * 5.5) * clampedDt;
    }

    // Apply bounded cushion movement so the cat stays comfortably inside the cushion
    st.catPos.x = Math.max(0.26, Math.min(0.76, st.catPos.x + this.catPosVel.x * clampedDt));
    st.catPos.y = Math.max(0.28, Math.min(0.76, st.catPos.y + this.catPosVel.y * clampedDt));

    const moveSpeed = Math.hypot(this.catPosVel.x * aspect, this.catPosVel.y) + Math.abs(this.headingVel) * 0.14;
    const targetWalkAmp = Math.min(1.0, moveSpeed * 2.4);
    st.walkAmp += (targetWalkAmp - st.walkAmp) * Math.min(1, clampedDt * 8.0);
    st.walkPhase += clampedDt * (5.0 + st.walkAmp * 9.5);

    this.spineBendVel += ((targetSpineBend - st.spineBend) * 42 - this.spineBendVel * 8.2) * clampedDt;
    st.spineBend = Math.max(-0.58, Math.min(0.58, st.spineBend + this.spineBendVel * clampedDt));

    // Dynamic Eye Expressions:
    // - Resting / being petted: cozy sleepy half-lidded / happy closed eyes (zero uncanny stare!)
    // - Chasing laser dot: wakes up wide with big round adorable dark hunter pupils!
    this.blinkTimer -= clampedDt;
    if (this.blinkTimer <= 0 && !isChasing) {
      this.blinkDur = 0.20;
      this.blinkTimer = 3.5 + Math.random() * 4.0;
    }
    if (this.blinkDur > 0) this.blinkDur = Math.max(0, this.blinkDur - clampedDt);
    const blinkVal = this.blinkDur > 0 ? Math.sin((this.blinkDur / 0.20) * Math.PI) : 0;

    const targetDilation = isChasing ? 0.94 : 0.68;
    st.pupilDilation += (targetDilation - st.pupilDilation) * Math.min(1, clampedDt * 7.0);

    // Cozy relaxed sleepy expression by default (0.68), closes gently to happy crescent when petted (0.96),
    // and opens wide & cute (0.08) when chasing the laser pointer!
    const targetSquint = isChasing
      ? 0.08
      : Math.max(blinkVal, this.isSelfGrooming ? 0.94 : 0.66 + st.contentment * 0.32);
    st.eyeSquint += (targetSquint - st.eyeSquint) * Math.min(1, clampedDt * 10.0);

    const effPaw = Math.max(targetPawReach, Math.max(0, st.pounceOffset * 18.0));
    st.pawReach += (effPaw - st.pawReach) * Math.min(1, clampedDt * 10.0);

    const finalTargetYaw = this.isSelfGrooming ? targetGroomYaw : targetYaw;
    const yawLimit = this.isSelfGrooming ? 0.95 : 0.65;
    this.headYawVel += ((finalTargetYaw - st.headYaw) * 58 - this.headYawVel * 9.5) * clampedDt;
    st.headYaw = Math.max(-yawLimit, Math.min(yawLimit, st.headYaw + this.headYawVel * clampedDt));

    this.pounceVel += ((targetPounce - st.pounceOffset) * 75 - this.pounceVel * 10.5) * clampedDt;
    st.pounceOffset = Math.max(-0.025, Math.min(0.055, st.pounceOffset + this.pounceVel * clampedDt));

    // 6) Head & Independent Ear Squish / Alert Airplane Ears
    const headDist = Math.hypot(localHand.x + 0.305, localHand.y + 0.01);
    const headInfluence = st.isOverCat ? Math.max(0, 1 - headDist / 0.24) * st.handPress : 0;
    st.isHeadZone += (headInfluence - st.isHeadZone) * Math.min(1, clampedDt * 6);

    const leftEarDist = Math.hypot(localHand.x + 0.32, localHand.y + 0.10);
    const rightEarDist = Math.hypot(localHand.x + 0.32, localHand.y - 0.08);

    const airplaneBias = st.annoyance * 0.78;
    const laserAlert = st.laserVisible > 0.3 ? -0.18 : 0; // ears perk forward when spotting laser!

    const targetLeftEar =
      (st.isOverCat
        ? Math.min(1, Math.max(0, 1 - leftEarDist / 0.20) * st.handPress * 1.15 + headInfluence * 0.45)
        : 0) +
      airplaneBias +
      laserAlert;
    const targetRightEar =
      (st.isOverCat
        ? Math.min(1, Math.max(0, 1 - rightEarDist / 0.20) * st.handPress * 1.15 + headInfluence * 0.45)
        : 0) +
      airplaneBias +
      laserAlert;

    this.leftEarVel += ((targetLeftEar - st.leftEarSquish) * 90 - this.leftEarVel * 11) * clampedDt;
    st.leftEarSquish = Math.max(-0.22, Math.min(1.18, st.leftEarSquish + this.leftEarVel * clampedDt));

    this.rightEarVel += ((targetRightEar - st.rightEarSquish) * 90 - this.rightEarVel * 11) * clampedDt;
    st.rightEarSquish = Math.max(-0.22, Math.min(1.18, st.rightEarSquish + this.rightEarVel * clampedDt));

    this.headPressVel += ((headInfluence - st.headPress) * 85 - this.headPressVel * 12) * clampedDt;
    st.headPress = Math.max(0, Math.min(1.0, st.headPress + this.headPressVel * clampedDt));

    // 7) Rump "Elevator Butt" lift (boosted by stroking lower back OR rhythmic bongo patting!)
    const rumpDist = Math.hypot(localHand.x - 0.15, localHand.y);
    const patLift = this.patComboTimer > 0 ? Math.min(0.95, 0.30 + this.patCombo * 0.11) : 0;
    const targetRump = Math.max(
      st.isOverCat ? Math.max(0, 1 - rumpDist / 0.22) * st.handPress : 0,
      patLift,
    );
    this.rumpLiftVel += ((targetRump - st.rumpLift) * 58 - this.rumpLiftVel * 9.0) * clampedDt;
    st.rumpLift = Math.max(0, Math.min(1.2, st.rumpLift + this.rumpLiftVel * clampedDt));

    // 8) Realistic Feline Tail State Machine:
    //    a) Butt-patting -> tail stiffens & straightens tautly ("绷直")
    //    b) Bristling ("炸毛") -> vigorous side-to-side tail lashes several times before grooming
    //    c) Smooth with-grain petting -> gentle slight rhythmic sway
    //    d) Completely untouched -> mostly still with occasional random lazy sway or tip flick
    if (this.tailStiffTimer > 0) {
      this.tailStiffTimer = Math.max(0, this.tailStiffTimer - clampedDt);
    }
    const targetStiff = this.tailStiffTimer > 0 ? 1.0 : 0.0;
    const stiffRate = targetStiff > this.tailStiff ? 11.0 : 2.6;
    this.tailStiff += (targetStiff - this.tailStiff) * Math.min(1, clampedDt * stiffRate);

    if (this.bristleLashTimer > 0) {
      this.bristleLashTimer = Math.max(0, this.bristleLashTimer - clampedDt);
      this.bristleLashPhase += clampedDt * 11.8; // ~2 full side-to-side whips per second (3-4 strong lashes)
    }
    const lashEnv = Math.min(1.0, this.bristleLashTimer / 0.45);
    const lashStrength = Math.max(lashEnv, st.annoyance * 0.92) * (1 - this.tailStiff);

    const smoothPetNow = isActivelyPetting && !againstGrainStroke && !tailYank && this.tailStiff < 0.35;
    this.withGrainSway += ((smoothPetNow ? 1.0 : 0.0) - this.withGrainSway) * Math.min(1, clampedDt * 3.5);

    const hunterBoost = st.laserVisible > 0.3 ? 1.0 : 0.0;
    const isUntouchedIdle =
      !isActivelyPetting &&
      this.tailStiff < 0.08 &&
      lashStrength < 0.08 &&
      hunterBoost < 0.1 &&
      !this.isSelfGrooming;

    // Occasional random gentle sway or tip twitch when completely untouched
    let idleWave = 0;
    let idleTipOnly = 0;
    if (isUntouchedIdle) {
      if (this.idleTailTimer > 0) {
        this.idleTailTimer = Math.max(0, this.idleTailTimer - clampedDt);
        const progress = 1 - this.idleTailTimer / Math.max(0.1, this.idleTailDur);
        const env = Math.sin(progress * Math.PI);
        if (this.idleTailMode === 'sway') {
          idleWave = Math.sin(progress * Math.PI * 2.0) * env * 0.026 * this.idleTailDir;
        } else {
          idleTipOnly = Math.sin(progress * Math.PI * 2.5) * env * 0.028 * this.idleTailDir;
        }
      } else {
        this.idleTailCooldown -= clampedDt;
        if (this.idleTailCooldown <= 0) {
          this.idleTailMode = Math.random() < 0.52 ? 'tip' : 'sway';
          this.idleTailDur = this.idleTailMode === 'tip' ? 0.55 + Math.random() * 0.30 : 1.65 + Math.random() * 0.75;
          this.idleTailTimer = this.idleTailDur;
          this.idleTailDir = Math.random() < 0.5 ? 1 : -1;
          this.idleTailCooldown = 2.6 + Math.random() * 3.8;
        }
      }
    } else {
      this.idleTailTimer = 0;
    }

    for (let i = 0; i < this.tailRest.length; i++) {
      const rest = this.tailRest[i];
      const straight = this.tailStraight[i];
      const pt = st.tailPoints[i];
      const vel = this.tailVel[i];

      if (i === 0) {
        pt.x = rest.x;
        pt.y = rest.y - st.rumpLift * 0.014;
        continue;
      }

      const frac = i / (this.tailRest.length - 1);

      // Base posture: interpolate relaxed curl -> straight taut tail when butt-patted ("绷直")
      // Or straighten slightly outward during angry side-to-side lashing so swings sweep dramatically!
      const stretchMix = Math.max(this.tailStiff, lashStrength * 0.62);
      const baseX = rest.x + (straight.x - rest.x) * stretchMix;
      const baseY = rest.y + (straight.y - rest.y) * stretchMix;

      // 1) Vigorous angry side-to-side lash during 炸毛
      const lashWave = Math.sin(this.bristleLashPhase - frac * 1.65) * 0.155 * lashStrength * frac;
      // 2) Gentle slight sway during smooth with-grain petting
      const petWave = Math.sin(st.time * 1.85 - frac * 1.7) * 0.020 * this.withGrainSway * frac;
      // 3) Subtle taut quiver at tip when butt-patted ("绷直")
      const stiffQuiver = Math.sin(st.time * 26.0 - frac * 2.0) * 0.005 * this.tailStiff * frac * frac;
      // 4) Excited hunter tip twitch during laser chase
      const hunterWave = Math.sin(st.time * 5.2 - frac * 2.1) * 0.036 * hunterBoost * frac * frac;
      // 5) Rare random idle sway / tiny tip twitch when completely untouched
      const idleDisp = idleWave * frac + idleTipOnly * frac * frac;

      const goalX = baseX + Math.cos(st.time * 0.6 + frac) * 0.0025 * frac;
      const goalY = baseY + lashWave + petWave + stiffQuiver + hunterWave + idleDisp;

      let pushX = 0;
      let pushY = 0;
      if (st.isOverCat && st.handPress > 0.12) {
        const dx = pt.x - localHand.x;
        const dy = pt.y - localHand.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.16) {
          const inf = (1 - d / 0.16) * st.handPress;
          pushX += st.handVel.x * inf * 0.22 + (dx / (d + 0.02)) * inf * 0.04;
          pushY += st.handVel.y * inf * 0.22 + (dy / (d + 0.02)) * inf * 0.04;
        }
      }

      const k = 30 - frac * 10 + this.tailStiff * 46 + lashStrength * 34;
      const damp = 6.6 - frac * 1.1 + this.tailStiff * 3.8;
      vel.x += ((goalX - pt.x) * k + pushX * 28 - vel.x * damp) * clampedDt;
      vel.y += ((goalY - pt.y) * k + pushY * 28 - vel.y * damp) * clampedDt;

      pt.x += vel.x * clampedDt;
      pt.y += vel.y * clampedDt;

      const prev = st.tailPoints[i - 1];
      const restLen = Math.hypot(
        this.tailRest[i].x - this.tailRest[i - 1].x,
        this.tailRest[i].y - this.tailRest[i - 1].y,
      );
      const segDx = pt.x - prev.x;
      const segDy = pt.y - prev.y;
      const segLen = Math.hypot(segDx, segDy) + 1e-6;
      pt.x = prev.x + (segDx / segLen) * restLen;
      pt.y = prev.y + (segDy / segLen) * restLen;
    }

    st.tailSpline = this.sampleCatmullRom(st.tailPoints, 13);
    return events;
  }

  private spawnFurball(
    nearPos: Vec2,
    aspect: number,
    furLength: number,
    color: [number, number, number],
  ): void {
    const st = this.state;
    // Pop off gently toward the lower or upper cushion beside the cat
    const side = Math.random() > 0.35 ? 1 : -1;
    const x = Math.max(0.14, Math.min(0.86, nearPos.x + (Math.random() - 0.5) * 0.08));
    const y = Math.max(0.18, Math.min(0.86, 0.545 + side * (0.20 + Math.random() * 0.07)));
    const radius = 0.017 + furLength * 0.013 + Math.random() * 0.005;

    // If already at max 6 furballs, grow the nearest one slightly instead of cluttering!
    if (st.furballs.length >= 6) {
      const oldest = st.furballs.shift()!;
      oldest.x = x;
      oldest.y = y;
      oldest.vx = (Math.random() - 0.5) * 0.14 / Math.max(0.8, aspect);
      oldest.vy = side * (0.14 + Math.random() * 0.08);
      oldest.radius = Math.min(0.036, radius * 1.15);
      oldest.color = [...color];
      st.furballs.push(oldest);
      return;
    }

    st.furballs.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.14 / Math.max(0.8, aspect),
      vy: side * (0.16 + Math.random() * 0.08),
      radius,
      color: [...color],
      seed: Math.random() * 100,
    });
  }
}
