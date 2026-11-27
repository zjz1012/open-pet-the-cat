import type { Vec2 } from '../physics/catPhysics';

export type AtmosphereMode = 'day' | 'rain' | 'night';

export interface PaintPaletteColor {
  id: number;
  name: string;
  hex: string;
}

export const PAINT_PALETTE: PaintPaletteColor[] = [
  { id: 0, name: '奶油白', hex: '#f2eee6' },
  { id: 1, name: '暖橘色', hex: '#d47832' },
  { id: 2, name: '炭黑色', hex: '#1d1b1c' },
  { id: 3, name: '焦糖棕', hex: '#7c4c2a' },
  { id: 4, name: '雾蓝灰', hex: '#7c8591' },
  { id: 5, name: '樱花粉', hex: '#e69aa6' },
];

export interface CompactDot {
  /** Quantized 0..255 canvas X */
  x: number;
  /** Quantized 0..255 canvas Y */
  y: number;
  /** Quantized brush radius (4..36 px on 256px canvas) */
  r: number;
  /** Palette index 0..5, or -1 for eraser */
  c: number;
}

export interface SharedCatConfig {
  breedId: string;
  sizeIdx: number;
  widthIdx: number;
  atmosphere: AtmosphereMode;
  dots: CompactDot[];
}

/**
 * Offscreen 256×256 cat-local coat paint canvas.
 * Maps cat-local space x ∈ [-0.55, +0.55], y ∈ [-0.36, +0.36] to texture UV [0..1].
 * Sampled at the hair root inside the 20-layer fur shell shader so every painted
 * stroke renders as real 3D feathered fur!
 */
export class CoatPainter {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dots: CompactDot[] = [];
  private dirty = true;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 256;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to initialize 2D paint canvas');
    this.ctx = ctx;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public markClean(): void {
    this.dirty = false;
  }

  public hasPaint(): boolean {
    return this.dots.length > 0;
  }

  public getDots(): CompactDot[] {
    return this.dots;
  }

  public catLocalToCanvas(local: Vec2): Vec2 {
    const u = (local.x + 0.55) / 1.10;
    const v = (local.y + 0.36) / 0.72;
    return {
      x: Math.round(Math.max(0, Math.min(1, u)) * 255),
      y: Math.round(Math.max(0, Math.min(1, v)) * 255),
    };
  }

  public paintDot(local: Vec2, radiusPx: number, colorIdx: number): void {
    const pt = this.catLocalToCanvas(local);
    const r = Math.max(5, Math.min(36, Math.round(radiusPx)));

    // Avoid redundant duplicate dots on tiny pointer jitter
    const last = this.dots[this.dots.length - 1];
    if (last && last.c === colorIdx && Math.hypot(last.x - pt.x, last.y - pt.y) < Math.max(2, r * 0.28)) {
      return;
    }

    const dot: CompactDot = { x: pt.x, y: pt.y, r, c: colorIdx };
    if (this.dots.length >= 220) {
      // Keep URL hash compact while preserving full canvas appearance
      this.dots.shift();
    }
    this.dots.push(dot);
    this.drawDot(dot);
    this.dirty = true;
  }

  public clear(): void {
    this.dots = [];
    this.ctx.clearRect(0, 0, 256, 256);
    this.dirty = true;
  }

  public loadDots(dots: CompactDot[]): void {
    this.clear();
    for (const d of dots.slice(0, 220)) {
      this.dots.push(d);
      this.drawDot(d);
    }
    this.dirty = true;
  }

  private drawDot(dot: CompactDot): void {
    const ctx = this.ctx;
    ctx.save();
    if (dot.c < 0) {
      ctx.globalCompositeOperation = 'destination-out';
      const grad = ctx.createRadialGradient(dot.x, dot.y, dot.r * 0.2, dot.x, dot.y, dot.r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const palette = PAINT_PALETTE[dot.c] ?? PAINT_PALETTE[0];
      ctx.globalCompositeOperation = 'source-over';
      const grad = ctx.createRadialGradient(dot.x, dot.y, dot.r * 0.35, dot.x, dot.y, dot.r);
      grad.addColorStop(0, palette.hex);
      grad.addColorStop(0.72, palette.hex);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function encodeShareHash(cfg: SharedCatConfig): string {
  const payload = {
    b: cfg.breedId,
    s: cfg.sizeIdx,
    w: cfg.widthIdx,
    a: cfg.atmosphere,
    d: cfg.dots.map((pt) => [pt.x, pt.y, pt.r, pt.c]),
  };
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#cat=${b64}`;
}

export function decodeShareHash(hash: string): SharedCatConfig | null {
  if (!hash.startsWith('#cat=')) return null;
  try {
    const raw = hash.slice(5).replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '==='.slice((raw.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json) as {
      b?: string;
      s?: number;
      w?: number;
      a?: AtmosphereMode;
      d?: [number, number, number, number][];
    };
    if (!parsed || typeof parsed.b !== 'string') return null;
    const dots: CompactDot[] = Array.isArray(parsed.d)
      ? parsed.d
          .filter((item) => Array.isArray(item) && item.length === 4)
          .map(([x, y, r, c]) => ({
            x: Math.max(0, Math.min(255, Number(x) || 0)),
            y: Math.max(0, Math.min(255, Number(y) || 0)),
            r: Math.max(4, Math.min(40, Number(r) || 14)),
            c: Number(c),
          }))
      : [];
    return {
      breedId: parsed.b,
      sizeIdx: typeof parsed.s === 'number' ? parsed.s : 5,
      widthIdx: typeof parsed.w === 'number' ? parsed.w : 5,
      atmosphere: parsed.a === 'rain' || parsed.a === 'night' ? parsed.a : 'day',
      dots,
    };
  } catch {
    return null;
  }
}

/**
 * Renders the live WebGL2 stage into a warm cream Polaroid instant-photo PNG and downloads it!
 */
export function exportPolaroidSnapshot(
  sourceCanvas: HTMLCanvasElement,
  caption: string,
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

  // Warm tactile Polaroid cardstock
  ctx.fillStyle = atmosphere === 'night' ? '#1c2432' : '#fcf8f1';
  ctx.fillRect(0, 0, out.width, out.height);

  // Subtle paper border outline
  ctx.strokeStyle = atmosphere === 'night' ? 'rgba(200,220,250,0.12)' : 'rgba(80,60,40,0.10)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, out.width - 4, out.height - 4);

  // Photo frame with soft inset shadow
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

  // Caption & date stamp on bottom Polaroid chin
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const modeLabel = atmosphere === 'rain' ? '雨天午后' : atmosphere === 'night' ? '月光时刻' : '晴日暖阳';

  ctx.fillStyle = atmosphere === 'night' ? '#dce8fa' : '#3d332a';
  ctx.font = '600 32px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
  ctx.fillText(caption, padX + 6, padTop + photoH + 64);

  ctx.fillStyle = atmosphere === 'night' ? '#8b9bb2' : '#8d7d6c';
  ctx.font = '400 22px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
  ctx.fillText(`${modeLabel} · Open Pet the Cat`, padX + 6, padTop + photoH + 102);

  ctx.textAlign = 'right';
  ctx.font = '500 22px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(dateStr, out.width - padX - 6, padTop + photoH + 98);

  const link = document.createElement('a');
  link.download = `pet-the-cat-${Date.now()}.png`;
  link.href = out.toDataURL('image/png');
  link.click();
}
