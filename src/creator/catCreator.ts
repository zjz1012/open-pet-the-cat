import { CAT_BREEDS, type CatBreed, type CoatPatternType } from '../breeds';
import type { PurrVoicePreference } from '../audio/purrEngine';

export type AtmosphereMode = 'day' | 'rain' | 'night';
export type CatTemperament = 'angel' | 'normal' | 'spicy';
export type PolaroidStyleId = 'cream' | 'sakura' | 'film' | 'sticker';

export const POLAROID_STYLE_OPTIONS: {
  id: PolaroidStyleId;
  label: string;
  swatch: string;
}[] = [
  { id: 'cream', label: '奶油经典', swatch: 'linear-gradient(135deg, #fcf8f1, #e8dcc8)' },
  { id: 'sakura', label: '樱花粉萌', swatch: 'linear-gradient(135deg, #ffe5ee, #f8b4cb)' },
  { id: 'film', label: '复古胶片', swatch: 'linear-gradient(135deg, #2b2622, #151210)' },
  { id: 'sticker', label: '手账贴纸', swatch: 'linear-gradient(135deg, #fff6d6, #ffd7a8)' },
];

export interface CustomCatProfile {
  name: string;
  pattern: CoatPatternType;
  primaryHex: string;
  secondaryHex: string;
  tertiaryHex: string;
  earInnerHex: string;
  furLength: number; // 0..1
  furClump: number; // 0.1..0.9
  tailFluff: number; // 0.6..1.65
  ruffFluff: number; // 0..1
  sheen: number; // 0.3..1.0
  patternSeed: number; // 0.5..99.5
  purrHz: number; // 21..29
  temperament: CatTemperament;
  sizeIdx: number; // 0..10
  widthIdx: number; // 0..10
}

export interface SharedCatState {
  atmosphere: AtmosphereMode;
  presetBreedId: string | null;
  profile: CustomCatProfile;
  /** Optional cloud-saved audio & camera preferences */
  purrVolume?: number; // 5..100
  purrVoice?: PurrVoicePreference;
  polaroidStyle?: PolaroidStyleId;
}

export const PATTERN_OPTIONS: { value: CoatPatternType; label: string }[] = [
  { value: 'solid', label: '纯色' },
  { value: 'tabby', label: '虎斑' },
  { value: 'calico', label: '三花' },
  { value: 'bicolor', label: '奶牛 / 八字' },
  { value: 'tortie', label: '玳瑁' },
  { value: 'colorpoint', label: '重点色（暹罗）' },
  { value: 'ragdoll', label: '布偶渐变' },
];

export const TEMPERAMENT_OPTIONS: { value: CatTemperament; label: string; desc: string }[] = [
  { value: 'angel', label: '天使粘人', desc: '超好脾气，怎么撸都呼噜' },
  { value: 'normal', label: '傲娇主子', desc: '顺毛呼噜，逆毛猛搓会炸毛' },
  { value: 'spicy', label: '暴躁大佬', desc: '脾气火爆，碰逆毛/尾巴秒炸' },
];

/** Curated biological feline coat colors so custom cats always look natural & lifelike */
export const NATURAL_COAT_SWATCHES: { name: string; hex: string }[] = [
  { name: '炭黑', hex: '#141315' },
  { name: '深褐', hex: '#382921' },
  { name: '焦糖棕', hex: '#7f6246' },
  { name: '暖橘', hex: '#d47c34' },
  { name: '奶油杏', hex: '#e5c8a2' },
  { name: '雪白', hex: '#efeae3' },
  { name: '银灰', hex: '#9ea4ad' },
  { name: '蓝灰', hex: '#68717d' },
  { name: '肉桂粉', hex: '#d2aa96' },
];

const RANDOM_NAMES = [
  '麻薯', '煤球', '橘座', '奶盖', '年糕', '豆包', '大福', '布丁', '汤圆', '蛋黄', '芝麻', '松果', '栗子', '雪球',
];

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (
    '#' +
    [toByte(r), toByte(g), toByte(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return [0.85, 0.82, 0.78];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Number.isFinite(r) ? r : 0.85, Number.isFinite(g) ? g : 0.82, Number.isFinite(b) ? b : 0.78];
}

export function profileFromBreed(
  breed: CatBreed,
  sizeIdx = 5,
  widthIdx = 5,
  temperament: CatTemperament = 'normal',
): CustomCatProfile {
  return {
    name: breed.nameZh,
    pattern: breed.pattern,
    primaryHex: rgbToHex(breed.primaryColor),
    secondaryHex: rgbToHex(breed.secondaryColor),
    tertiaryHex: rgbToHex(breed.tertiaryColor),
    earInnerHex: rgbToHex(breed.earInnerColor),
    furLength: breed.furLength,
    furClump: breed.furClump,
    tailFluff: breed.tailFluff,
    ruffFluff: breed.ruffFluff,
    sheen: breed.sheen,
    patternSeed: breed.patternSeed,
    purrHz: breed.purrHz,
    temperament,
    sizeIdx,
    widthIdx,
  };
}

export function breedFromProfile(profile: CustomCatProfile): CatBreed {
  const isSphynx = profile.pattern === 'sphynx';
  return {
    id: 'custom',
    nameZh: profile.name.trim() || '我的小猫',
    nameEn: 'Custom Cat',
    nameJa: profile.name.trim() || 'カスタム猫',
    pattern: profile.pattern,
    primaryColor: hexToRgb(profile.primaryHex),
    secondaryColor: hexToRgb(profile.secondaryHex),
    tertiaryColor: hexToRgb(profile.tertiaryHex),
    earInnerColor: hexToRgb(profile.earInnerHex),
    furLength: isSphynx ? 0 : profile.furLength,
    furClump: isSphynx ? 0.08 : profile.furClump,
    sheen: profile.sheen,
    patternSeed: profile.patternSeed,
    tailFluff: isSphynx ? 0.62 : profile.tailFluff,
    ruffFluff: isSphynx ? 0 : profile.ruffFluff,
    purrHz: profile.purrHz,
    swatchGradient: `linear-gradient(135deg, ${profile.primaryHex}, ${profile.secondaryHex})`,
  };
}

/** Procedurally rolls a believable, aesthetically pleasing custom cat! */
export function generateRandomCatProfile(): CustomCatProfile {
  const baseBreed = CAT_BREEDS[Math.floor(Math.random() * CAT_BREEDS.length)];
  const p = profileFromBreed(baseBreed);

  // Occasionally remix coat colors from natural feline swatches for delightful surprises
  if (Math.random() < 0.6 && p.pattern !== 'sphynx') {
    const pick = () => NATURAL_COAT_SWATCHES[Math.floor(Math.random() * NATURAL_COAT_SWATCHES.length)].hex;
    p.primaryHex = pick();
    p.secondaryHex = pick();
    p.tertiaryHex = pick();
  }

  p.name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  p.patternSeed = Number((1 + Math.random() * 88).toFixed(2));
  if (p.pattern !== 'sphynx') {
    p.furLength = Number((0.40 + Math.random() * 0.58).toFixed(2));
    p.tailFluff = Number((0.82 + p.furLength * 0.72).toFixed(2));
    p.ruffFluff = Number(Math.max(0, (p.furLength - 0.45) * 1.65).toFixed(2));
  }
  p.sizeIdx = 3 + Math.floor(Math.random() * 6); // 3..8
  p.widthIdx = 3 + Math.floor(Math.random() * 7); // 3..9
  p.purrHz = Number((22 + Math.random() * 6).toFixed(1));
  const temps: CatTemperament[] = ['angel', 'normal', 'normal', 'spicy'];
  p.temperament = temps[Math.floor(Math.random() * temps.length)];
  return p;
}

/** Encodes shared / cloud-saved cat state as raw URL-safe base64 token (<= 400 bytes) */
export function encodeSharedCatToken(state: SharedCatState): string {
  const p = state.profile;
  const payload: Record<string, unknown> = {
    a: state.atmosphere,
    b: state.presetBreedId,
    n: p.name,
    pt: p.pattern,
    c1: p.primaryHex,
    c2: p.secondaryHex,
    c3: p.tertiaryHex,
    ce: p.earInnerHex,
    fl: Number(p.furLength.toFixed(2)),
    fc: Number(p.furClump.toFixed(2)),
    tf: Number(p.tailFluff.toFixed(2)),
    rf: Number(p.ruffFluff.toFixed(2)),
    sh: Number(p.sheen.toFixed(2)),
    sd: Number(p.patternSeed.toFixed(2)),
    hz: Number(p.purrHz.toFixed(1)),
    tp: p.temperament,
    si: p.sizeIdx,
    wi: p.widthIdx,
  };
  if (typeof state.purrVolume === 'number') {
    payload.pv = Math.max(5, Math.min(100, Math.round(state.purrVolume)));
  }
  if (state.purrVoice) {
    payload.vv = state.purrVoice;
  }
  if (state.polaroidStyle) {
    payload.ps = state.polaroidStyle;
  }
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function encodeSharedCatHash(state: SharedCatState): string {
  return `#cat=${encodeSharedCatToken(state)}`;
}

/** Decodes shared / cloud-saved cat state from query (?cat=...), hash (#cat=...), or raw base64 token */
export function decodeSharedCatState(input: string): SharedCatState | null {
  let token = '';
  if (input.startsWith('#cat=')) {
    token = input.slice(5);
  } else if (input.includes('cat=')) {
    const params = new URLSearchParams(input.replace(/^[?#]/, ''));
    token = params.get('cat') || '';
  } else if (input.length > 12) {
    token = input;
  }
  if (!token) return null;

  try {
    const raw = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '==='.slice((raw.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const d = JSON.parse(json) as Record<string, unknown>;
    if (!d || typeof d !== 'object') return null;

    const matchedPreset = typeof d.b === 'string' ? CAT_BREEDS.find((b) => b.id === d.b) : undefined;
    const fallbackBreed = matchedPreset || CAT_BREEDS[1] || CAT_BREEDS[0];
    const base = profileFromBreed(fallbackBreed);

    const validPatterns = new Set(PATTERN_OPTIONS.map((o) => o.value));
    const pat =
      typeof d.pt === 'string' && validPatterns.has(d.pt as CoatPatternType)
        ? (d.pt as CoatPatternType)
        : base.pattern;

    const temp: CatTemperament = d.tp === 'angel' || d.tp === 'spicy' ? d.tp : 'normal';

    const profile: CustomCatProfile = {
      name: typeof d.n === 'string' && d.n.trim() ? d.n.trim().slice(0, 16) : base.name,
      pattern: pat,
      primaryHex: typeof d.c1 === 'string' ? d.c1 : base.primaryHex,
      secondaryHex: typeof d.c2 === 'string' ? d.c2 : base.secondaryHex,
      tertiaryHex: typeof d.c3 === 'string' ? d.c3 : base.tertiaryHex,
      earInnerHex: typeof d.ce === 'string' ? d.ce : base.earInnerHex,
      furLength: typeof d.fl === 'number' ? Math.max(0.2, Math.min(1, d.fl)) : base.furLength,
      furClump: typeof d.fc === 'number' ? Math.max(0.08, Math.min(0.95, d.fc)) : base.furClump,
      tailFluff: typeof d.tf === 'number' ? Math.max(0.55, Math.min(1.7, d.tf)) : base.tailFluff,
      ruffFluff: typeof d.rf === 'number' ? Math.max(0, Math.min(1.1, d.rf)) : base.ruffFluff,
      sheen: typeof d.sh === 'number' ? Math.max(0.2, Math.min(1, d.sh)) : base.sheen,
      patternSeed: typeof d.sd === 'number' ? d.sd : base.patternSeed,
      purrHz: typeof d.hz === 'number' ? Math.max(20, Math.min(30, d.hz)) : base.purrHz,
      temperament: temp,
      sizeIdx: typeof d.si === 'number' ? Math.max(0, Math.min(10, Math.round(d.si))) : 5,
      widthIdx: typeof d.wi === 'number' ? Math.max(0, Math.min(10, Math.round(d.wi))) : 5,
    };

    const atmosphere: AtmosphereMode = d.a === 'rain' || d.a === 'night' ? d.a : 'day';
    const purrVolume = typeof d.pv === 'number' ? Math.max(5, Math.min(100, Math.round(d.pv))) : undefined;
    const purrVoice: PurrVoicePreference | undefined =
      d.vv === 'auto' || d.vv === 'warm' || d.vv === 'deep' || d.vv === 'soft' ? d.vv : undefined;
    const polaroidStyle: PolaroidStyleId | undefined =
      d.ps === 'cream' || d.ps === 'sakura' || d.ps === 'film' || d.ps === 'sticker' ? d.ps : undefined;

    return {
      atmosphere,
      presetBreedId: matchedPreset ? matchedPreset.id : null,
      profile,
      purrVolume,
      purrVoice,
      polaroidStyle,
    };
  } catch {
    return null;
  }
}

function drawPawIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  // Main pad
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.25, r * 0.56, r * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  // 4 toes
  const toes: [number, number, number][] = [
    [-0.58, -0.22, -0.25],
    [-0.22, -0.52, -0.08],
    [0.22, -0.52, 0.08],
    [0.58, -0.22, 0.25],
  ];
  for (const [tx, ty, rot] of toes) {
    ctx.beginPath();
    ctx.ellipse(cx + tx * r, cy + ty * r, r * 0.21, r * 0.27, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSakuraBlossom(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 5);
    ctx.fillStyle = i % 2 === 0 ? '#ffbfd3' : '#ffd2e1';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(r * 0.48, -r * 0.35, r * 0.28, -r * 0.92);
    ctx.lineTo(0, -r * 0.72);
    ctx.lineTo(-r * 0.28, -r * 0.92);
    ctx.quadraticCurveTo(-r * 0.48, -r * 0.35, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f8a54a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const ax = cx + Math.cos(a) * r;
    const ay = cy + Math.sin(a) * r;
    const mid = a + Math.PI / 4;
    const mx = cx + Math.cos(mid) * r * 0.28;
    const my = cy + Math.sin(mid) * r * 0.28;
    if (i === 0) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
    ctx.lineTo(mx, my);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFishDoodle(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Body oval
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, 0, s * 0.62, s * 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Tail triangle
  ctx.beginPath();
  ctx.moveTo(s * 0.46, 0);
  ctx.lineTo(s * 0.88, -s * 0.34);
  ctx.lineTo(s * 0.88, s * 0.34);
  ctx.closePath();
  ctx.stroke();
  // Eye dot
  ctx.beginPath();
  ctx.arc(-s * 0.44, -s * 0.04, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface PolaroidRenderOptions {
  catName: string;
  subtitle: string;
  atmosphere: AtmosphereMode;
  style: PolaroidStyleId;
  /** Target photo inner width in px (use 520 for live viewfinder preview, 960 for final export) */
  photoWidth?: number;
  /** Whether to draw viewfinder corner brackets & subtle grid (for live preview only!) */
  showViewfinderGuides?: boolean;
}

/**
 * Renders the styled Polaroid card onto a target canvas.
 * Shared identically between the live Polaroid Viewfinder preview and final exported JPEG!
 */
export function drawPolaroidToCanvas(
  out: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  opts: PolaroidRenderOptions,
): boolean {
  const photoW = opts.photoWidth ?? 960;
  const k = photoW / 960;
  const isFilm = opts.style === 'film';
  const padX = Math.round((isFilm ? 68 : 44) * k);
  const padTop = Math.round((isFilm ? 46 : 44) * k);
  const padBottom = Math.round(132 * k);
  const photoH = Math.round((photoW * sourceCanvas.height) / Math.max(1, sourceCanvas.width));

  const targetW = photoW + padX * 2;
  const targetH = photoH + padTop + padBottom;
  if (out.width !== targetW || out.height !== targetH) {
    out.width = targetW;
    out.height = targetH;
  }
  const ctx = out.getContext('2d');
  if (!ctx) return false;

  const isNight = opts.atmosphere === 'night';
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const filmDate = `'${String(now.getFullYear()).slice(2)} ${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}`;
  const modeLabel = opts.atmosphere === 'rain' ? '雨天午后' : isNight ? '月光时刻' : '晴日暖阳';

  // 1) Cardstock Background by Style
  if (opts.style === 'sakura') {
    const grad = ctx.createLinearGradient(0, 0, out.width, out.height);
    grad.addColorStop(0, '#fff5f8');
    grad.addColorStop(1, '#ffe7ef');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, out.width, out.height);

    // Dainty dashed pink inner border
    ctx.save();
    ctx.strokeStyle = 'rgba(229, 134, 168, 0.42)';
    ctx.lineWidth = 2.5 * k;
    ctx.setLineDash([8 * k, 6 * k]);
    ctx.beginPath();
    ctx.roundRect(14 * k, 14 * k, out.width - 28 * k, out.height - 28 * k, 18 * k);
    ctx.stroke();
    ctx.restore();
  } else if (opts.style === 'film') {
    ctx.fillStyle = '#1b1816';
    ctx.fillRect(0, 0, out.width, out.height);

    // Classic 35mm sprocket holes down left and right rails
    ctx.fillStyle = '#332e2a';
    const holeW = 24 * k;
    const holeH = 34 * k;
    const step = 62 * k;
    for (let y = 26 * k; y < out.height - 32 * k; y += step) {
      ctx.beginPath();
      ctx.roundRect(18 * k, y, holeW, holeH, 6 * k);
      ctx.roundRect(out.width - 18 * k - holeW, y, holeW, holeH, 6 * k);
      ctx.fill();
    }
  } else if (opts.style === 'sticker') {
    const grad = ctx.createLinearGradient(0, 0, 0, out.height);
    grad.addColorStop(0, '#fffbeb');
    grad.addColorStop(1, '#fff3d4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, out.width, out.height);

    // Subtle notebook dot grid
    ctx.fillStyle = 'rgba(186, 155, 112, 0.16)';
    for (let y = 24 * k; y < out.height; y += 28 * k) {
      for (let x = 24 * k; x < out.width; x += 28 * k) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Classic Cream Polaroid
    ctx.fillStyle = isNight ? '#1b2331' : '#fcf8f1';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.strokeStyle = isNight ? 'rgba(200,220,250,0.14)' : 'rgba(92,70,48,0.11)';
    ctx.lineWidth = 3 * k;
    ctx.strokeRect(2 * k, 2 * k, out.width - 4 * k, out.height - 4 * k);
  }

  // 2) Live Cat Photo Frame
  const radius = (isFilm ? 6 : 12) * k;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(padX, padTop, photoW, photoH, radius);
  ctx.clip();
  ctx.drawImage(sourceCanvas, padX, padTop, photoW, photoH);

  // Subtle style-specific photographic tint / vignette
  if (opts.style === 'film') {
    const vig = ctx.createRadialGradient(
      padX + photoW * 0.5,
      padTop + photoH * 0.5,
      photoW * 0.25,
      padX + photoW * 0.5,
      padTop + photoH * 0.5,
      photoW * 0.68,
    );
    vig.addColorStop(0, 'rgba(255, 224, 180, 0.03)');
    vig.addColorStop(1, 'rgba(18, 12, 8, 0.34)');
    ctx.fillStyle = vig;
    ctx.fillRect(padX, padTop, photoW, photoH);

    // Retro orange-amber film date imprint inside bottom-right of photo
    ctx.fillStyle = 'rgba(255, 152, 62, 0.90)';
    ctx.shadowColor = 'rgba(255, 108, 22, 0.65)';
    ctx.shadowBlur = 6 * k;
    ctx.font = `700 ${Math.round(24 * k)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(filmDate, padX + photoW - 22 * k, padTop + photoH - 20 * k);
    ctx.shadowBlur = 0;
  } else if (opts.style === 'sakura') {
    const blush = ctx.createLinearGradient(padX, padTop, padX, padTop + photoH);
    blush.addColorStop(0, 'rgba(255, 198, 218, 0.10)');
    blush.addColorStop(1, 'rgba(255, 220, 232, 0.06)');
    ctx.fillStyle = blush;
    ctx.fillRect(padX, padTop, photoW, photoH);
  }

  // Optional Viewfinder Reticle Guides (only in live viewfinder preview, NOT saved photo!)
  if (opts.showViewfinderGuides) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.lineWidth = Math.max(1, 1.4 * k);
    // Rule-of-thirds subtle hairline grid
    ctx.beginPath();
    ctx.moveTo(padX + photoW / 3, padTop);
    ctx.lineTo(padX + photoW / 3, padTop + photoH);
    ctx.moveTo(padX + (photoW * 2) / 3, padTop);
    ctx.lineTo(padX + (photoW * 2) / 3, padTop + photoH);
    ctx.moveTo(padX, padTop + photoH / 3);
    ctx.lineTo(padX + photoW, padTop + photoH / 3);
    ctx.moveTo(padX, padTop + (photoH * 2) / 3);
    ctx.lineTo(padX + photoW, padTop + (photoH * 2) / 3);
    ctx.stroke();

    // Crisp camera corner brackets
    const m = 18 * k;
    const bLen = 28 * k;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
    ctx.lineWidth = Math.max(1.5, 2.8 * k);
    ctx.lineCap = 'round';
    const corners: [number, number, number, number][] = [
      [padX + m, padTop + m, 1, 1],
      [padX + photoW - m, padTop + m, -1, 1],
      [padX + m, padTop + photoH - m, 1, -1],
      [padX + photoW - m, padTop + photoH - m, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * bLen, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * bLen);
      ctx.stroke();
    }

    // Center focus crosshair
    const midX = padX + photoW * 0.5;
    const midY = padTop + photoH * 0.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = Math.max(1, 1.8 * k);
    ctx.beginPath();
    ctx.moveTo(midX - 10 * k, midY);
    ctx.lineTo(midX + 10 * k, midY);
    ctx.moveTo(midX, midY - 10 * k);
    ctx.lineTo(midX, midY + 10 * k);
    ctx.stroke();
  }
  ctx.restore();

  // Inner photo frame stroke
  ctx.strokeStyle = opts.style === 'film' ? 'rgba(255,255,255,0.12)' : 'rgba(60,40,20,0.10)';
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.roundRect(padX, padTop, photoW, photoH, radius);
  ctx.stroke();

  // 3) Style-Specific Cute Decorations!
  if (opts.style === 'sakura') {
    drawSakuraBlossom(ctx, padX + 12 * k, padTop + 10 * k, 24 * k, 0.25);
    drawSakuraBlossom(ctx, padX + photoW - 10 * k, padTop + 18 * k, 18 * k, -0.4);
    drawSakuraBlossom(ctx, out.width - padX - 24 * k, padTop + photoH + 56 * k, 20 * k, 0.6);
    drawPawIcon(ctx, out.width - padX - 76 * k, padTop + photoH + 62 * k, 14 * k, '#f19cb9');
  } else if (opts.style === 'sticker') {
    // Diagonal translucent pastel washi tape strips at top corners
    ctx.save();
    ctx.translate(padX + 26 * k, padTop + 8 * k);
    ctx.rotate(-0.42);
    ctx.fillStyle = 'rgba(155, 218, 198, 0.74)';
    ctx.fillRect(-52 * k, -14 * k, 104 * k, 26 * k);
    ctx.restore();

    ctx.save();
    ctx.translate(padX + photoW - 24 * k, padTop + 10 * k);
    ctx.rotate(0.40);
    ctx.fillStyle = 'rgba(255, 188, 158, 0.78)';
    ctx.fillRect(-52 * k, -14 * k, 104 * k, 26 * k);
    ctx.restore();

    // Cute stickers along bottom margin
    drawSparkle(ctx, padX + photoW - 34 * k, padTop + photoH + 46 * k, 14 * k, '#f2a93b');
    drawSparkle(ctx, padX + photoW - 62 * k, padTop + photoH + 34 * k, 8 * k, '#f0869a');
    drawFishDoodle(ctx, padX + photoW - 116 * k, padTop + photoH + 54 * k, 22 * k, '#d58547');
    drawPawIcon(ctx, padX + 20 * k, padTop + photoH + 52 * k, 13 * k, '#e89d54');
  } else if (opts.style === 'cream') {
    drawPawIcon(
      ctx,
      out.width - padX - 18 * k,
      padTop + photoH + 46 * k,
      12 * k,
      isNight ? 'rgba(190, 212, 245, 0.35)' : 'rgba(160, 128, 96, 0.32)',
    );
  }

  // 4) Caption & Date Typography
  const textLeft = opts.style === 'sticker' ? padX + 46 * k : padX + 8 * k;
  const titleColor =
    opts.style === 'sakura'
      ? '#7c3f56'
      : opts.style === 'film'
        ? '#f0e6d6'
        : opts.style === 'sticker'
          ? '#573c24'
          : isNight
            ? '#dce8fa'
            : '#3d332a';
  const subColor =
    opts.style === 'sakura'
      ? '#b4748c'
      : opts.style === 'film'
        ? '#9c8f80'
        : opts.style === 'sticker'
          ? '#9b7752'
          : isNight
            ? '#8b9bb2'
            : '#8d7d6c';

  ctx.textAlign = 'left';
  ctx.fillStyle = titleColor;
  ctx.font = `600 ${Math.round(31 * k)}px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif`;
  ctx.fillText(opts.catName || '我的小猫', textLeft, padTop + photoH + 58 * k);

  ctx.fillStyle = subColor;
  ctx.font = `400 ${Math.round(20 * k)}px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif`;
  ctx.fillText(`${opts.subtitle} · ${modeLabel}`, textLeft, padTop + photoH + 95 * k);

  ctx.textAlign = 'right';
  ctx.font = `500 ${Math.round(19 * k)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillStyle = opts.style === 'film' ? '#d49a5a' : subColor;
  const rightStamp = opts.style === 'film' ? `CAT 400 · ${dateStr}` : dateStr;
  ctx.fillText(rightStamp, out.width - padX - 8 * k, padTop + photoH + 94 * k);

  return true;
}

/**
 * Generates a Polaroid cardstock image as a crisp JPEG data URL (~180–420 KB,
 * well below Bilibili Toy SDK's 2MB base64 recommendation for saveImageToAlbum & sharePicture).
 */
export function renderPolaroidDataUrl(
  sourceCanvas: HTMLCanvasElement,
  catName: string,
  subtitle: string,
  atmosphere: AtmosphereMode,
  style: PolaroidStyleId = 'cream',
): string | null {
  const out = document.createElement('canvas');
  const ok = drawPolaroidToCanvas(out, sourceCanvas, {
    catName,
    subtitle,
    atmosphere,
    style,
    photoWidth: 960,
    showViewfinderGuides: false,
  });
  if (!ok) return null;
  return out.toDataURL('image/jpeg', 0.90);
}

export async function saveDataUrlInBrowser(dataUrl: string, filename: string): Promise<'shared' | 'downloaded'> {
  // On mobile browsers that support Web Share API with files, offer native save/share sheet cleanly
  const isTouchMobile =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  if (isTouchMobile) {
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const file = new File([blob], filename, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '小猫拍立得留念',
        });
        return 'shared';
      }
    } catch {
      // User cancelled share sheet or unsupported — fall through to direct browser download
    }
  }

  downloadDataUrl(dataUrl, filename);
  return 'downloaded';
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
