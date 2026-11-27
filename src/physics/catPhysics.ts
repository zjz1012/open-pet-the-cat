export interface Vec2 {
  x: number;
  y: number;
}

export interface CatPhysicsState {
  time: number;
  /** 0..1 gentle ribcage expansion */
  breath: number;
  /** 0..1 overall contentment (drives deeper purr & subtle tail tip wag) */
  contentment: number;
  /** Cat size scale 0.65..1.14 */
  catSize: number;
  /** Torso chonkiness scale 0.80..1.40 */
  torsoWidth: number;
  /** 0..1 left ear flatten/squish */
  leftEarSquish: number;
  /** 0..1 right ear flatten/squish */
  rightEarSquish: number;
  /** 0..1 head gentle downward press */
  headPress: number;
  /** 0..1 lower-back/rump "elevator butt" lift */
  rumpLift: number;
  /** 13 smooth Catmull-Rom subdivided tail points in cat-local space */
  tailSpline: Vec2[];
  /** 5 articulated tail control points in cat-local space */
  tailPoints: Vec2[];
  /** Pointer & hand state in stage UV (0..1, y=0 top, y=1 bottom) */
  handPos: Vec2;
  handVel: Vec2;
  handAngle: number;
  handPress: number;
  handVisibility: number;
  isOverCat: boolean;
  isHeadZone: number;
  strokeSpeed: number;
  /** Auto-petting keyboard mode (Space / Enter) */
  autoPetting: boolean;
}

/**
 * Spring-damper physics for tactile petting:
 * - Hand follow & press kinematics
 * - Independent left/right ear squishing when stroking head
 * - Rump "elevator butt" lift when stroking lower back
 * - 5-point articulated tail chain reacting to rump/tail petting & contentment
 * - Organic breathing & auto-petting keyboard loop
 */
export class CatPhysics {
  public readonly state: CatPhysicsState;

  private pointerActive = false;
  private pointerDown = false;
  private pointerTarget: Vec2 = { x: 0.45, y: 0.50 };
  private autoPetPhase = 0;

  // Spring velocities
  private leftEarVel = 0;
  private rightEarVel = 0;
  private headPressVel = 0;
  private rumpLiftVel = 0;
  private handPressVel = 0;

  // Tail spring nodes (in cat-local space, origin at torso center, aspect-corrected)
  // Cat faces LEFT (head around x=-0.31, rump around x=+0.20, tail gracefully curves rightward & down-left)
  private tailRest: Vec2[] = [
    { x: 0.195, y: -0.005 },
    { x: 0.305, y: 0.002 },
    { x: 0.395, y: 0.062 },
    { x: 0.405, y: 0.148 },
    { x: 0.335, y: 0.195 },
  ];
  private tailVel: Vec2[] = this.tailRest.map(() => ({ x: 0, y: 0 }));

  constructor() {
    const initialPts = this.tailRest.map((p) => ({ ...p }));
    this.state = {
      time: 0,
      breath: 0,
      contentment: 0,
      catSize: 1.0,
      torsoWidth: 1.0,
      leftEarSquish: 0,
      rightEarSquish: 0,
      headPress: 0,
      rumpLift: 0,
      tailSpline: this.sampleCatmullRom(initialPts, 13),
      tailPoints: initialPts,
      handPos: { x: 0.52, y: 0.56 },
      handVel: { x: 0, y: 0 },
      handAngle: 0,
      handPress: 0,
      handVisibility: 0,
      isOverCat: false,
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

  public setProportions(sizeScale: number, widthScale: number): void {
    this.state.catSize = sizeScale;
    this.state.torsoWidth = widthScale;
  }

  public setPointer(u: number, v: number, active: boolean, down: boolean): void {
    this.pointerTarget.x = Math.max(0.02, Math.min(0.98, u));
    this.pointerTarget.y = Math.max(0.02, Math.min(0.98, v));
    this.pointerActive = active;
    this.pointerDown = down;
    if (active && down) {
      this.state.autoPetting = false;
    }
  }

  public setPointerLeave(): void {
    this.pointerActive = false;
    this.pointerDown = false;
  }

  public toggleAutoPet(): boolean {
    this.state.autoPetting = !this.state.autoPetting;
    return this.state.autoPetting;
  }

  public triggerSingleStroke(): void {
    this.state.autoPetting = true;
  }

  /**
   * Convert stage UV (0..1, 0..1) into cat-local coordinates where
   * (0, 0) is center of the cat's torso, x is right, y is down.
   */
  public stageToCatLocal(u: number, v: number, aspect: number): Vec2 {
    const centerX = 0.525;
    const centerY = 0.545;
    const s = Math.max(0.55, this.state.catSize);
    return {
      x: ((u - centerX) * aspect) / (s * 1.08),
      y: (v - centerY) / (s * 1.08),
    };
  }

  /** Approximate hit-test for whether the hand is over the cat's body/head/tail */
  public hitTestCat(local: Vec2): { inside: boolean; zone: 'none' | 'head' | 'back' | 'rump' | 'tail' } {
    const w = this.state.torsoWidth;
    // Head ellipse around (-0.33, -0.02)
    const hx = (local.x + 0.33) / 0.145;
    const hy = (local.y + 0.015) / 0.135;
    if (hx * hx + hy * hy <= 1.25) {
      return { inside: true, zone: 'head' };
    }

    // Torso capsule from x=-0.24 to x=+0.22, scaled in y by torsoWidth
    const tx = Math.max(-0.24, Math.min(0.22, local.x));
    const dx = local.x - tx;
    const dy = (local.y - 0.0) / (0.145 * (0.35 + 0.65 * w));
    if (dx * dx / (0.15 * 0.15) + dy * dy <= 1.35) {
      if (local.x > 0.08) return { inside: true, zone: 'rump' };
      return { inside: true, zone: 'back' };
    }

    // Tail spline proximity
    const tp = this.state.tailPoints;
    for (let i = 0; i < tp.length - 1; i++) {
      const d = this.distToSegment(local, tp[i], tp[i + 1]);
      if (d < 0.085) {
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
    const px = a.x + vx * t;
    const py = a.y + vy * t;
    return Math.hypot(p.x - px, p.y - py);
  }

  public step(dt: number, aspect: number): void {
    const clampedDt = Math.min(dt, 0.05);
    const st = this.state;
    st.time += clampedDt;

    // 1) Organic asymmetric breathing (slower & deeper when content)
    const breathFreq = 0.25 - st.contentment * 0.03;
    const rawBreath = 0.5 + 0.5 * Math.sin(st.time * Math.PI * 2 * breathFreq);
    st.breath = Math.pow(rawBreath, 1.35) * (0.72 + 0.28 * st.contentment);

    // 2) Target hand position (either live pointer or gentle keyboard auto-petting)
    let targetU = this.pointerTarget.x;
    let targetV = this.pointerTarget.y;
    let activeNow = this.pointerActive;
    let pressingNow = this.pointerDown;

    if (st.autoPetting) {
      this.autoPetPhase += clampedDt * 1.45;
      // Smooth front-to-back petting stroke from head to rump and curving gently back
      const sweep = Math.sin(this.autoPetPhase);
      const lift = Math.cos(this.autoPetPhase);
      const s = st.catSize;
      targetU = 0.51 + sweep * 0.20 * s;
      targetV = 0.535 - 0.025 * Math.sin(this.autoPetPhase * 2) * s;
      activeNow = true;
      pressingNow = lift > -0.35;
    }

    // Smooth hand motion with subtle natural damping
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
    st.isOverCat = activeNow && hit.inside;

    // Show hand gracefully when over cat (or actively pressing/auto-petting)
    const wantVisible = activeNow && (hit.inside || pressingNow) ? 1.0 : 0.0;
    const visRate = wantVisible > st.handVisibility ? 13.0 : 8.0;
    st.handVisibility += (wantVisible - st.handVisibility) * Math.min(1, clampedDt * visRate);

    // Pivot angle from bottom-center-right edge like a person sitting beside the cushion
    const pivotX = 0.56;
    const pivotY = 1.24;
    const targetAngle = Math.atan2(st.handPos.x - pivotX, pivotY - st.handPos.y) * 0.72;
    st.handAngle += (targetAngle - st.handAngle) * Math.min(1, clampedDt * 12);

    // Tactile press depth: hovering over cat softly grazes fur (0.28), pressing sinks in (1.0)
    const speedMag = Math.hypot(st.handVel.x, st.handVel.y);
    const grazing = st.isOverCat ? Math.min(0.45, 0.16 + speedMag * 0.25) : 0;
    const targetPress = st.isOverCat ? (pressingNow ? 1.0 : grazing) : 0.0;
    const pressForce = (targetPress - st.handPress) * 165 - this.handPressVel * 19;
    this.handPressVel += pressForce * clampedDt;
    st.handPress = Math.max(0, Math.min(1.15, st.handPress + this.handPressVel * clampedDt));

    const normSpeed = Math.min(1.0, speedMag * 0.75);
    st.strokeSpeed += ((st.isOverCat ? normSpeed : 0) - st.strokeSpeed) * Math.min(1, clampedDt * 7);

    // 3) Contentment rises while petting & slowly lingers after stopping
    const isActivelyPetting = st.isOverCat && (st.handPress > 0.25 || speedMag > 0.06);
    const targetContent = isActivelyPetting ? 1.0 : 0.0;
    const contentRate = isActivelyPetting ? 0.55 : 0.16;
    st.contentment += (targetContent - st.contentment) * Math.min(1, clampedDt * contentRate);

    // 4) Head & Independent Ear Squish Physics
    const headDist = Math.hypot(localHand.x + 0.33, localHand.y + 0.015);
    const headInfluence = st.isOverCat ? Math.max(0, 1 - headDist / 0.24) * st.handPress : 0;
    st.isHeadZone += (headInfluence - st.isHeadZone) * Math.min(1, clampedDt * 6);

    // Left ear (top side, y < 0) vs Right ear (bottom side, y > 0)
    const leftEarDist = Math.hypot(localHand.x + 0.34, localHand.y + 0.105);
    const rightEarDist = Math.hypot(localHand.x + 0.34, localHand.y - 0.075);

    const targetLeftEar = st.isOverCat
      ? Math.min(1, Math.max(0, 1 - leftEarDist / 0.20) * st.handPress * 1.15 + headInfluence * 0.45)
      : 0;
    const targetRightEar = st.isOverCat
      ? Math.min(1, Math.max(0, 1 - rightEarDist / 0.20) * st.handPress * 1.15 + headInfluence * 0.45)
      : 0;

    // Spring-damper for soft squishy ears
    this.leftEarVel += ((targetLeftEar - st.leftEarSquish) * 90 - this.leftEarVel * 11) * clampedDt;
    st.leftEarSquish = Math.max(-0.08, Math.min(1.15, st.leftEarSquish + this.leftEarVel * clampedDt));

    this.rightEarVel += ((targetRightEar - st.rightEarSquish) * 90 - this.rightEarVel * 11) * clampedDt;
    st.rightEarSquish = Math.max(-0.08, Math.min(1.15, st.rightEarSquish + this.rightEarVel * clampedDt));

    this.headPressVel += ((headInfluence - st.headPress) * 85 - this.headPressVel * 12) * clampedDt;
    st.headPress = Math.max(0, Math.min(1.0, st.headPress + this.headPressVel * clampedDt));

    // 5) Rump "Elevator Butt" lift when stroking lower back / tail root
    const rumpDist = Math.hypot(localHand.x - 0.16, localHand.y);
    const targetRump = st.isOverCat ? Math.max(0, 1 - rumpDist / 0.22) * st.handPress : 0;
    this.rumpLiftVel += ((targetRump - st.rumpLift) * 55 - this.rumpLiftVel * 9.5) * clampedDt;
    st.rumpLift = Math.max(0, Math.min(1.0, st.rumpLift + this.rumpLiftVel * clampedDt));

    // 6) Articulated Tail Physics (content slow sway + interactive curl/deflection)
    const wagFreq = 1.05 + st.contentment * 0.55;
    const wagAmp = 0.012 + st.contentment * 0.026 + st.rumpLift * 0.032;

    for (let i = 0; i < this.tailRest.length; i++) {
      const rest = this.tailRest[i];
      const pt = st.tailPoints[i];
      const vel = this.tailVel[i];

      if (i === 0) {
        // Root stays attached to rump
        pt.x = rest.x;
        pt.y = rest.y - st.rumpLift * 0.012;
        continue;
      }

      const frac = i / (this.tailRest.length - 1);
      // Graceful slow curl & wave along the tail
      const wave = Math.sin(st.time * wagFreq - frac * 1.9) * wagAmp * frac;
      const curlTight = st.rumpLift * 0.035 * frac;
      const goalX = rest.x - curlTight * 0.9 + Math.cos(st.time * 0.7 + frac) * 0.008 * frac;
      const goalY = rest.y + wave - st.rumpLift * 0.028 * frac;

      // Direct hand push on tail segments
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

      const k = 32 - frac * 12;
      const damp = 6.2 - frac * 1.2;
      vel.x += ((goalX - pt.x) * k + pushX * 28 - vel.x * damp) * clampedDt;
      vel.y += ((goalY - pt.y) * k + pushY * 28 - vel.y * damp) * clampedDt;

      pt.x += vel.x * clampedDt;
      pt.y += vel.y * clampedDt;

      // Preserve segment length so tail never stretches unnaturally
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

    // Recompute ultra-smooth 13-point Catmull-Rom spline for rendering (zero polygonal facets!)
    st.tailSpline = this.sampleCatmullRom(st.tailPoints, 13);
  }
}
