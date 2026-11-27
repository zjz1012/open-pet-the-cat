import { CAT_BREEDS, type CatBreed, type CoatPatternType } from '../breeds';

export type AtmosphereMode = 'day' | 'rain' | 'night';
export type CatTemperament = 'angel' | 'normal' | 'spicy';

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
}

export const PATTERN_OPTIONS: { value: CoatPatternType; label: string }[] = [
  { value: 'solid', label: '纯色' },
  { value: 'tabby', label: '虎斑' },
  { value: 'calico', label: '三花' },
  { value: 'bicolor', label: '奶牛 / 八字' },
  { value: 'tortie', label: '玳瑁' },
  { value: 'colorpoint', label: '重点色（暹罗）' },
  { value: 'ragdoll', label: '布偶渐变' },
  { value: 'sphynx', label: '斯芬克斯无毛' },
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

export function encodeSharedCatHash(state: SharedCatState): string {
  const p = state.profile;
  const payload = {
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
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#cat=${b64}`;
}

export function decodeSharedCatHash(hash: string): SharedCatState | null {
  if (!hash.startsWith('#cat=')) return null;
  try {
    const raw = hash.slice(5).replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '==='.slice((raw.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const d = JSON.parse(json) as Record<string, unknown>;
    if (!d || typeof d !== 'object') return null;

    const fallbackBreed =
      (typeof d.b === 'string' && CAT_BREEDS.find((b) => b.id === d.b)) || CAT_BREEDS[2];
    const base = profileFromBreed(fallbackBreed);

    const validPatterns = new Set(PATTERN_OPTIONS.map((o) => o.value));
    const pat = typeof d.pt === 'string' && validPatterns.has(d.pt as CoatPatternType)
      ? (d.pt as CoatPatternType)
      : base.pattern;

    const temp: CatTemperament =
      d.tp === 'angel' || d.tp === 'spicy' ? d.tp : 'normal';

    const profile: CustomCatProfile = {
      name: typeof d.n === 'string' && d.n.trim() ? d.n.trim().slice(0, 16) : base.name,
      pattern: pat,
      primaryHex: typeof d.c1 === 'string' ? d.c1 : base.primaryHex,
      secondaryHex: typeof d.c2 === 'string' ? d.c2 : base.secondaryHex,
      tertiaryHex: typeof d.c3 === 'string' ? d.c3 : base.tertiaryHex,
      earInnerHex: typeof d.ce === 'string' ? d.ce : base.earInnerHex,
      furLength: typeof d.fl === 'number' ? Math.max(0, Math.min(1, d.fl)) : base.furLength,
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

    const atmosphere: AtmosphereMode =
      d.a === 'rain' || d.a === 'night' ? d.a : 'day';

    return {
      atmosphere,
      presetBreedId: typeof d.b === 'string' ? d.b : null,
      profile,
    };
  } catch {
    return null;
  }
}

export function exportPolaroidSnapshot(
  sourceCanvas: HTMLCanvasElement,
  catName: string,
  subtitle: string,
  atmosphere: AtmosphereMode,
): void {
  const padX = 48;
  const padTop = 48;
  const padBottom = 136;
  const photoW = 1080;
  const photoH = Math.round((photoW * sourceCanvas.height) / Math.max(1, sourceCanvas.width));

  const out = document.createElement('canvas');
  out.width = photoW + padX * 2;
  out.height = photoH + padTop + padBottom;
  const ctx = out.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = atmosphere === 'night' ? '#1c2432' : '#fcf8f1';
  ctx.fillRect(0, 0, out.width, out.height);

  ctx.strokeStyle = atmosphere === 'night' ? 'rgba(200,220,250,0.12)' : 'rgba(80,60,40,0.10)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, out.width - 4, out.height - 4);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(padX, padTop, photoW, photoH, 10);
  ctx.clip();
  ctx.drawImage(sourceCanvas, padX, padTop, photoW, photoH);
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(padX, padTop, photoW, photoH, 10);
  ctx.stroke();

  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const modeLabel = atmosphere === 'rain' ? '雨天午后' : atmosphere === 'night' ? '月光时刻' : '晴日暖阳';

  ctx.fillStyle = atmosphere === 'night' ? '#dce8fa' : '#3d332a';
  ctx.font = '600 32px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
  ctx.fillText(catName, padX + 6, padTop + photoH + 64);

  ctx.fillStyle = atmosphere === 'night' ? '#8b9bb2' : '#8d7d6c';
  ctx.font = '400 22px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
  ctx.fillText(`${subtitle} · ${modeLabel}`, padX + 6, padTop + photoH + 102);

  ctx.textAlign = 'right';
  ctx.font = '500 22px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(dateStr, out.width - padX - 6, padTop + photoH + 98);

  const link = document.createElement('a');
  link.download = `pet-the-cat-${Date.now()}.png`;
  link.href = out.toDataURL('image/png');
  link.click();
}
