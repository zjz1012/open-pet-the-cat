export const FULLSCREEN_VERT = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  // Fullscreen triangle covering clip space (-1..3)
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  // Flip Y so vUv.y = 0 at top of viewport, 1 at bottom (matches DOM pointer coords)
  vUv = vec2(pos.x, 1.0 - pos.y);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Ping-Pong Interactive Soft-Body & Fur-Combing Simulation Shader
 * Encoded in RGBA8 for 100% universal WebGL2 compatibility (including iOS Safari):
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

vec2 rot2d(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  // Sample previous state + gentle 4-neighbor diffusion for plush soft-body cohesion
  vec4 prev = texture(uPrevSim, vUv);
  vec4 nL = texture(uPrevSim, vUv - vec2(uTexelSize.x, 0.0));
  vec4 nR = texture(uPrevSim, vUv + vec2(uTexelSize.x, 0.0));
  vec4 nT = texture(uPrevSim, vUv - vec2(0.0, uTexelSize.y));
  vec4 nB = texture(uPrevSim, vUv + vec2(0.0, uTexelSize.y));
  vec4 avg = 0.25 * (nL + nR + nT + nB);

  float indent = mix(prev.r, avg.r, min(0.32, uDt * 12.0));
  float vel = (prev.g - 0.5) * 2.0;
  vec2 flow = mix(prev.ba, avg.ba, min(0.18, uDt * 4.0)) * 2.0 - 1.0;

  // Compute multi-finger + palm contact imprint in aspect-corrected hand-local space
  vec2 d = vUv - uHandPos;
  d.x *= uAspect;
  // Rotate into hand's local frame (fingers pointing upward = -Y in UV space)
  vec2 hp = rot2d(d, -uHandAngle) / max(0.75, 0.85 + 0.15 * uCatSize);

  float contact = 0.0;
  if (uHandVisible > 0.01 && uHandPress > 0.01) {
    // 4 soft fingertips + gentle palm heel pad
    float f1 = exp(-dot((hp - vec2(-0.044, -0.042)) / vec2(0.024, 0.036), (hp - vec2(-0.044, -0.042)) / vec2(0.024, 0.036)));
    float f2 = exp(-dot((hp - vec2(-0.014, -0.058)) / vec2(0.024, 0.040), (hp - vec2(-0.014, -0.058)) / vec2(0.024, 0.040)));
    float f3 = exp(-dot((hp - vec2( 0.017, -0.050)) / vec2(0.024, 0.038), (hp - vec2( 0.017, -0.050)) / vec2(0.024, 0.038)));
    float f4 = exp(-dot((hp - vec2( 0.045, -0.030)) / vec2(0.022, 0.032), (hp - vec2( 0.045, -0.030)) / vec2(0.022, 0.032)));
    float palm = exp(-dot((hp - vec2(0.002, 0.022)) / vec2(0.068, 0.058), (hp - vec2(0.002, 0.022)) / vec2(0.068, 0.058))) * 0.72;

    float fingerMax = max(max(f1, f2), max(f3, f4));
    contact = clamp(max(fingerMax, palm) * uHandPress * uHandVisible, 0.0, 1.0);
  }

  // Spring-damper vertical bounce for plush fat/fur indentation
  float springAccel = (contact - indent) * 52.0 - vel * 14.0;
  vel += springAccel * uDt;
  indent = clamp(indent + vel * uDt, 0.0, 1.0);
  if (contact < 0.01) {
    indent *= exp(-uDt * 4.5);
  }

  // Fur combing vector: hand strokes push fur in movement direction; fur slowly relaxes back
  float combMask = smoothstep(0.06, 0.50, contact);
  vec2 strokeVec = vec2(uHandVel.x * uAspect, uHandVel.y);
  float strokeMag = length(strokeVec);
  if (combMask > 0.001 && strokeMag > 0.015) {
    vec2 strokeDir = strokeVec / (strokeMag + 0.0001);
    float strength = min(1.0, strokeMag * 0.85) * combMask;
    flow = mix(flow, strokeDir * min(1.0, 0.55 + strokeMag * 0.55), min(1.0, uDt * 18.0 * strength));
  }
  // Gentle outward parting right under pressed fingertips even when still
  if (contact > 0.18) {
    vec2 radial = normalize(hp + vec2(0.0001));
    vec2 worldRadial = rot2d(radial, uHandAngle);
    flow = mix(flow, flow + worldRadial * 0.16, min(1.0, uDt * 2.8 * contact));
  }

  // Natural elastic relaxation of combed fur over ~2.8 seconds
  flow *= exp(-uDt * 0.48);
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
 * Photorealistic 2.5D Cat + Multi-Layer Fur Shell March + Sunlit/Moonlit Cushion + Petting Hand Shader
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

// Cat proportions & live physics
uniform float uCatSize;
uniform float uTorsoWidth;
uniform float uBreath;
uniform float uLeftEarSquish;
uniform float uRightEarSquish;
uniform float uHeadPress;
uniform float uRumpLift;
uniform vec2 uTail[13];

// Breed coat & fur parameters
uniform int uPatternType; // 0=solid,1=tabby,2=calico,3=bicolor,4=tortie,5=colorpoint,6=ragdoll,7=sphynx
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

// Hand rendering uniforms
uniform vec2 uHandPos;
uniform float uHandAngle;
uniform float uHandPress;
uniform float uHandVisible;

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

float sdEarTriangle(vec2 p, float w, float h) {
  // Soft rounded cat ear pointing along +Y in ear-local coords
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

// Fast tileable 2D noise from precomputed RGBA noise texture
float texNoise(vec2 p) {
  return texture(uNoiseTex, p).r;
}

// Smooth low/mid-frequency organic noise for coat patches, stripes & skin folds
// (Uses channels A=16-period smooth blobs and B=48-period medium detail!)
float fbm2(vec2 p) {
  float n1 = texture(uNoiseTex, p * 0.34).a;
  float n2 = texture(uNoiseTex, p * 0.68 + vec2(0.37, 0.71)).b;
  return n1 * 0.76 + n2 * 0.24;
}

/**
 * Line-Integral-Convolution style directional fur fiber density!
 * Aligned seamlessly along local fur flow vector dir with ZERO stretching seams.
 */
float sampleFurFiber(vec2 p, vec2 dir, float clump) {
  vec2 nDir = normalize(dir + vec2(1e-5, 0.0));
  vec2 perp = vec2(-nDir.y, nDir.x);

  // Fine hair strands: 4 taps stretched along dir
  vec2 baseUv = p * 2.65;
  float stepFine = 0.0085;
  float s0 = texture(uNoiseTex, baseUv - nDir * stepFine * 1.5).r;
  float s1 = texture(uNoiseTex, baseUv - nDir * stepFine * 0.5).r;
  float s2 = texture(uNoiseTex, baseUv + nDir * stepFine * 0.5).r;
  float s3 = texture(uNoiseTex, baseUv + nDir * stepFine * 1.5).r;
  float fine = (s0 + s1 + s2 + s3) * 0.25;

  // Sharpen cross-strand contrast slightly using perpendicular difference
  float sideL = texture(uNoiseTex, baseUv + perp * 0.0045).g;
  float microStrand = clamp(fine * 1.25 - sideL * 0.22 + 0.08, 0.0, 1.0);

  // Coarser fur locks / tufts (stronger on shaggy breeds)
  vec2 clumpUv = p * 0.92;
  float c0 = texture(uNoiseTex, clumpUv - nDir * 0.018).b;
  float c1 = texture(uNoiseTex, clumpUv + nDir * 0.018).b;
  float c2 = texture(uNoiseTex, clumpUv + nDir * 0.042).a;
  float lock = (c0 + c1 + c2) * 0.333;

  return mix(microStrand, microStrand * 0.55 + lock * 0.55, clump);
}

// ---------- Parametric 2.5D Cat Anatomy ----------

struct CatGeom {
  float sdf;        // < 0 inside body
  float height;     // 0..1 2.5D dome elevation
  vec2 flow;        // unit natural fur growth direction
  float headMask;   // 0..1
  float earMask;    // 0..1
  float earInner;   // 0..1 pink/dark inner ear recess
  float tailMask;   // 0..1
  float tailT;      // 0..1 along tail from root to tip
  float ruffMask;   // 0..1 fluffy collar/cheek ruff
};

CatGeom evalCat(vec2 p) {
  CatGeom g;

  // 1) Torso loaf shape (x from -0.22 shoulders to +0.205 haunches)
  float breathExpand = uBreath * 0.009 * exp(-pow((p.x + 0.02) / 0.14, 2.0));
  float torsoWeight = smoothstep(-0.29, -0.09, p.x) * smoothstep(0.29, 0.10, p.x);
  float widthFactor = mix(1.0, uTorsoWidth, torsoWeight) + breathExpand * 3.5;

  // Natural organic waist-to-haunch curve: slightly fuller hips, softly rounded chest
  float spineProfile = 0.128 + 0.016 * sin((p.x + 0.14) * 7.2) - 0.012 * smoothstep(0.10, 0.23, p.x);
  float clampedX = clamp(p.x, -0.215, 0.195);
  vec2 torsoDelta = vec2(p.x - clampedX, (p.y - 0.002) / widthFactor);
  float dTorso = length(torsoDelta) - spineProfile;

  // 2) Head & cheeks (facing left, gently tucked into shoulders)
  vec2 headCenter = vec2(-0.302, -0.010);
  vec2 hp = p - headCenter;
  // Slightly wider cheeks, subtly tapered nose to the left
  float cheekW = 0.102 + 0.012 * smoothstep(-0.04, 0.05, hp.x);
  float dHead = length(vec2(hp.x / 1.08, hp.y / (cheekW / 0.102))) - 0.102;
  // Soft subtle nose/muzzle taper on far left
  float dMuzzle = length((hp - vec2(-0.075, 0.002)) / vec2(0.055, 0.052)) - 0.65;
  dHead = smin(dHead, dMuzzle * 0.052, 0.028);

  // Smooth blend head into shoulders
  float dBody = smin(dTorso, dHead, 0.048);

  // 3) Left & Right Cat Ears (animated by ear squish physics!)
  // Left ear (top side, negative y)
  vec2 lEarBase = headCenter + vec2(-0.015 + uLeftEarSquish * 0.022, -0.068 - uLeftEarSquish * 0.014);
  float lAngle = 2.42 - uLeftEarSquish * 0.52;
  vec2 lLocal = rot2d(p - lEarBase, -lAngle);
  float lLen = 0.088 * (1.0 - uLeftEarSquish * 0.12);
  float dLeftEar = sdEarTriangle(lLocal, 0.042, lLen) - 0.009;
  float lInner = smoothstep(0.006, -0.014, sdEarTriangle(lLocal - vec2(-0.007, 0.012), 0.022, lLen * 0.68));

  // Right ear (bottom side, positive y)
  vec2 rEarBase = headCenter + vec2(-0.015 + uRightEarSquish * 0.022, 0.068 + uRightEarSquish * 0.014);
  float rAngle = 0.72 + uRightEarSquish * 0.52;
  vec2 rLocal = rot2d(p - rEarBase, -rAngle);
  float rLen = 0.088 * (1.0 - uRightEarSquish * 0.12);
  float dRightEar = sdEarTriangle(rLocal, 0.042, rLen) - 0.009;
  float rInner = smoothstep(0.006, -0.014, sdEarTriangle(rLocal - vec2(0.007, 0.012), 0.022, rLen * 0.68));

  float dEars = min(dLeftEar, dRightEar);
  float dHeadAndEars = smin(dBody, dEars, 0.014);

  // 4) Smooth 13-Point Catmull-Rom Articulated Tail (zero polygonal creases!)
  float dTail = 1e5;
  float bestTailT = 0.0;
  vec2 bestTailTan = vec2(1.0, 0.0);
  for (int i = 0; i < 12; i++) {
    float st;
    vec2 tanVec;
    float segD = sdSegment(p, uTail[i], uTail[i + 1], st, tanVec);
    float globalT = (float(i) + st) / 12.0;
    // Graceful organic taper: thicker at root, sleek toward tip (bushier plume for longhairs)
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

  // Masks
  g.headMask = smoothstep(0.045, -0.055, dHead);
  g.earMask = smoothstep(0.015, -0.012, dEars);
  g.earInner = max(lInner, rInner) * g.earMask;
  g.tailMask = smoothstep(0.025, -0.022, dTail) * smoothstep(-0.02, 0.05, dTorso);
  g.ruffMask = exp(-pow((p.x + 0.22) / 0.085, 2.0)) * smoothstep(0.02, -0.04, dBody);

  // 5) 2.5D Volumetric Dome Height blended smoothly with smax (zero neck/tail seams!)
  float bodyEdge = clamp(-dTorso / (spineProfile * 0.98), 0.0, 1.0);
  float torsoH = pow(sin(bodyEdge * 1.570796), 0.62) * 0.92;
  torsoH *= 1.0 + 0.08 * smoothstep(-0.05, 0.14, p.x);
  torsoH += uBreath * 0.065 * exp(-pow((p.x + 0.02) / 0.14, 2.0)) * torsoH;
  torsoH += uRumpLift * 0.10 * exp(-pow((p.x - 0.14) / 0.11, 2.0)) * torsoH;

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

  // 6) Analytical Natural Fur Flow Field
  // Head radiates from nose backward over forehead/cheeks
  vec2 headFlow = normalize(p - (headCenter + vec2(-0.11, 0.0)) + vec2(1e-4, 0.0));
  // Torso sweeps left-to-right (+X) while gently fanning downward along curved flanks
  vec2 torsoFlow = normalize(vec2(1.0, (p.y / max(0.12, widthFactor)) * 0.62));
  // Ears sweep outward along ear axis
  vec2 lEarDir = rot2d(vec2(0.0, 1.0), lAngle);
  vec2 rEarDir = rot2d(vec2(0.0, 1.0), rAngle);
  vec2 earFlow = dLeftEar < dRightEar ? lEarDir : rEarDir;

  vec2 flow = mix(torsoFlow, headFlow, smoothstep(-0.18, -0.27, p.x));
  flow = mix(flow, earFlow, g.earMask * 0.85);
  flow = mix(flow, bestTailTan, g.tailMask * 0.92);
  g.flow = normalize(flow + vec2(1e-4, 0.0));

  return g;
}

// ---------- Procedural Coat Patterns (Sampled at Hair Root for Feathered Real Edges!) ----------

vec3 evalCoatColor(vec2 p, CatGeom g) {
  // Normalize torso Y by torsoWidth so coat markings scale naturally with chonkiness
  float torsoWeight = smoothstep(-0.29, -0.09, p.x) * smoothstep(0.29, 0.10, p.x);
  float wF = mix(1.0, uTorsoWidth, torsoWeight);
  vec2 mp = vec2(p.x, p.y / wF);

  // Subtle organic warp so stripes & patches look biological, never mathematical
  vec2 warp = vec2(
    fbm2(mp * 3.1 + vec2(uPatternSeed, 1.7)) - 0.5,
    fbm2(mp * 3.1 + vec2(4.2, uPatternSeed * 1.3)) - 0.5
  ) * 0.085;
  vec2 wp = mp + warp;

  vec3 col = uPrimaryColor;

  if (uPatternType == 0) {
    // Solid (Black, White, Blue Grey): subtle organic spine/flank richness
    float mott = fbm2(wp * 4.5 + uPatternSeed);
    float flankLight = smoothstep(0.05, 0.16, abs(mp.y));
    col = mix(uPrimaryColor, uSecondaryColor, mott * 0.35 + flankLight * 0.18);
    col = mix(col, uTertiaryColor, (1.0 - g.height) * 0.20);
  } else if (uPatternType == 1) {
    // Mackerel Tabby (Orange, Silver, Brown, Siberian) — crisp organic stripes & bold tail rings
    float spineLine = exp(-pow((wp.y + 0.005 * sin(wp.x * 16.0)) / 0.028, 2.0));
    // Curved transverse rib stripes wrapping down the flanks
    float stripePhase = (wp.x * 38.0 + abs(wp.y) * 11.5 + sin(wp.x * 10.0 + uPatternSeed) * 1.35);
    float ribStripes = smoothstep(0.05, 0.68, sin(stripePhase)) * smoothstep(0.18, 0.02, abs(mp.y));
    // Forehead tabby "M" / crown lines
    float headStripes = smoothstep(0.10, 0.65, sin((wp.y * 58.0) + sin(wp.x * 22.0) * 1.3)) * g.headMask;
    // Bold ringed tail bands
    float tailRings = smoothstep(0.02, 0.58, sin(g.tailT * 26.0 + uPatternSeed)) * g.tailMask;

    float darkMask = clamp(max(max(spineLine * 0.96, ribStripes * 0.90), max(headStripes * 0.85, tailRings * 0.94)), 0.0, 1.0);
    // Warm lighter belly / chin edge
    float bellyFade = smoothstep(0.11, 0.17, abs(mp.y)) * (1.0 - g.tailMask);
    col = mix(uPrimaryColor, uSecondaryColor, darkMask);
    col = mix(col, uTertiaryColor, bellyFade * 0.48);
  } else if (uPatternType == 2) {
    // Calico (三花猫): crisp creamy-white base with bold organic orange & jet-black patches + ringed tail
    float nOrange = fbm2(wp * 1.45 + vec2(1.4, 2.9));
    float nBlack  = fbm2(wp * 1.55 + vec2(6.8, 0.7));
    float orangePatch = smoothstep(0.50, 0.56, nOrange + 0.08 * sin(mp.x * 5.0));
    float blackPatch  = smoothstep(0.52, 0.58, nBlack - 0.06 * mp.y);

    // Classic calico dark/orange cap on ears & crown
    float headCap = smoothstep(0.47, 0.55, fbm2(wp * 2.1 + 3.1)) * g.headMask;
    // Tail calico rings
    float tailBand = sin(g.tailT * 17.0);
    float tailBlack = smoothstep(0.05, 0.42, tailBand) * g.tailMask;
    float tailOrange = smoothstep(-0.05, -0.42, tailBand) * g.tailMask;

    col = uPrimaryColor;
    col = mix(col, uSecondaryColor, clamp(orangePatch + tailOrange * 0.88, 0.0, 1.0));
    col = mix(col, uTertiaryColor, clamp(blackPatch + headCap * 0.82 + tailBlack * 0.90, 0.0, 1.0));
  } else if (uPatternType == 3) {
    // Bicolor / Tuxedo / Norwegian Forest: white base + organic dark saddle, cap & tail
    float saddleField = fbm2(wp * 2.5 + vec2(uPatternSeed * 0.7, 2.2));
    float dorsalBias = smoothstep(0.135, 0.03, abs(mp.y + 0.02 * sin(mp.x * 7.0)));
    float darkMask = smoothstep(0.42, 0.52, saddleField * 0.65 + dorsalBias * 0.55);
    // Cute symmetrical dark cap over ears/crown with white blaze
    float capMask = g.headMask * smoothstep(0.015, 0.045, abs(mp.y + 0.01)) * smoothstep(-0.37, -0.26, mp.x);
    darkMask = clamp(max(darkMask, max(capMask, g.tailMask * 0.9)), 0.0, 1.0);
    float midBlend = fbm2(wp * 6.0 + uPatternSeed) * 0.25;
    col = mix(uPrimaryColor, mix(uSecondaryColor, uTertiaryColor, midBlend), darkMask);
  } else if (uPatternType == 4) {
    // Tortoiseshell (玳瑁): rich dark chocolate-black marbled with amber/cinnamon brindling
    float m1 = fbm2(wp * 5.8 + vec2(2.1, 4.7));
    float m2 = fbm2(wp * 10.5 + vec2(7.3, 1.9));
    float amber = smoothstep(0.50, 0.68, m1 * 0.65 + m2 * 0.45);
    float cinna = smoothstep(0.42, 0.60, m2);
    col = mix(uPrimaryColor, uTertiaryColor, cinna * 0.65);
    col = mix(col, uSecondaryColor, amber * 0.92);
  } else if (uPatternType == 5) {
    // Siamese Colorpoint: creamy body, dark seal-brown ears, face mask, tail & light dorsal toast
    float maskDist = length((mp - vec2(-0.375, -0.01)) * vec2(1.1, 1.35));
    float facePoint = smoothstep(0.115, 0.04, maskDist);
    float earPoint = g.earMask * 0.95;
    float tailPoint = g.tailMask * smoothstep(0.0, 0.55, g.tailT);
    float dorsalToast = exp(-pow(mp.y / 0.11, 2.0)) * smoothstep(-0.22, 0.16, mp.x) * 0.30;
    float pointMask = clamp(max(max(facePoint, earPoint), tailPoint), 0.0, 1.0);
    col = mix(uPrimaryColor, uTertiaryColor, dorsalToast);
    col = mix(col, uSecondaryColor, pointMask);
  } else if (uPatternType == 6) {
    // Ragdoll: silky cream-white plush coat with misty grey-taupe ears, gentle saddle blush & plume tail
    float earPoint = g.earMask * 0.85;
    float crownBlush = g.headMask * smoothstep(-0.35, -0.26, mp.x) * smoothstep(0.01, 0.055, abs(mp.y + 0.01)) * 0.72;
    float saddleBlush = exp(-pow(mp.y / 0.11, 2.0)) * smoothstep(-0.18, 0.10, mp.x) * smoothstep(0.25, 0.08, mp.x) * 0.36;
    float tailMist = g.tailMask * (0.45 + 0.48 * g.tailT);
    col = mix(uPrimaryColor, uTertiaryColor, clamp(saddleBlush + tailMist * 0.45, 0.0, 1.0));
    col = mix(col, uSecondaryColor, clamp(max(earPoint, max(crownBlush, tailMist * 0.72)), 0.0, 1.0));
  } else {
    // Sphynx: warm velvety rosy-beige skin with subtle darker points & soft dorsal mottling
    float skinMott = fbm2(wp * 4.2 + 2.3);
    float earShade = g.earMask * 0.52;
    float tailShade = g.tailMask * (0.25 + 0.35 * g.tailT);
    col = mix(uPrimaryColor, uTertiaryColor, smoothstep(0.35, 0.75, skinMott) * 0.45);
    col = mix(col, uSecondaryColor, clamp(max(earShade, tailShade), 0.0, 0.75));
  }

  // Blend delicate velvety inner ear recess
  col = mix(col, uEarInnerColor, g.earInner * 0.82);
  return col;
}

// ---------- Window Sunbeam / Moonbeam Pattern ----------

float evalWindowLight(vec2 uv, float heightOffset) {
  // Diagonal sunlit window blinds/curtain beams streaming from top-left
  vec2 shifted = uv + vec2(0.085, 0.072) * heightOffset;
  float sway = sin(uTime * 0.38 + shifted.y * 4.5) * 0.014;
  float diag = shifted.x * 0.78 - shifted.y * 0.62 + sway;

  float beam1 = smoothstep(0.04, 0.14, diag) * smoothstep(0.30, 0.20, diag);
  float beam2 = smoothstep(0.28, 0.38, diag) * smoothstep(0.56, 0.45, diag);
  float beam3 = smoothstep(-0.22, -0.08, diag) * smoothstep(0.04, -0.05, diag) * 0.75;

  // Stronger nearer the top-left window, gently diffusing toward bottom-right
  float windowFalloff = smoothstep(1.38, 0.18, length(shifted * vec2(0.9, 1.05)));
  return clamp((beam1 + beam2 * 0.85 + beam3) * windowFalloff, 0.0, 1.0);
}

// ---------- Procedural Cushion Fallback (used while cushion WebP loads or if missing) ----------

vec3 evalProceduralCushion(vec2 uv) {
  // Warm oatmeal woven linen weave
  float warp = sin(uv.x * 520.0 * uAspect + texNoise(uv * 8.0) * 2.0) * 0.5 + 0.5;
  float weft = sin(uv.y * 520.0 + texNoise(uv * 8.0 + 3.1) * 2.0) * 0.5 + 0.5;
  float weave = mix(warp, weft, 0.5) * 0.065;
  float grain = (fbm2(uv * 16.0) - 0.5) * 0.05;

  vec3 linen = vec3(0.82, 0.76, 0.67) + weave + grain;

  // Rounded cushion edge in top-left corner revealing warm sunlit oak sill & sheer curtain
  float cornerDist = length(max(vec2(0.26, 0.32) - uv * vec2(uAspect * 0.65, 1.0), 0.0));
  float inWindowCorner = smoothstep(0.09, 0.24, cornerDist);
  vec3 windowArea = mix(vec3(0.95, 0.92, 0.87), vec3(0.84, 0.70, 0.52), smoothstep(0.11, 0.16, cornerDist) * smoothstep(0.21, 0.16, cornerDist));
  float seamShadow = 1.0 - 0.18 * exp(-pow((cornerDist - 0.09) / 0.035, 2.0));

  vec3 col = mix(linen * seamShadow, windowArea, inWindowCorner);
  // Subtle natural lens vignette
  float vig = 1.0 - 0.14 * dot(uv - 0.5, uv - 0.5);
  return col * vig;
}

// ---------- Atmospheric Day <-> Moonlight Grading ----------

vec3 applyAtmosphere(vec3 col, float windowBeam) {
  // Daytime warm morning glow
  vec3 dayCol = col * (0.95 + windowBeam * 0.22 * vec3(1.06, 0.99, 0.87));

  // Nighttime tranquil silver-indigo moonlight
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 desat = mix(col, vec3(lum), 0.34);
  vec3 nightAmbient = desat * vec3(0.27, 0.36, 0.54);
  vec3 moonBeam = desat * windowBeam * vec3(0.30, 0.41, 0.62);
  vec3 nightCol = nightAmbient + moonBeam;

  return mix(dayCol, nightCol, uNight);
}

// ---------- Main Fragment ----------

void main() {
  vec2 uv = vUv;
  vec2 catP = stageToCat(uv);

  // 1) Cushion Background (aspect-cover fit)
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

  // Subtle dynamic curtain/window light modulation on cushion
  float bgBeam = evalWindowLight(uv, 0.0);
  bgCol = applyAtmosphere(bgCol, bgBeam * 0.55);

  // 2) Dynamic Contact Shadow + Directional Cast Shadow of the Cat on the Cushion
  // Light comes from top-left (-0.65, -0.55) so cast shadow falls toward bottom-right (+X, +Y)
  CatGeom gHere = evalCat(catP);
  CatGeom gShadow = evalCat(catP - vec2(0.032, 0.042));
  CatGeom gShadowFar = evalCat(catP - vec2(0.052, 0.064));
  float contactAO = smoothstep(0.048, -0.015, gHere.sdf);
  float castShad = smoothstep(0.064, -0.016, gShadow.sdf);
  float softCast = smoothstep(0.095, -0.010, gShadowFar.sdf);
  float shadowStrength = clamp(max(contactAO * 0.56, max(castShad * 0.36, softCast * 0.18)), 0.0, 0.68);
  vec3 shadowTint = mix(vec3(0.42, 0.36, 0.30), vec3(0.18, 0.24, 0.38), uNight);
  bgCol = mix(bgCol, bgCol * shadowTint, shadowStrength);

  // 3) Cat Surface + Multi-Layer 2.5D Fur Rendering
  vec3 sceneCol = bgCol;

  // Coarse culling: only evaluate fur within generous halo around cat silhouette
  float furHalo = 0.032 + uFurLength * 0.048 * max(1.0, uTailFluff);
  if (gHere.sdf < furHalo) {
    vec4 sim = texture(uSimTex, uv);
    float indent = sim.r;
    vec2 comb = (sim.ba - 0.5) * 2.0;

    // Sample neighboring sim indentation to compute tactile fingertip dimple slope!
    vec2 epsUv = vec2(0.004 / uAspect, 0.004);
    float indR = texture(uSimTex, uv + vec2(epsUv.x, 0.0)).r;
    float indL = texture(uSimTex, uv - vec2(epsUv.x, 0.0)).r;
    float indB = texture(uSimTex, uv + vec2(0.0, epsUv.y)).r;
    float indT = texture(uSimTex, uv - vec2(0.0, epsUv.y)).r;
    vec2 indentGrad = vec2(indR - indL, indB - indT) * 14.0;

    // 2.5D curved body normal via finite difference of analytical heightfield
    float eps = 0.006;
    float hR = evalCat(catP + vec2(eps, 0.0)).height;
    float hL = evalCat(catP - vec2(eps, 0.0)).height;
    float hB = evalCat(catP + vec2(0.0, eps)).height;
    float hT = evalCat(catP - vec2(0.0, eps)).height;
    vec2 bodyGrad = vec2(hR - hL, hB - hT) / (2.0 * eps);
    vec3 surfNormal = normalize(vec3(-bodyGrad.x * 0.38 + indentGrad.x, -bodyGrad.y * 0.38 + indentGrad.y, 1.0));

    // Lighting vectors (window top-left)
    vec3 lightDir = normalize(vec3(-0.56, -0.48, 0.68));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfVec = normalize(lightDir + viewDir);

    if (uFurLength < 0.04) {
      // ----- SPHYNX (Ultra-Matte Velvety Peach-Fuzz Suede + Authentic Organic Skin Folds) -----
      float alpha = smoothstep(0.005, -0.005, gHere.sdf);
      if (alpha > 0.001) {
        vec3 baseSkin = evalCoatColor(catP, gHere);
        // Multi-zone organic skin wrinkles: neck scruff, shoulders, brow & tucked haunches
        float neckZone = exp(-pow((catP.x + 0.21) / 0.075, 2.0));
        float browZone = exp(-pow((catP.x + 0.32) / 0.045, 2.0)) * exp(-pow((catP.y + 0.01) / 0.055, 2.0));
        float hipZone  = exp(-pow((catP.x - 0.14) / 0.075, 2.0)) * smoothstep(0.02, 0.12, abs(catP.y));
        float warpW = (fbm2(catP * 5.8 + 1.4) - 0.5) * 3.8;

        // Curved transverse skin fold ridges + soft crease shadows
        float fNeck = sin(catP.x * 145.0 + warpW + abs(catP.y) * 18.0) * neckZone;
        float fBrow = sin(catP.x * 165.0 + warpW * 0.7) * browZone * 0.65;
        float fHip  = sin((catP.x - abs(catP.y) * 0.6) * 120.0 + warpW) * hipZone * 0.80;
        float foldVal = fNeck + fBrow + fHip;
        float creaseAO = 1.0 - clamp(-foldVal, 0.0, 1.0) * 0.22;

        // Micro suede peach-fuzz grain (breaks up any plastic smoothness!)
        float suedeGrain = (texture(uNoiseTex, catP * 6.5).r - 0.5) * 0.065;
        vec3 nSkin = normalize(surfNormal + vec3(foldVal * 0.26 + suedeGrain * 1.4, foldVal * 0.10 + suedeGrain, 0.0));

        // Broad matte Oren-Nayar-like wrapped diffuse (NO shiny plastic highlight!)
        float wrap = clamp((dot(nSkin, lightDir) + 0.62) / 1.62, 0.0, 1.0);
        // Soft velvety peach-fuzz grazing scatter around silhouette edges
        float velvetRim = pow(1.0 - max(0.0, nSkin.z), 1.9) * 0.24;

        float catBeam = evalWindowLight(uv, gHere.height * 0.42);
        vec3 lit = (baseSkin + suedeGrain * 0.45) * (0.44 + 0.58 * wrap) * creaseAO
          + mix(vec3(0.95, 0.84, 0.78), vec3(0.62, 0.74, 0.92), uNight) * velvetRim;
        // Tactile indentation occlusion under fingertips
        lit *= 1.0 - indent * 0.30;
        // Soft belly ambient occlusion near cushion
        lit *= 0.72 + 0.28 * smoothstep(0.0, 0.36, gHere.height);
        lit = applyAtmosphere(lit, catBeam);
        sceneCol = mix(sceneCol, lit, alpha);
      }
    } else {
      // ----- MULTI-LAYER 2.5D SHELL FUR MARCH (20 Volumetric Layers!) -----
      // Local fur length adapts per anatomical region (sleek head, plush back, fluffy ruff & tail)
      float localLen = uFurLength
        * mix(1.0, 0.46, gHere.headMask)
        * mix(1.0, 0.38, gHere.earMask)
        * (1.0 + gHere.ruffMask * 0.55 * uRuffFluff)
        * mix(1.0, max(0.75, uTailFluff), gHere.tailMask);

      // Combed displacement vector tilts fur strands organically
      vec2 baseFlow = gHere.flow;
      vec2 combLocal = vec2(comb.x, comb.y);
      vec2 effDir = normalize(baseFlow + combLocal * 1.65 + vec2(1e-4, 0.0));

      // How much are we stroking AGAINST the natural fur grain?
      // Against-grain ruffling lifts fur slightly & exposes richer undercoat contrast!
      float againstGrain = clamp(-dot(baseFlow, combLocal), 0.0, 1.0);
      float combAmount = length(combLocal);

      vec3 accumCol = vec3(0.0);
      float accumAlpha = 0.0;

      const int LAYERS = 20;
      for (int i = LAYERS - 1; i >= 0; i--) {
        if (accumAlpha > 0.985) break;

        float h = float(i) / float(LAYERS - 1); // 1.0 at fur tips -> 0.0 at skin root

        // Offset sample backward along effective fur direction so tips overhang silhouette cleanly!
        float overhang = h * (0.012 + localLen * 0.036);
        vec2 pLayer = catP
          - effDir * overhang
          - combLocal * (h * 0.015 * (0.6 + 0.6 * localLen))
          + vec2(surfNormal.x, surfNormal.y) * (h * 0.008);

        CatGeom gLayer = evalCat(pLayer);

        // Soft silhouette expansion for wispy edge fur
        float edgeSlack = h * (0.006 + localLen * 0.016);
        if (gLayer.sdf > edgeSlack) continue;

        float bodyCov = smoothstep(edgeSlack, -0.008, gLayer.sdf);

        // Sample directional multi-scale fur fiber density aligned with effDir
        float fiber = sampleFurFiber(pLayer + vec2(h * 0.012, -h * 0.009), effDir, uFurClump);

        // Taper strands cleanly from solid undercoat at h=0 to delicate fine tips at h=1
        float layerAlpha;
        if (i == 0) {
          layerAlpha = bodyCov;
        } else {
          float threshold = h * (0.76 - againstGrain * 0.10);
          float strand = smoothstep(threshold, threshold + 0.24, fiber);
          // Slightly sparser at very outermost wispy rim for natural soft silhouette
          float edgeSoft = mix(0.62, 1.0, smoothstep(0.006, -0.025, gLayer.sdf));
          layerAlpha = strand * bodyCov * edgeSoft * (0.34 + 0.28 * (1.0 - h));
        }

        if (layerAlpha < 0.004) continue;

        // Evaluate coat color at hair ROOT so patches & stripes have feathery furry borders!
        vec3 coat = evalCoatColor(pLayer, gLayer);

        // Root-to-tip self-shadowing AO + slight warmer/deeper undercoat at roots
        float rootAO = mix(0.36, 1.06, pow(h, 0.62));
        // Pressed-down indentation dims the dimple realistically
        float pressAO = 1.0 - indent * mix(0.46, 0.22, h);
        // Subtle belly curvature AO near cushion contact
        float bellyAO = 0.70 + 0.30 * smoothstep(0.0, 0.36, gLayer.height);

        // Wrapped diffuse lighting for plush fur subsurface scattering
        vec3 tuftN = normalize(surfNormal + vec3((fiber - 0.5) * 0.45 * effDir, 0.0));
        float ndl = dot(tuftN, lightDir);
        float wrapDiff = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);

        // Kajiya-Kay inspired anisotropic fur sheen along strand tangent (scaled gently for dark coats so black stays rich!)
        vec3 tangent3 = normalize(vec3(effDir * (0.85 - againstGrain * 0.25), 0.32 + againstGrain * 0.35));
        float tdh = dot(tangent3, halfVec);
        float sinTH = sqrt(max(0.0, 1.0 - tdh * tdh));
        float coatLum = dot(coat, vec3(0.299, 0.587, 0.114));
        float sheenScale = mix(0.45, 1.0, smoothstep(0.04, 0.35, coatLum));
        float sheenSpec = pow(sinTH, 18.0) * uSheen * sheenScale * (0.10 + 0.18 * h) * (0.35 + 0.65 * wrapDiff);
        // Subtle silhouette rim light (kept restrained to avoid haloing on outer tips)
        float rim = pow(1.0 - max(0.0, tuftN.z), 2.8) * h * 0.12 * smoothstep(0.008, -0.015, gLayer.sdf);

        // Warm linen cushion bounce light on bottom/right flank
        vec3 bounce = mix(vec3(0.12, 0.095, 0.07), vec3(0.035, 0.055, 0.10), uNight) * (1.0 - wrapDiff) * (0.5 + 0.5 * h);

        // Projected diagonal window sunbeam curving over cat's 2.5D height
        float catBeam = evalWindowLight(uv, (gLayer.height - indent * 0.28) * 0.52);

        vec3 litFur = coat * (0.32 + 0.76 * wrapDiff) * rootAO * pressAO * bellyAO
          + mix(vec3(1.0, 0.96, 0.90), vec3(0.75, 0.86, 1.0), uNight) * (sheenSpec + rim * (0.35 + 0.65 * catBeam))
          + coat * bounce;

        // Subtle color richness shift when fur is ruffled against the grain
        litFur *= 1.0 - againstGrain * combAmount * (1.0 - h) * 0.14;

        litFur = applyAtmosphere(litFur, catBeam);

        // Front-to-back premultiplied alpha compositing (zero fringe/halo!)
        float w = layerAlpha * (1.0 - accumAlpha);
        accumCol += litFur * w;
        accumAlpha += w;
      }

      sceneCol = sceneCol * (1.0 - accumAlpha) + accumCol;
    }
  }

  // 4) Petting Hand + Dynamic Cast Shadow onto Cat & Cushion
  if (uHandVisible > 0.005 && uHasHandTex > 0.5) {
    // Hand sprite scale adapts nicely to viewport height; presses slightly closer/smaller when petting
    float handHeightUv = 0.66 * (1.0 - uHandPress * 0.042);
    float handAspect = uHandTexSize.x / max(1.0, uHandTexSize.y);
    float handWidthUv = handHeightUv * handAspect;

    // Anchor point in sprite UV: upper-middle palm/fingertips sit right at pointer!
    vec2 anchorUv = vec2(0.50, 0.33);

    // 4a) Soft cast shadow under hand (tightens & darkens as hand presses into fur!)
    vec2 shadowOffset = vec2(0.022, 0.026) * (1.15 - uHandPress * 0.68);
    vec2 sd = uv - (uHandPos + shadowOffset);
    sd.x *= uAspect;
    vec2 sRot = rot2d(sd, -uHandAngle);
    vec2 sUv = vec2(sRot.x / handWidthUv, sRot.y / handHeightUv) + anchorUv;
    // Seamlessly extend knit sleeve down past bottom of frame so wrist never floats!
    if (sUv.y > 0.94) {
      sUv.y = 0.84 + abs(mod(sUv.y - 0.94, 0.20) - 0.10);
    }
    if (sUv.x > 0.0 && sUv.x < 1.0 && sUv.y > 0.0 && sUv.y < 1.0) {
      // Softened 5-tap blur of hand alpha for natural diffused shadow
      float b = mix(0.024, 0.011, uHandPress);
      float sa = texture(uHandTex, sUv).a * 0.36
        + texture(uHandTex, sUv + vec2( b,  0.0)).a * 0.16
        + texture(uHandTex, sUv + vec2(-b,  0.0)).a * 0.16
        + texture(uHandTex, sUv + vec2( 0.0,  b)).a * 0.16
        + texture(uHandTex, sUv + vec2( 0.0, -b)).a * 0.16;
      float sOpacity = sa * uHandVisible * mix(0.24, 0.44, uHandPress);
      sceneCol *= 1.0 - sOpacity * vec3(0.92, 0.96, 1.0);
    }

    // 4b) Photorealistic Hand Sprite (color-graded to match Daylight / Moonlight!)
    vec2 hd = uv - uHandPos;
    hd.x *= uAspect;
    vec2 hRot = rot2d(hd, -uHandAngle);
    vec2 hUv = vec2(hRot.x / handWidthUv, hRot.y / handHeightUv) + anchorUv;
    // Seamlessly extend knit sleeve down to bottom edge of stage
    if (hUv.y > 0.94) {
      hUv.y = 0.84 + abs(mod(hUv.y - 0.94, 0.20) - 0.10);
    }
    if (hUv.x > 0.0 && hUv.x < 1.0 && hUv.y > 0.0 && hUv.y < 1.0) {
      vec4 handSample = texture(uHandTex, hUv);
      if (handSample.a > 0.005) {
        float handBeam = evalWindowLight(uv, 0.65);
        vec3 handLit = applyAtmosphere(handSample.rgb, handBeam * 0.45);
        sceneCol = mix(sceneCol, handLit, handSample.a * uHandVisible);
      }
    }
  }

  // Gentle photographic S-curve tone finish
  sceneCol = clamp(sceneCol, 0.0, 1.0);
  sceneCol = mix(sceneCol, sceneCol * sceneCol * (3.0 - 2.0 * sceneCol), 0.12);

  fragColor = vec4(sceneCol, 1.0);
}
`;
