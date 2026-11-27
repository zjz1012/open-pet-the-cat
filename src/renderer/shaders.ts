export const FULLSCREEN_VERT = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = vec2(pos.x, 1.0 - pos.y);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Ping-Pong Interactive Soft-Body, Bongo Butt-Pat Jelly & Comb-Groove Simulation Shader (v2.0)
 *   R: surface indentation depth (0 = neutral, 1 = deep press)
 *   G: indentation spring velocity (0.5 = 0)
 *   B: combed fur flow X (0.5 = 0)
 *   A: combed fur flow Y (0.5 = 0)
 */
export const SIM_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrevSim;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uAspect;
uniform vec2 uHandPos;
uniform vec2 uHandVel;
uniform float uHandAngle;
uniform float uHandPress;
uniform float uHandVisible;
uniform float uCatSize;
uniform int uToolMode; // 0=hand, 1=comb, 2=laser, 3=paint
uniform vec2 uPatPos;
uniform float uPatImpulse;

vec2 rot2d(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  vec4 prev = texture(uPrevSim, vUv);
  vec4 nL = texture(uPrevSim, vUv - vec2(uTexelSize.x, 0.0));
  vec4 nR = texture(uPrevSim, vUv + vec2(uTexelSize.x, 0.0));
  vec4 nT = texture(uPrevSim, vUv - vec2(0.0, uTexelSize.y));
  vec4 nB = texture(uPrevSim, vUv + vec2(0.0, uTexelSize.y));
  vec4 avg = 0.25 * (nL + nR + nT + nB);

  float indent = mix(prev.r, avg.r, min(0.32, uDt * 12.0));
  float vel = (prev.g - 0.5) * 2.0;
  // Comb grooves hold their crisp track longer with less diffusion!
  float flowDiff = uToolMode == 1 ? min(0.06, uDt * 2.0) : min(0.18, uDt * 4.0);
  vec2 flow = mix(prev.ba, avg.ba, flowDiff) * 2.0 - 1.0;

  // Hand or Wooden Pet Comb contact imprint
  vec2 d = vUv - uHandPos;
  d.x *= uAspect;
  vec2 hp = rot2d(d, -uHandAngle) / max(0.75, 0.85 + 0.15 * uCatSize);

  float contact = 0.0;
  float combToothWave = 0.0;
  if (uHandVisible > 0.01 && uHandPress > 0.01 && (uToolMode == 0 || uToolMode == 1)) {
    if (uToolMode == 0) {
      // 4 soft fingertips + gentle palm heel pad
      float f1 = exp(-dot((hp - vec2(-0.044, -0.042)) / vec2(0.024, 0.036), (hp - vec2(-0.044, -0.042)) / vec2(0.024, 0.036)));
      float f2 = exp(-dot((hp - vec2(-0.014, -0.058)) / vec2(0.024, 0.040), (hp - vec2(-0.014, -0.058)) / vec2(0.024, 0.040)));
      float f3 = exp(-dot((hp - vec2( 0.017, -0.050)) / vec2(0.024, 0.038), (hp - vec2( 0.017, -0.050)) / vec2(0.024, 0.038)));
      float f4 = exp(-dot((hp - vec2( 0.045, -0.030)) / vec2(0.022, 0.032), (hp - vec2( 0.045, -0.030)) / vec2(0.022, 0.032)));
      float palm = exp(-dot((hp - vec2(0.002, 0.022)) / vec2(0.068, 0.058), (hp - vec2(0.002, 0.022)) / vec2(0.068, 0.058))) * 0.72;
      contact = clamp(max(max(max(f1, f2), max(f3, f4)), palm) * uHandPress * uHandVisible, 0.0, 1.0);
    } else {
      // Wooden Pet Comb: crisp 9-tooth horizontal comb head leaving parallel fur grooves!
      float headMask = exp(-pow(hp.y / 0.026, 2.0)) * smoothstep(0.088, 0.068, abs(hp.x));
      float teeth = 0.5 + 0.5 * cos(hp.x * 360.0);
      combToothWave = sin(hp.x * 360.0) * headMask * uHandPress;
      contact = clamp(headMask * (0.45 + 0.55 * teeth) * uHandPress * uHandVisible, 0.0, 1.0);
    }
  }

  // Bongo Butt-Pat soft-body jelly ripple impulse!
  if (uPatImpulse > 0.01) {
    vec2 pd = vUv - uPatPos;
    pd.x *= uAspect;
    float r = length(pd);
    float jellyWave = exp(-r * r / 0.014) * cos(r * 34.0);
    vel += jellyWave * uPatImpulse * 4.2;
    contact = max(contact, exp(-r * r / 0.008) * uPatImpulse * 0.92);
  }

  // Spring-damper bounce (slightly bouncier during bongo pat!)
  float springAccel = (contact - indent) * 52.0 - vel * 12.5;
  vel += springAccel * uDt;
  indent = clamp(indent + vel * uDt, 0.0, 1.0);
  if (contact < 0.01 && uPatImpulse < 0.01) {
    indent *= exp(-uDt * 4.5);
  }

  // Fur combing vector
  float combMask = smoothstep(0.06, 0.45, contact);
  vec2 strokeVec = vec2(uHandVel.x * uAspect, uHandVel.y);
  float strokeMag = length(strokeVec);
  if (combMask > 0.001 && strokeMag > 0.012) {
    vec2 strokeDir = strokeVec / (strokeMag + 0.0001);
    vec2 strokePerp = vec2(-strokeDir.y, strokeDir.x);
    float strength = min(1.0, strokeMag * 0.95) * combMask;
    // Comb leaves crisp alternating tooth parting ridges perpendicular to the stroke!
    vec2 targetFlow = strokeDir * min(1.0, 0.60 + strokeMag * 0.55) + strokePerp * combToothWave * 0.72;
    flow = mix(flow, targetFlow, min(1.0, uDt * (uToolMode == 1 ? 26.0 : 18.0) * strength));
  }
  if (uToolMode == 0 && contact > 0.18) {
    vec2 radial = normalize(hp + vec2(0.0001));
    vec2 worldRadial = rot2d(radial, uHandAngle);
    flow = mix(flow, flow + worldRadial * 0.16, min(1.0, uDt * 2.8 * contact));
  }

  // Combed tracks linger gracefully longer than hand strokes
  float relaxRate = uToolMode == 1 ? 0.22 : 0.46;
  flow *= exp(-uDt * relaxRate);
  float flowLen = length(flow);
  if (flowLen > 1.0) flow /= flowLen;

  fragColor = vec4(
    clamp(indent, 0.0, 1.0),
    clamp(vel * 0.5 + 0.5, 0.0, 1.0),
    clamp(flow.x * 0.5 + 0.5, 0.0, 1.0),
    clamp(flow.y * 0.5 + 0.5, 0.0, 1.0)
  );
}
`;

/**
 * Photorealistic 2.5D Cat + Multi-Layer Fur Shell March + Rain/Day/Moonlight
 * + Custom 3D Fur-Painting + Wooden Comb + Shedding Furballs + Red Laser Dot (v2.0)
 */
export const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSimTex;
uniform sampler2D uNoiseTex;
uniform sampler2D uBgTex;
uniform sampler2D uHandTex;

uniform float uHasBgTex;
uniform float uHasHandTex;
uniform vec2 uBgAspectSize;
uniform vec2 uHandTexSize;

uniform float uTime;
uniform float uAspect;
uniform float uNight;
uniform float uRain;

// Cat proportions & live physics
uniform float uCatSize;
uniform float uTorsoWidth;
uniform float uBreath;
uniform float uLeftEarSquish;
uniform float uRightEarSquish;
uniform float uHeadPress;
uniform float uRumpLift;
uniform float uHeadYaw;
uniform float uPounceOffset;
uniform float uSkinTwitch;
uniform vec2 uTail[13];

// Breed coat & fur parameters
uniform int uPatternType;
uniform vec3 uPrimaryColor;
uniform vec3 uSecondaryColor;
uniform vec3 uTertiaryColor;
uniform vec3 uEarInnerColor;
uniform float uFurLength;
uniform float uFurClump;
uniform float uSheen;
uniform float uPatternSeed;
uniform float uTailFluff;
uniform float uRuffFluff;

// Tools, Laser & Furballs
uniform int uToolMode;
uniform vec2 uHandPos;
uniform float uHandAngle;
uniform float uHandPress;
uniform float uHandVisible;
uniform vec2 uLaserPos;
uniform float uLaserVisible;
uniform int uFurballCount;
uniform vec4 uFurballPos[6]; // xy = stage UV, z = radius, w = seed
uniform vec3 uFurballCol[6];

// ---------- Helpers ----------

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

vec2 rot2d(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b, out float segT, out vec2 segTan) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  segT = h;
  segTan = normalize(ba + vec2(1e-5, 0.0));
  return length(pa - ba * h);
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdEarTriangle(vec2 p, float w, float h) {
  p.x = abs(p.x);
  vec2 a = vec2(w, 0.0);
  vec2 b = vec2(0.0, h);
  vec2 pa = p - a;
  vec2 ba = b - a;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float dSide = length(pa - ba * t);
  float inside = (p.y > 0.0 && p.y < h && p.x < w * (1.0 - p.y / h)) ? -1.0 : 1.0;
  float dBase = p.y < 0.0 ? -p.y : 1e5;
  return inside < 0.0 ? -min(dSide, p.y) : min(dSide, max(dBase, p.x - w));
}

vec2 stageToCat(vec2 uv) {
  return vec2((uv.x - 0.525) * uAspect, uv.y - 0.545) / (uCatSize * 1.08);
}

float texNoise(vec2 p) {
  return texture(uNoiseTex, p).r;
}

float fbm2(vec2 p) {
  float n1 = texture(uNoiseTex, p * 0.34).a;
  float n2 = texture(uNoiseTex, p * 0.68 + vec2(0.37, 0.71)).b;
  return n1 * 0.76 + n2 * 0.24;
}

float sampleFurFiber(vec2 p, vec2 dir, float clump) {
  vec2 nDir = normalize(dir + vec2(1e-5, 0.0));
  vec2 perp = vec2(-nDir.y, nDir.x);

  vec2 baseUv = p * 2.65;
  float stepFine = 0.0085;
  float s0 = texture(uNoiseTex, baseUv - nDir * stepFine * 1.5).r;
  float s1 = texture(uNoiseTex, baseUv - nDir * stepFine * 0.5).r;
  float s2 = texture(uNoiseTex, baseUv + nDir * stepFine * 0.5).r;
  float s3 = texture(uNoiseTex, baseUv + nDir * stepFine * 1.5).r;
  float fine = (s0 + s1 + s2 + s3) * 0.25;

  float sideL = texture(uNoiseTex, baseUv + perp * 0.0045).g;
  float microStrand = clamp(fine * 1.25 - sideL * 0.22 + 0.08, 0.0, 1.0);

  vec2 clumpUv = p * 0.92;
  float c0 = texture(uNoiseTex, clumpUv - nDir * 0.018).b;
  float c1 = texture(uNoiseTex, clumpUv + nDir * 0.018).b;
  float c2 = texture(uNoiseTex, clumpUv + nDir * 0.042).a;
  float lock = (c0 + c1 + c2) * 0.333;

  return mix(microStrand, microStrand * 0.55 + lock * 0.55, clump);
}

// ---------- Parametric 2.5D Cat Anatomy (with Head Yaw, Pounce & Dorsal Skin Twitch!) ----------

struct CatGeom {
  float sdf;
  float height;
  vec2 flow;
  float headMask;
  float earMask;
  float earInner;
  float tailMask;
  float tailT;
  float ruffMask;
};

CatGeom evalCat(vec2 rawP) {
  CatGeom g;

  // Apply subtle forward hunter lunge/crouch when tracking laser dot
  vec2 p = rawP + vec2(uPounceOffset * smoothstep(0.24, -0.22, rawP.x), 0.0);

  // Subtle dorsal skin twitch shudder when rubbed roughly against the grain!
  if (abs(uSkinTwitch) > 0.002) {
    float twitchMask = exp(-pow((p.x - 0.01) / 0.16, 2.0));
    p.y += sin(p.x * 52.0 - uTime * 34.0) * uSkinTwitch * 0.009 * twitchMask;
  }

  // 1) Torso loaf shape
  float breathExpand = uBreath * 0.009 * exp(-pow((p.x + 0.02) / 0.14, 2.0));
  float torsoWeight = smoothstep(-0.29, -0.09, p.x) * smoothstep(0.29, 0.10, p.x);
  float widthFactor = mix(1.0, uTorsoWidth, torsoWeight) + breathExpand * 3.5;

  float spineProfile = 0.128 + 0.016 * sin((p.x + 0.14) * 7.2) - 0.012 * smoothstep(0.10, 0.23, p.x);
  float clampedX = clamp(p.x, -0.215, 0.195);
  vec2 torsoDelta = vec2(p.x - clampedX, (p.y - 0.002) / widthFactor);
  float dTorso = length(torsoDelta) - spineProfile;

  // 2) Head & cheeks rotated smoothly around neck pivot by uHeadYaw (tracks red laser!)
  vec2 neckPivot = vec2(-0.225, -0.008);
  vec2 pHeadSpace = rot2d(p - neckPivot, -uHeadYaw) + neckPivot;
  vec2 headCenter = vec2(-0.302, -0.010);
  vec2 hp = pHeadSpace - headCenter;

  float cheekW = 0.102 + 0.012 * smoothstep(-0.04, 0.05, hp.x);
  float dHead = length(vec2(hp.x / 1.08, hp.y / (cheekW / 0.102))) - 0.102;
  float dMuzzle = length((hp - vec2(-0.075, 0.002)) / vec2(0.055, 0.052)) - 0.65;
  dHead = smin(dHead, dMuzzle * 0.052, 0.028);

  float dBody = smin(dTorso, dHead, 0.048);

  // 3) Left & Right Ears (rotate with head yaw + react independently to squish/airplane/laser!)
  vec2 lEarBase = headCenter + vec2(-0.015 + uLeftEarSquish * 0.022, -0.068 - uLeftEarSquish * 0.014);
  float lAngle = 2.42 - uLeftEarSquish * 0.52;
  vec2 lLocal = rot2d(pHeadSpace - lEarBase, -lAngle);
  float lLen = 0.088 * (1.0 - max(0.0, uLeftEarSquish) * 0.12);
  float dLeftEar = sdEarTriangle(lLocal, 0.042, lLen) - 0.009;
  float lInner = smoothstep(0.006, -0.014, sdEarTriangle(lLocal - vec2(-0.007, 0.012), 0.022, lLen * 0.68));

  vec2 rEarBase = headCenter + vec2(-0.015 + uRightEarSquish * 0.022, 0.068 + uRightEarSquish * 0.014);
  float rAngle = 0.72 + uRightEarSquish * 0.52;
  vec2 rLocal = rot2d(pHeadSpace - rEarBase, -rAngle);
  float rLen = 0.088 * (1.0 - max(0.0, uRightEarSquish) * 0.12);
  float dRightEar = sdEarTriangle(rLocal, 0.042, rLen) - 0.009;
  float rInner = smoothstep(0.006, -0.014, sdEarTriangle(rLocal - vec2(0.007, 0.012), 0.022, rLen * 0.68));

  float dEars = min(dLeftEar, dRightEar);
  float dHeadAndEars = smin(dBody, dEars, 0.014);

  // 4) Smooth 13-Point Catmull-Rom Articulated Tail
  float dTail = 1e5;
  float bestTailT = 0.0;
  vec2 bestTailTan = vec2(1.0, 0.0);
  for (int i = 0; i < 12; i++) {
    float st;
    vec2 tanVec;
    float segD = sdSegment(p, uTail[i], uTail[i + 1], st, tanVec);
    float globalT = (float(i) + st) / 12.0;
    float baseR = mix(0.041, 0.029, pow(globalT, 0.85));
    float radius = baseR * (0.82 + 0.28 * uTailFluff);
    radius *= 1.0 + 0.22 * sin(globalT * 3.14159) * max(0.0, uTailFluff - 0.9);
    float sd = segD - radius;
    if (sd < dTail) {
      bestTailT = globalT;
      bestTailTan = tanVec;
    }
    dTail = smin(dTail, sd, 0.010);
  }

  g.sdf = smin(dHeadAndEars, dTail, 0.036);

  g.headMask = smoothstep(0.045, -0.055, dHead);
  g.earMask = smoothstep(0.015, -0.012, dEars);
  g.earInner = max(lInner, rInner) * g.earMask;
  g.tailMask = smoothstep(0.025, -0.022, dTail) * smoothstep(-0.02, 0.05, dTorso);
  g.ruffMask = exp(-pow((p.x + 0.22) / 0.085, 2.0)) * smoothstep(0.02, -0.04, dBody);

  // 5) Smooth Volumetric Dome Height
  float bodyEdge = clamp(-dTorso / (spineProfile * 0.98), 0.0, 1.0);
  float torsoH = pow(sin(bodyEdge * 1.570796), 0.62) * 0.92;
  torsoH *= 1.0 + 0.08 * smoothstep(-0.05, 0.14, p.x);
  torsoH += uBreath * 0.065 * exp(-pow((p.x + 0.02) / 0.14, 2.0)) * torsoH;
  torsoH += uRumpLift * 0.12 * exp(-pow((p.x - 0.14) / 0.11, 2.0)) * torsoH;
  torsoH += sin(p.x * 48.0 - uTime * 34.0) * uSkinTwitch * 0.045 * torsoH;

  float headEdge = clamp(-dHead / 0.108, 0.0, 1.0);
  float headH = pow(sin(headEdge * 1.570796), 0.60) * (0.87 - uHeadPress * 0.11);

  float earEdge = clamp(-dEars / 0.034, 0.0, 1.0);
  float earSquishAvg = dLeftEar < dRightEar ? uLeftEarSquish : uRightEarSquish;
  float earH = pow(earEdge, 0.65) * (0.50 - earSquishAvg * 0.18) - g.earInner * 0.14;

  float tailEdge = clamp(-dTail / (0.044 * max(0.7, uTailFluff)), 0.0, 1.0);
  float tailH = pow(sin(tailEdge * 1.570796), 0.65) * mix(0.46, 0.30, bestTailT);

  float mergedH = smax(torsoH, headH, 0.18);
  mergedH = smax(mergedH, tailH, 0.14);
  g.height = smax(mergedH, earH, 0.08);
  g.tailT = bestTailT;

  // 6) Natural Fur Flow Field
  vec2 headFlow = rot2d(normalize(pHeadSpace - (headCenter + vec2(-0.11, 0.0)) + vec2(1e-4, 0.0)), uHeadYaw);
  vec2 torsoFlow = normalize(vec2(1.0, (p.y / max(0.12, widthFactor)) * 0.62));
  vec2 lEarDir = rot2d(vec2(0.0, 1.0), lAngle + uHeadYaw);
  vec2 rEarDir = rot2d(vec2(0.0, 1.0), rAngle + uHeadYaw);
  vec2 earFlow = dLeftEar < dRightEar ? lEarDir : rEarDir;

  vec2 flow = mix(torsoFlow, headFlow, smoothstep(-0.18, -0.27, p.x));
  flow = mix(flow, earFlow, g.earMask * 0.85);
  flow = mix(flow, bestTailTan, g.tailMask * 0.92);
  g.flow = normalize(flow + vec2(1e-4, 0.0));

  return g;
}

// ---------- Coat Patterns + Custom 3D Fur-Root Paint Overlay ----------

vec3 evalCoatColor(vec2 p, CatGeom g) {
  float torsoWeight = smoothstep(-0.29, -0.09, p.x) * smoothstep(0.29, 0.10, p.x);
  float wF = mix(1.0, uTorsoWidth, torsoWeight);
  vec2 mp = vec2(p.x, p.y / wF);

  vec2 warp = vec2(
    fbm2(mp * 3.1 + vec2(uPatternSeed, 1.7)) - 0.5,
    fbm2(mp * 3.1 + vec2(4.2, uPatternSeed * 1.3)) - 0.5
  ) * 0.085;
  vec2 wp = mp + warp;

  vec3 col = uPrimaryColor;

  if (uPatternType == 0) {
    float mott = fbm2(wp * 4.5 + uPatternSeed);
    float flankLight = smoothstep(0.05, 0.16, abs(mp.y));
    col = mix(uPrimaryColor, uSecondaryColor, mott * 0.35 + flankLight * 0.18);
    col = mix(col, uTertiaryColor, (1.0 - g.height) * 0.20);
  } else if (uPatternType == 1) {
    float spineLine = exp(-pow((wp.y + 0.005 * sin(wp.x * 16.0)) / 0.028, 2.0));
    float stripePhase = (wp.x * 38.0 + abs(wp.y) * 11.5 + sin(wp.x * 10.0 + uPatternSeed) * 1.35);
    float ribStripes = smoothstep(0.05, 0.68, sin(stripePhase)) * smoothstep(0.18, 0.02, abs(mp.y));
    float headStripes = smoothstep(0.10, 0.65, sin((wp.y * 58.0) + sin(wp.x * 22.0) * 1.3)) * g.headMask;
    float tailRings = smoothstep(0.02, 0.58, sin(g.tailT * 26.0 + uPatternSeed)) * g.tailMask;
    float darkMask = clamp(max(max(spineLine * 0.96, ribStripes * 0.90), max(headStripes * 0.85, tailRings * 0.94)), 0.0, 1.0);
    float bellyFade = smoothstep(0.11, 0.17, abs(mp.y)) * (1.0 - g.tailMask);
    col = mix(uPrimaryColor, uSecondaryColor, darkMask);
    col = mix(col, uTertiaryColor, bellyFade * 0.48);
  } else if (uPatternType == 2) {
    float nOrange = fbm2(wp * 1.45 + vec2(1.4, 2.9));
    float nBlack  = fbm2(wp * 1.55 + vec2(6.8, 0.7));
    float orangePatch = smoothstep(0.50, 0.56, nOrange + 0.08 * sin(mp.x * 5.0));
    float blackPatch  = smoothstep(0.52, 0.58, nBlack - 0.06 * mp.y);
    float headCap = smoothstep(0.47, 0.55, fbm2(wp * 2.1 + 3.1)) * g.headMask;
    float tailBand = sin(g.tailT * 17.0);
    float tailBlack = smoothstep(0.05, 0.42, tailBand) * g.tailMask;
    float tailOrange = smoothstep(-0.05, -0.42, tailBand) * g.tailMask;
    col = uPrimaryColor;
    col = mix(col, uSecondaryColor, clamp(orangePatch + tailOrange * 0.88, 0.0, 1.0));
    col = mix(col, uTertiaryColor, clamp(blackPatch + headCap * 0.82 + tailBlack * 0.90, 0.0, 1.0));
  } else if (uPatternType == 3) {
    float saddleField = fbm2(wp * 1.7 + vec2(uPatternSeed * 0.7, 2.2));
    float dorsalBias = smoothstep(0.135, 0.03, abs(mp.y + 0.02 * sin(mp.x * 7.0)));
    float darkMask = smoothstep(0.43, 0.52, saddleField * 0.65 + dorsalBias * 0.55);
    float capMask = g.headMask * smoothstep(0.015, 0.045, abs(mp.y + 0.01)) * smoothstep(-0.37, -0.26, mp.x);
    darkMask = clamp(max(darkMask, max(capMask, g.tailMask * 0.9)), 0.0, 1.0);
    float midBlend = fbm2(wp * 4.2 + uPatternSeed) * 0.25;
    col = mix(uPrimaryColor, mix(uSecondaryColor, uTertiaryColor, midBlend), darkMask);
  } else if (uPatternType == 4) {
    float m1 = fbm2(wp * 4.2 + vec2(2.1, 4.7));
    float m2 = fbm2(wp * 7.8 + vec2(7.3, 1.9));
    float amber = smoothstep(0.50, 0.66, m1 * 0.65 + m2 * 0.45);
    float cinna = smoothstep(0.42, 0.58, m2);
    col = mix(uPrimaryColor, uTertiaryColor, cinna * 0.65);
    col = mix(col, uSecondaryColor, amber * 0.92);
  } else if (uPatternType == 5) {
    float maskDist = length((mp - vec2(-0.375, -0.01)) * vec2(1.1, 1.35));
    float facePoint = smoothstep(0.115, 0.04, maskDist);
    float earPoint = g.earMask * 0.95;
    float tailPoint = g.tailMask * smoothstep(0.0, 0.55, g.tailT);
    float dorsalToast = exp(-pow(mp.y / 0.11, 2.0)) * smoothstep(-0.22, 0.16, mp.x) * 0.30;
    float pointMask = clamp(max(max(facePoint, earPoint), tailPoint), 0.0, 1.0);
    col = mix(uPrimaryColor, uTertiaryColor, dorsalToast);
    col = mix(col, uSecondaryColor, pointMask);
  } else if (uPatternType == 6) {
    float earPoint = g.earMask * 0.85;
    float crownBlush = g.headMask * smoothstep(-0.35, -0.26, mp.x) * smoothstep(0.01, 0.055, abs(mp.y + 0.01)) * 0.72;
    float saddleBlush = exp(-pow(mp.y / 0.11, 2.0)) * smoothstep(-0.18, 0.10, mp.x) * smoothstep(0.25, 0.08, mp.x) * 0.36;
    float tailMist = g.tailMask * (0.45 + 0.48 * g.tailT);
    col = mix(uPrimaryColor, uTertiaryColor, clamp(saddleBlush + tailMist * 0.45, 0.0, 1.0));
    col = mix(col, uSecondaryColor, clamp(max(earPoint, max(crownBlush, tailMist * 0.72)), 0.0, 1.0));
  } else {
    float skinMott = fbm2(wp * 4.2 + 2.3);
    float earShade = g.earMask * 0.52;
    float tailShade = g.tailMask * (0.25 + 0.35 * g.tailT);
    col = mix(uPrimaryColor, uTertiaryColor, smoothstep(0.35, 0.75, skinMott) * 0.45);
    col = mix(col, uSecondaryColor, clamp(max(earShade, tailShade), 0.0, 0.75));
  }

  col = mix(col, uEarInnerColor, g.earInner * 0.82);
  return col;
}

// ---------- Window Sunbeams, Moonbeams & Animated Raindrop Pane Shadows ----------

float evalWindowLight(vec2 uv, float heightOffset) {
  vec2 shifted = uv + vec2(0.085, 0.072) * heightOffset;
  float sway = sin(uTime * 0.38 + shifted.y * 4.5) * 0.014;
  float diag = shifted.x * 0.78 - shifted.y * 0.62 + sway;

  float beam1 = smoothstep(0.04, 0.14, diag) * smoothstep(0.30, 0.20, diag);
  float beam2 = smoothstep(0.28, 0.38, diag) * smoothstep(0.56, 0.45, diag);
  float beam3 = smoothstep(-0.22, -0.08, diag) * smoothstep(0.04, -0.05, diag) * 0.75;

  float windowFalloff = smoothstep(1.38, 0.18, length(shifted * vec2(0.9, 1.05)));
  return clamp((beam1 + beam2 * 0.85 + beam3) * windowFalloff, 0.0, 1.0);
}

/**
 * Projects soft refracted window-pane raindrop shadows sliding diagonally
 * across the cushion and curving over the cat's back during Rainy Afternoon mode!
 */
float evalRainShadows(vec2 uv, float heightOffset) {
  if (uRain < 0.01) return 0.0;
  vec2 p = uv + vec2(0.07, 0.06) * heightOffset;
  // Rotate into diagonal window-projection coordinates
  vec2 rp = rot2d(p, -0.34);

  float drops = 0.0;
  // 2 parallax layers of sliding window droplets + vertical water trails
  for (int layer = 0; layer < 2; layer++) {
    float scaleX = layer == 0 ? 15.0 : 24.0;
    float scaleY = layer == 0 ? 5.5 : 8.5;
    float speed = layer == 0 ? 0.32 : 0.48;

    float colId = floor(rp.x * scaleX);
    float colHash = fract(sin(colId * 127.1 + float(layer) * 43.7) * 43758.5453);
    float colX = fract(rp.x * scaleX) - 0.5;
    // Slight organic meander as droplet runs down glass
    colX += sin(rp.y * 18.0 + colHash * 12.0) * 0.09;

    float yFlow = rp.y * scaleY - uTime * speed * (0.75 + 0.55 * colHash) + colHash * 9.0;
    float cellY = fract(yFlow);

    // Droplet head shadow + faint refracted caustic trail above it
    float head = exp(-pow(colX / 0.18, 2.0) - pow((cellY - 0.78) / 0.10, 2.0));
    float trail = exp(-pow(colX / 0.09, 2.0)) * smoothstep(0.15, 0.75, cellY) * smoothstep(0.84, 0.76, cellY) * 0.42;
    drops += (head + trail) * (layer == 0 ? 0.65 : 0.45);
  }
  return clamp(drops, 0.0, 1.0) * uRain;
}

vec3 evalProceduralCushion(vec2 uv) {
  float warp = sin(uv.x * 520.0 * uAspect + texNoise(uv * 8.0) * 2.0) * 0.5 + 0.5;
  float weft = sin(uv.y * 520.0 + texNoise(uv * 8.0 + 3.1) * 2.0) * 0.5 + 0.5;
  float weave = mix(warp, weft, 0.5) * 0.065;
  float grain = (fbm2(uv * 16.0) - 0.5) * 0.05;
  vec3 linen = vec3(0.82, 0.76, 0.67) + weave + grain;
  float vig = 1.0 - 0.14 * dot(uv - 0.5, uv - 0.5);
  return linen * vig;
}

// ---------- 3-State Atmospheric Lighting (Warm Day / Cozy Rainy Afternoon / Cool Moonlight) ----------

vec3 applyAtmosphere(vec3 col, float windowBeam, float rainDrop) {
  // 1) Warm sunlit morning
  vec3 dayCol = col * (0.95 + windowBeam * 0.22 * vec3(1.06, 0.99, 0.87));

  // 2) Rainy Afternoon: soft overcast slate-warm tone + drifting raindrop shadows & gentle wet glints
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 softDesat = mix(col, vec3(lum), 0.22);
  vec3 rainCol = softDesat * vec3(0.74, 0.80, 0.88);
  // Soft diffused rainy window brightness modulated by sliding raindrop shadows!
  rainCol *= 0.92 + windowBeam * 0.14 - rainDrop * 0.16;
  rainCol += vec3(0.10, 0.13, 0.18) * rainDrop * windowBeam * 0.45;

  // 3) Tranquil silver-indigo moonlight
  vec3 nightDesat = mix(col, vec3(lum), 0.34);
  vec3 nightCol = nightDesat * vec3(0.27, 0.36, 0.54) + nightDesat * windowBeam * vec3(0.30, 0.41, 0.62);

  vec3 res = mix(dayCol, rainCol, uRain);
  res = mix(res, nightCol, uNight);
  return res;
}

// ---------- Procedural Shaded Walnut Wooden Pet Comb ----------

vec4 evalWoodenComb(vec2 uv, out float shadowAlpha) {
  shadowAlpha = 0.0;
  vec2 d = uv - uHandPos;
  d.x *= uAspect;
  vec2 p = rot2d(d, -uHandAngle) / max(0.80, 0.88 + 0.12 * uCatSize);

  // Soft cast shadow offset
  vec2 shOff = vec2(0.018, 0.022) * (1.15 - uHandPress * 0.65);
  vec2 ds = uv - (uHandPos + shOff);
  ds.x *= uAspect;
  vec2 ps = rot2d(ds, -uHandAngle) / max(0.80, 0.88 + 0.12 * uCatSize);
  float sSpine = sdRoundedBox(ps - vec2(0.0, 0.028), vec2(0.095, 0.018), 0.012);
  float sHandle = sdRoundedBox(ps - vec2(0.0, 0.11), vec2(0.020, 0.088), 0.014);
  float sTeethBox = sdRoundedBox(ps - vec2(0.0, -0.014), vec2(0.086, 0.032), 0.005);
  float sDist = min(min(sSpine, sHandle), sTeethBox);
  shadowAlpha = smoothstep(0.016, -0.004, sDist) * mix(0.24, 0.42, uHandPress);

  // Comb teeth (11 fine rounded pins extending upward from wooden spine)
  float toothPitch = 0.0155;
  float tx = p.x - clamp(round(p.x / toothPitch), -5.0, 5.0) * toothPitch;
  float dTeeth = sdRoundedBox(vec2(tx, p.y + 0.014), vec2(0.0028, 0.034), 0.0024);

  // Walnut wooden comb spine & ergonomic handle
  float dSpine = sdRoundedBox(p - vec2(0.0, 0.028), vec2(0.096, 0.018), 0.013);
  float dHandle = sdRoundedBox(p - vec2(0.0, 0.115), vec2(0.021, 0.092), 0.015);
  float dWood = smin(dSpine, dHandle, 0.014);

  float woodA = smoothstep(0.0025, -0.0025, dWood);
  float teethA = smoothstep(0.002, -0.002, dTeeth) * (1.0 - woodA);

  if (woodA < 0.005 && teethA < 0.005) return vec4(0.0);

  // Rich warm walnut wood grain
  float grain = sin(p.y * 120.0 + fbm2(p * 18.0) * 7.0) * 0.5 + 0.5;
  float woodShade = 0.72 + 0.34 * smoothstep(0.025, -0.02, p.x + p.y * 0.35);
  vec3 woodCol = mix(vec3(0.36, 0.22, 0.13), vec3(0.54, 0.35, 0.21), grain * 0.65 + 0.2) * woodShade;
  // Subtle polished wood highlight
  woodCol += vec3(0.18, 0.13, 0.09) * exp(-pow((p.x + 0.006) / 0.014, 2.0)) * smoothstep(0.01, 0.05, p.y);

  // Warm brushed brass / ivory pins
  float pinLight = 0.76 + 0.28 * (1.0 - abs(tx) / 0.003);
  vec3 teethCol = vec3(0.84, 0.77, 0.66) * pinLight;

  vec3 col = woodCol * woodA + teethCol * teethA;
  float a = clamp(woodA + teethA, 0.0, 1.0);
  return vec4(col / max(a, 1e-4), a);
}

// ---------- Main Fragment ----------

void main() {
  vec2 uv = vUv;
  vec2 catP = stageToCat(uv);

  // 1) Cushion Background
  vec3 bgCol;
  if (uHasBgTex > 0.5) {
    float texAspect = uBgAspectSize.x / max(1.0, uBgAspectSize.y);
    vec2 bgUv = uv;
    if (uAspect > texAspect) {
      float scale = texAspect / uAspect;
      bgUv.y = (bgUv.y - 0.5) * scale + 0.5;
    } else {
      float scale = uAspect / texAspect;
      bgUv.x = (bgUv.x - 0.5) * scale + 0.5;
    }
    bgCol = texture(uBgTex, clamp(bgUv, 0.002, 0.998)).rgb;
  } else {
    bgCol = evalProceduralCushion(uv);
  }

  float bgBeam = evalWindowLight(uv, 0.0);
  float bgRain = evalRainShadows(uv, 0.0);
  bgCol = applyAtmosphere(bgCol, bgBeam * 0.55, bgRain);

  // 2) Dynamic Cat Contact & Cast Shadow on Cushion
  CatGeom gHere = evalCat(catP);
  CatGeom gShadow = evalCat(catP - vec2(0.032, 0.042));
  CatGeom gShadowFar = evalCat(catP - vec2(0.052, 0.064));
  float contactAO = smoothstep(0.048, -0.015, gHere.sdf);
  float castShad = smoothstep(0.064, -0.016, gShadow.sdf);
  float softCast = smoothstep(0.095, -0.010, gShadowFar.sdf);
  float shadowStrength = clamp(max(contactAO * 0.56, max(castShad * 0.36, softCast * 0.18)), 0.0, 0.68);
  vec3 shadowTint = mix(vec3(0.42, 0.36, 0.30), vec3(0.18, 0.24, 0.38), max(uNight, uRain * 0.45));
  bgCol = mix(bgCol, bgCol * shadowTint, shadowStrength);

  // 2.5) Fuzzy Shedding Furballs resting on the cushion!
  vec3 sceneCol = bgCol;
  for (int i = 0; i < 6; i++) {
    if (i >= uFurballCount) break;
    vec4 fb = uFurballPos[i];
    vec2 fd = uv - fb.xy;
    fd.x *= uAspect;
    float dist = length(fd);
    float r = fb.z;
    if (dist < r * 2.2) {
      // Soft drop shadow
      float shD = length(fd - vec2(0.006, 0.008));
      sceneCol *= 1.0 - smoothstep(r * 1.35, r * 0.3, shD) * 0.34;
      // Wispy fuzzy hairball edge
      float ang = atan(fd.y, fd.x);
      float wisp = (texture(uNoiseTex, vec2(ang * 0.9 + fb.w, dist * 9.0)).r - 0.5) * r * 0.55;
      float cov = smoothstep(r + wisp + 0.004, r * 0.42 + wisp, dist);
      if (cov > 0.005) {
        float dome = sqrt(max(0.0, 1.0 - clamp(dist / max(r, 1e-4), 0.0, 1.0)));
        float fiber = texture(uNoiseTex, fd * 14.0 + fb.w).r;
        float shade = 0.52 + 0.55 * dome * (0.75 + 0.35 * fiber) - fd.x * 4.0 - fd.y * 3.0;
        vec3 fbCol = applyAtmosphere(uFurballCol[i] * clamp(shade, 0.35, 1.25), bgBeam * 0.5, bgRain);
        sceneCol = mix(sceneCol, fbCol, cov * 0.92);
      }
    }
  }

  // 3) Cat Surface + Multi-Layer 2.5D Fur Shell March
  float furHalo = 0.032 + uFurLength * 0.048 * max(1.0, uTailFluff);
  if (gHere.sdf < furHalo) {
    vec4 sim = texture(uSimTex, uv);
    float indent = sim.r;
    vec2 comb = (sim.ba - 0.5) * 2.0;

    vec2 epsUv = vec2(0.004 / uAspect, 0.004);
    float indR = texture(uSimTex, uv + vec2(epsUv.x, 0.0)).r;
    float indL = texture(uSimTex, uv - vec2(epsUv.x, 0.0)).r;
    float indB = texture(uSimTex, uv + vec2(0.0, epsUv.y)).r;
    float indT = texture(uSimTex, uv - vec2(0.0, epsUv.y)).r;
    vec2 indentGrad = vec2(indR - indL, indB - indT) * 14.0;

    float eps = 0.006;
    float hR = evalCat(catP + vec2(eps, 0.0)).height;
    float hL = evalCat(catP - vec2(eps, 0.0)).height;
    float hB = evalCat(catP + vec2(0.0, eps)).height;
    float hT = evalCat(catP - vec2(0.0, eps)).height;
    vec2 bodyGrad = vec2(hR - hL, hB - hT) / (2.0 * eps);
    vec3 surfNormal = normalize(vec3(-bodyGrad.x * 0.38 + indentGrad.x, -bodyGrad.y * 0.38 + indentGrad.y, 1.0));

    vec3 lightDir = normalize(vec3(-0.56, -0.48, 0.68));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfVec = normalize(lightDir + viewDir);

    if (uFurLength < 0.04) {
      // SPHYNX
      float alpha = smoothstep(0.005, -0.005, gHere.sdf);
      if (alpha > 0.001) {
        vec3 baseSkin = evalCoatColor(catP, gHere);
        float neckZone = exp(-pow((catP.x + 0.21) / 0.075, 2.0));
        float browZone = exp(-pow((catP.x + 0.32) / 0.045, 2.0)) * exp(-pow((catP.y + 0.01) / 0.055, 2.0));
        float hipZone  = exp(-pow((catP.x - 0.14) / 0.075, 2.0)) * smoothstep(0.02, 0.12, abs(catP.y));
        float warpW = (fbm2(catP * 5.8 + 1.4) - 0.5) * 3.8;

        float fNeck = sin(catP.x * 145.0 + warpW + abs(catP.y) * 18.0) * neckZone;
        float fBrow = sin(catP.x * 165.0 + warpW * 0.7) * browZone * 0.65;
        float fHip  = sin((catP.x - abs(catP.y) * 0.6) * 120.0 + warpW) * hipZone * 0.80;
        float foldVal = fNeck + fBrow + fHip;
        float creaseAO = 1.0 - clamp(-foldVal, 0.0, 1.0) * 0.22;

        float suedeGrain = (texture(uNoiseTex, catP * 6.5).r - 0.5) * 0.065;
        vec3 nSkin = normalize(surfNormal + vec3(foldVal * 0.26 + suedeGrain * 1.4, foldVal * 0.10 + suedeGrain, 0.0));
        float wrap = clamp((dot(nSkin, lightDir) + 0.62) / 1.62, 0.0, 1.0);
        float velvetRim = pow(1.0 - max(0.0, nSkin.z), 1.9) * 0.24;

        float catBeam = evalWindowLight(uv, gHere.height * 0.42);
        float catRain = evalRainShadows(uv, gHere.height * 0.42);
        vec3 lit = (baseSkin + suedeGrain * 0.45) * (0.44 + 0.58 * wrap) * creaseAO
          + mix(vec3(0.95, 0.84, 0.78), vec3(0.62, 0.74, 0.92), max(uNight, uRain * 0.5)) * velvetRim;
        lit *= 1.0 - indent * 0.30;
        lit *= 0.72 + 0.28 * smoothstep(0.0, 0.36, gHere.height);
        lit = applyAtmosphere(lit, catBeam, catRain);
        sceneCol = mix(sceneCol, lit, alpha);
      }
    } else {
      // 20-LAYER VOLUMETRIC 2.5D FUR SHELL MARCH
      float localLen = uFurLength
        * mix(1.0, 0.46, gHere.headMask)
        * mix(1.0, 0.38, gHere.earMask)
        * (1.0 + gHere.ruffMask * 0.55 * uRuffFluff)
        * mix(1.0, max(0.75, uTailFluff), gHere.tailMask);

      vec2 baseFlow = gHere.flow;
      vec2 combLocal = vec2(comb.x, comb.y);
      vec2 effDir = normalize(baseFlow + combLocal * 1.65 + vec2(1e-4, 0.0));
      float againstGrain = clamp(-dot(baseFlow, combLocal), 0.0, 1.0);
      float combAmount = length(combLocal);
      // Silky gloss boost when freshly groomed with the wooden comb!
      float groomedSheenBoost = uToolMode == 1 ? combAmount * 0.38 : combAmount * 0.12;

      vec3 accumCol = vec3(0.0);
      float accumAlpha = 0.0;

      const int LAYERS = 20;
      for (int i = LAYERS - 1; i >= 0; i--) {
        if (accumAlpha > 0.985) break;

        float h = float(i) / float(LAYERS - 1);
        float overhang = h * (0.012 + localLen * 0.036);
        vec2 pLayer = catP
          - effDir * overhang
          - combLocal * (h * 0.015 * (0.6 + 0.6 * localLen))
          + vec2(surfNormal.x, surfNormal.y) * (h * 0.008);

        CatGeom gLayer = evalCat(pLayer);
        float edgeSlack = h * (0.006 + localLen * 0.016);
        if (gLayer.sdf > edgeSlack) continue;

        float bodyCov = smoothstep(edgeSlack, -0.008, gLayer.sdf);
        float fiber = sampleFurFiber(pLayer + vec2(h * 0.012, -h * 0.009), effDir, uFurClump);

        float layerAlpha;
        if (i == 0) {
          layerAlpha = bodyCov;
        } else {
          float threshold = h * (0.76 - againstGrain * 0.10);
          float strand = smoothstep(threshold, threshold + 0.24, fiber);
          float edgeSoft = mix(0.62, 1.0, smoothstep(0.006, -0.025, gLayer.sdf));
          layerAlpha = strand * bodyCov * edgeSoft * (0.34 + 0.28 * (1.0 - h));
        }

        if (layerAlpha < 0.004) continue;

        vec3 coat = evalCoatColor(pLayer, gLayer);
        float rootAO = mix(0.36, 1.06, pow(h, 0.62));
        float pressAO = 1.0 - indent * mix(0.46, 0.22, h);
        float bellyAO = 0.70 + 0.30 * smoothstep(0.0, 0.36, gLayer.height);

        vec3 tuftN = normalize(surfNormal + vec3((fiber - 0.5) * 0.45 * effDir, 0.0));
        float ndl = dot(tuftN, lightDir);
        float wrapDiff = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);

        vec3 tangent3 = normalize(vec3(effDir * (0.85 - againstGrain * 0.25), 0.32 + againstGrain * 0.35));
        float tdh = dot(tangent3, halfVec);
        float sinTH = sqrt(max(0.0, 1.0 - tdh * tdh));
        float coatLum = dot(coat, vec3(0.299, 0.587, 0.114));
        float sheenScale = mix(0.45, 1.0, smoothstep(0.04, 0.35, coatLum));
        float sheenSpec = pow(sinTH, 18.0) * (uSheen + groomedSheenBoost) * sheenScale * (0.10 + 0.18 * h) * (0.35 + 0.65 * wrapDiff);
        float rim = pow(1.0 - max(0.0, tuftN.z), 2.8) * h * 0.12 * smoothstep(0.008, -0.015, gLayer.sdf);

        vec3 bounce = mix(vec3(0.12, 0.095, 0.07), vec3(0.035, 0.055, 0.10), max(uNight, uRain * 0.45)) * (1.0 - wrapDiff) * (0.5 + 0.5 * h);
        float catBeam = evalWindowLight(uv, (gLayer.height - indent * 0.28) * 0.52);
        float catRain = evalRainShadows(uv, (gLayer.height - indent * 0.28) * 0.52);

        vec3 litFur = coat * (0.32 + 0.76 * wrapDiff) * rootAO * pressAO * bellyAO
          + mix(vec3(1.0, 0.96, 0.90), vec3(0.75, 0.86, 1.0), max(uNight, uRain * 0.5)) * (sheenSpec + rim * (0.35 + 0.65 * catBeam))
          + coat * bounce;

        litFur *= 1.0 - againstGrain * combAmount * (1.0 - h) * 0.14;
        litFur = applyAtmosphere(litFur, catBeam, catRain);

        float w = layerAlpha * (1.0 - accumAlpha);
        accumCol += litFur * w;
        accumAlpha += w;
      }

      sceneCol = sceneCol * (1.0 - accumAlpha) + accumCol;
    }
  }

  // 4) Glowing Red Laser Pointer Dot (projected onto cushion & cat fur!)
  if (uLaserVisible > 0.005) {
    vec2 ld = uv - uLaserPos;
    ld.x *= uAspect;
    float r = length(ld);
    float core = exp(-r * r / 0.000035);
    float innerGlow = exp(-r * r / 0.00028);
    float outerHalo = exp(-r * r / 0.0022);
    float nightBoost = 1.0 + uNight * 0.55 + uRain * 0.20;
    vec3 laserAdd = (vec3(1.0, 0.95, 0.92) * core * 1.4
      + vec3(1.0, 0.08, 0.05) * innerGlow * 0.95
      + vec3(0.95, 0.05, 0.04) * outerHalo * 0.30) * uLaserVisible * nightBoost;
    sceneCol += laserAdd;
  }

  // 5) Active Tactile Tool: Photorealistic Petting Hand OR Walnut Wooden Pet Comb!
  if (uHandVisible > 0.005 && uToolMode == 0 && uHasHandTex > 0.5) {
    float handHeightUv = 0.66 * (1.0 - uHandPress * 0.042);
    float handAspect = uHandTexSize.x / max(1.0, uHandTexSize.y);
    float handWidthUv = handHeightUv * handAspect;
    vec2 anchorUv = vec2(0.50, 0.33);

    vec2 shadowOffset = vec2(0.022, 0.026) * (1.15 - uHandPress * 0.68);
    vec2 sd = uv - (uHandPos + shadowOffset);
    sd.x *= uAspect;
    vec2 sRot = rot2d(sd, -uHandAngle);
    vec2 sUv = vec2(sRot.x / handWidthUv, sRot.y / handHeightUv) + anchorUv;
    if (sUv.y > 0.94) {
      sUv.y = 0.84 + abs(mod(sUv.y - 0.94, 0.20) - 0.10);
    }
    if (sUv.x > 0.0 && sUv.x < 1.0 && sUv.y > 0.0 && sUv.y < 1.0) {
      float b = mix(0.024, 0.011, uHandPress);
      float sa = texture(uHandTex, sUv).a * 0.36
        + texture(uHandTex, sUv + vec2( b,  0.0)).a * 0.16
        + texture(uHandTex, sUv + vec2(-b,  0.0)).a * 0.16
        + texture(uHandTex, sUv + vec2( 0.0,  b)).a * 0.16
        + texture(uHandTex, sUv + vec2( 0.0, -b)).a * 0.16;
      float sOpacity = sa * uHandVisible * mix(0.24, 0.44, uHandPress);
      sceneCol *= 1.0 - sOpacity * vec3(0.92, 0.96, 1.0);
    }

    vec2 hd = uv - uHandPos;
    hd.x *= uAspect;
    vec2 hRot = rot2d(hd, -uHandAngle);
    vec2 hUv = vec2(hRot.x / handWidthUv, hRot.y / handHeightUv) + anchorUv;
    if (hUv.y > 0.94) {
      hUv.y = 0.84 + abs(mod(hUv.y - 0.94, 0.20) - 0.10);
    }
    if (hUv.x > 0.0 && hUv.x < 1.0 && hUv.y > 0.0 && hUv.y < 1.0) {
      vec4 handSample = texture(uHandTex, hUv);
      if (handSample.a > 0.005) {
        float handBeam = evalWindowLight(uv, 0.65);
        float handRain = evalRainShadows(uv, 0.65);
        vec3 handLit = applyAtmosphere(handSample.rgb, handBeam * 0.45, handRain * 0.5);
        sceneCol = mix(sceneCol, handLit, handSample.a * uHandVisible);
      }
    }
  } else if (uHandVisible > 0.005 && uToolMode == 1) {
    float combShad;
    vec4 combSample = evalWoodenComb(uv, combShad);
    sceneCol *= 1.0 - combShad * uHandVisible;
    if (combSample.a > 0.005) {
      float handBeam = evalWindowLight(uv, 0.65);
      float handRain = evalRainShadows(uv, 0.65);
      vec3 combLit = applyAtmosphere(combSample.rgb, handBeam * 0.45, handRain * 0.5);
      sceneCol = mix(sceneCol, combLit, combSample.a * uHandVisible);
    }
  }

  sceneCol = clamp(sceneCol, 0.0, 1.0);
  sceneCol = mix(sceneCol, sceneCol * sceneCol * (3.0 - 2.0 * sceneCol), 0.12);
  fragColor = vec4(sceneCol, 1.0);
}
`;
