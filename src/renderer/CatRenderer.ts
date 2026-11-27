import type { CatBreed, CoatPatternType } from '../breeds';
import type { AtmosphereMode } from '../paint/coatPainter';
import type { CatPhysicsState, ToolMode } from '../physics/catPhysics';
import { FULLSCREEN_VERT, SCENE_FRAG, SIM_FRAG } from './shaders';

const PATTERN_INDEX: Record<CoatPatternType, number> = {
  solid: 0,
  tabby: 1,
  calico: 2,
  bicolor: 3,
  tortie: 4,
  colorpoint: 5,
  ragdoll: 6,
  sphynx: 7,
};

const TOOL_INDEX: Record<ToolMode, number> = {
  hand: 0,
  comb: 1,
  laser: 2,
  paint: 3,
};

interface SimFBO {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

/**
 * 2.5D WebGL2 Multi-Layer Fur, Soft-Body & Interactive Tool Renderer (v2.0)
 */
export class CatRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;

  private readonly simProgram: WebGLProgram;
  private readonly sceneProgram: WebGLProgram;
  private readonly emptyVao: WebGLVertexArrayObject;

  private readonly simWidth = 256;
  private readonly simHeight = 160;
  private simBuffers: [SimFBO, SimFBO];
  private simIndex = 0;

  private readonly noiseTex: WebGLTexture;
  private readonly paintTex: WebGLTexture;
  private bgTex: WebGLTexture;
  private handTex: WebGLTexture;
  private hasBgTex = false;
  private hasHandTex = false;
  private hasPaint = false;
  private bgSize: [number, number] = [1264, 848];
  private handSize: [number, number] = [600, 804];

  private simUniforms: Record<string, WebGLUniformLocation | null> = {};
  private sceneUniforms: Record<string, WebGLUniformLocation | null> = {};

  private currentNight = 0;
  private targetNight = 0;
  private currentRain = 0;
  private targetRain = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser.');
    }
    this.gl = gl;

    this.simProgram = this.createProgram(FULLSCREEN_VERT, SIM_FRAG);
    this.sceneProgram = this.createProgram(FULLSCREEN_VERT, SCENE_FRAG);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.emptyVao = vao;

    this.simBuffers = [this.createSimFBO(), this.createSimFBO()];
    this.clearSimBuffers();

    this.noiseTex = this.createSeamlessNoiseTexture(512);
    this.paintTex = this.createPaintTexture();
    this.bgTex = this.createPlaceholderTexture();
    this.handTex = this.createPlaceholderTexture();

    this.cacheUniforms();
  }

  public setAtmosphere(mode: AtmosphereMode): void {
    this.targetNight = mode === 'night' ? 1 : 0;
    this.targetRain = mode === 'rain' ? 1 : 0;
  }

  public uploadPaintCanvas(paintCanvas: HTMLCanvasElement, hasPaint: boolean): void {
    const gl = this.gl;
    this.hasPaint = hasPaint;
    gl.bindTexture(gl.TEXTURE_2D, this.paintTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintCanvas);
  }

  public async loadAssets(bgUrl: string, handUrl: string): Promise<void> {
    await Promise.all([
      this.loadImageTexture(bgUrl)
        .then(({ tex, width, height }) => {
          this.gl.deleteTexture(this.bgTex);
          this.bgTex = tex;
          this.bgSize = [width, height];
          this.hasBgTex = true;
        })
        .catch(() => {
          this.hasBgTex = false;
        }),
      this.loadImageTexture(handUrl)
        .then(({ tex, width, height }) => {
          this.gl.deleteTexture(this.handTex);
          this.handTex = tex;
          this.handSize = [width, height];
          this.hasHandTex = true;
        })
        .catch(() => {
          this.hasHandTex = false;
        }),
    ]);
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const rect = this.canvas.getBoundingClientRect();
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  public getAspect(): number {
    return this.canvas.width / Math.max(1, this.canvas.height);
  }

  public render(dt: number, state: CatPhysicsState, breed: CatBreed): void {
    const gl = this.gl;
    const clampedDt = Math.min(dt, 0.05);
    const aspect = this.getAspect();

    this.currentNight += (this.targetNight - this.currentNight) * Math.min(1, clampedDt * 5.0);
    this.currentRain += (this.targetRain - this.currentRain) * Math.min(1, clampedDt * 5.0);

    const toolIdx = TOOL_INDEX[state.toolMode];
    gl.bindVertexArray(this.emptyVao);

    // ----- Pass 1: Simulation FBO -----
    const readBuf = this.simBuffers[this.simIndex];
    const writeBuf = this.simBuffers[1 - this.simIndex];

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeBuf.fbo);
    gl.viewport(0, 0, this.simWidth, this.simHeight);
    gl.useProgram(this.simProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readBuf.tex);
    gl.uniform1i(this.simUniforms.uPrevSim, 0);
    gl.uniform2f(this.simUniforms.uTexelSize, 1 / this.simWidth, 1 / this.simHeight);
    gl.uniform1f(this.simUniforms.uDt, clampedDt);
    gl.uniform1f(this.simUniforms.uAspect, aspect);
    gl.uniform2f(this.simUniforms.uHandPos, state.handPos.x, state.handPos.y);
    gl.uniform2f(this.simUniforms.uHandVel, state.handVel.x, state.handVel.y);
    gl.uniform1f(this.simUniforms.uHandAngle, state.handAngle);
    gl.uniform1f(this.simUniforms.uHandPress, state.handPress);
    gl.uniform1f(this.simUniforms.uHandVisible, state.handVisibility);
    gl.uniform1f(this.simUniforms.uCatSize, state.catSize);
    gl.uniform1i(this.simUniforms.uToolMode, toolIdx);
    gl.uniform2f(this.simUniforms.uPatPos, state.patPos.x, state.patPos.y);
    gl.uniform1f(this.simUniforms.uPatImpulse, state.patImpulse);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.simIndex = 1 - this.simIndex;

    // ----- Pass 2: Fullscreen 2.5D Scene -----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.sceneProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, writeBuf.tex);
    gl.uniform1i(this.sceneUniforms.uSimTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(this.sceneUniforms.uNoiseTex, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.uniform1i(this.sceneUniforms.uBgTex, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.handTex);
    gl.uniform1i(this.sceneUniforms.uHandTex, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.paintTex);
    gl.uniform1i(this.sceneUniforms.uPaintTex, 4);

    gl.uniform1f(this.sceneUniforms.uHasBgTex, this.hasBgTex ? 1.0 : 0.0);
    gl.uniform1f(this.sceneUniforms.uHasHandTex, this.hasHandTex ? 1.0 : 0.0);
    gl.uniform1f(this.sceneUniforms.uHasPaint, this.hasPaint ? 1.0 : 0.0);
    gl.uniform2f(this.sceneUniforms.uBgAspectSize, this.bgSize[0], this.bgSize[1]);
    gl.uniform2f(this.sceneUniforms.uHandTexSize, this.handSize[0], this.handSize[1]);

    gl.uniform1f(this.sceneUniforms.uTime, state.time);
    gl.uniform1f(this.sceneUniforms.uAspect, aspect);
    gl.uniform1f(this.sceneUniforms.uNight, this.currentNight);
    gl.uniform1f(this.sceneUniforms.uRain, this.currentRain);

    gl.uniform1f(this.sceneUniforms.uCatSize, state.catSize);
    gl.uniform1f(this.sceneUniforms.uTorsoWidth, state.torsoWidth);
    gl.uniform1f(this.sceneUniforms.uBreath, state.breath);
    gl.uniform1f(this.sceneUniforms.uLeftEarSquish, state.leftEarSquish);
    gl.uniform1f(this.sceneUniforms.uRightEarSquish, state.rightEarSquish);
    gl.uniform1f(this.sceneUniforms.uHeadPress, state.headPress);
    gl.uniform1f(this.sceneUniforms.uRumpLift, state.rumpLift);
    gl.uniform1f(this.sceneUniforms.uHeadYaw, state.headYaw);
    gl.uniform1f(this.sceneUniforms.uPounceOffset, state.pounceOffset);
    gl.uniform1f(this.sceneUniforms.uSkinTwitch, state.skinTwitch);

    const tailFlat = new Float32Array(26);
    for (let i = 0; i < 13; i++) {
      tailFlat[i * 2] = state.tailSpline[i].x;
      tailFlat[i * 2 + 1] = state.tailSpline[i].y;
    }
    gl.uniform2fv(this.sceneUniforms.uTail, tailFlat);

    gl.uniform1i(this.sceneUniforms.uPatternType, PATTERN_INDEX[breed.pattern]);
    gl.uniform3fv(this.sceneUniforms.uPrimaryColor, breed.primaryColor);
    gl.uniform3fv(this.sceneUniforms.uSecondaryColor, breed.secondaryColor);
    gl.uniform3fv(this.sceneUniforms.uTertiaryColor, breed.tertiaryColor);
    gl.uniform3fv(this.sceneUniforms.uEarInnerColor, breed.earInnerColor);
    gl.uniform1f(this.sceneUniforms.uFurLength, breed.furLength);
    gl.uniform1f(this.sceneUniforms.uFurClump, breed.furClump);
    gl.uniform1f(this.sceneUniforms.uSheen, breed.sheen);
    gl.uniform1f(this.sceneUniforms.uPatternSeed, breed.patternSeed);
    gl.uniform1f(this.sceneUniforms.uTailFluff, breed.tailFluff);
    gl.uniform1f(this.sceneUniforms.uRuffFluff, breed.ruffFluff);

    gl.uniform1i(this.sceneUniforms.uToolMode, toolIdx);
    gl.uniform2f(this.sceneUniforms.uHandPos, state.handPos.x, state.handPos.y);
    gl.uniform1f(this.sceneUniforms.uHandAngle, state.handAngle);
    gl.uniform1f(this.sceneUniforms.uHandPress, state.handPress);
    gl.uniform1f(this.sceneUniforms.uHandVisible, state.handVisibility);
    gl.uniform2f(this.sceneUniforms.uLaserPos, state.laserPos.x, state.laserPos.y);
    gl.uniform1f(this.sceneUniforms.uLaserVisible, state.laserVisible);

    const fbCount = Math.min(6, state.furballs.length);
    gl.uniform1i(this.sceneUniforms.uFurballCount, fbCount);
    const fbPos = new Float32Array(24);
    const fbCol = new Float32Array(18);
    for (let i = 0; i < fbCount; i++) {
      const fb = state.furballs[i];
      fbPos[i * 4] = fb.x;
      fbPos[i * 4 + 1] = fb.y;
      fbPos[i * 4 + 2] = fb.radius;
      fbPos[i * 4 + 3] = fb.seed;
      fbCol[i * 3] = fb.color[0];
      fbCol[i * 3 + 1] = fb.color[1];
      fbCol[i * 3 + 2] = fb.color[2];
    }
    gl.uniform4fv(this.sceneUniforms.uFurballPos, fbPos);
    gl.uniform3fv(this.sceneUniforms.uFurballCol, fbCol);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private cacheUniforms(): void {
    const gl = this.gl;
    const simNames = [
      'uPrevSim', 'uTexelSize', 'uDt', 'uAspect',
      'uHandPos', 'uHandVel', 'uHandAngle', 'uHandPress', 'uHandVisible', 'uCatSize',
      'uToolMode', 'uPatPos', 'uPatImpulse',
    ];
    for (const name of simNames) {
      this.simUniforms[name] = gl.getUniformLocation(this.simProgram, name);
    }

    const sceneNames = [
      'uSimTex', 'uNoiseTex', 'uBgTex', 'uHandTex', 'uPaintTex',
      'uHasBgTex', 'uHasHandTex', 'uHasPaint', 'uBgAspectSize', 'uHandTexSize',
      'uTime', 'uAspect', 'uNight', 'uRain',
      'uCatSize', 'uTorsoWidth', 'uBreath',
      'uLeftEarSquish', 'uRightEarSquish', 'uHeadPress', 'uRumpLift',
      'uHeadYaw', 'uPounceOffset', 'uSkinTwitch', 'uTail',
      'uPatternType', 'uPrimaryColor', 'uSecondaryColor', 'uTertiaryColor', 'uEarInnerColor',
      'uFurLength', 'uFurClump', 'uSheen', 'uPatternSeed', 'uTailFluff', 'uRuffFluff',
      'uToolMode', 'uHandPos', 'uHandAngle', 'uHandPress', 'uHandVisible',
      'uLaserPos', 'uLaserVisible', 'uFurballCount', 'uFurballPos', 'uFurballCol',
    ];
    for (const name of sceneNames) {
      this.sceneUniforms[name] = gl.getUniformLocation(this.sceneProgram, name);
    }
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error('Failed to create WebGL program');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  private createSimFBO(): SimFBO {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error('Failed to allocate simulation FBO');

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.simWidth, this.simHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  private clearSimBuffers(): void {
    const gl = this.gl;
    for (const buf of this.simBuffers) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, buf.fbo);
      gl.clearColor(0.0, 0.5, 0.5, 0.5);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createPaintTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create paint texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private createSeamlessNoiseTexture(size: number): WebGLTexture {
    const gl = this.gl;
    const data = new Uint8Array(size * size * 4);
    let seed = 133791;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const makeTileGrid = (period: number): Float32Array => {
      const g = new Float32Array(period * period);
      for (let i = 0; i < g.length; i++) g[i] = rand();
      return g;
    };

    const sampleTile = (grid: Float32Array, period: number, u: number, v: number): number => {
      const fx = u * period;
      const fy = v * period;
      const x0 = Math.floor(fx) % period;
      const y0 = Math.floor(fy) % period;
      const x1 = (x0 + 1) % period;
      const y1 = (y0 + 1) % period;
      const tx = fx - Math.floor(fx);
      const ty = fy - Math.floor(fy);
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const n00 = grid[y0 * period + x0];
      const n10 = grid[y0 * period + x1];
      const n01 = grid[y1 * period + x0];
      const n11 = grid[y1 * period + x1];
      return n00 + (n10 - n00) * sx + (n01 + (n11 - n01) * sx - (n00 + (n10 - n00) * sx)) * sy;
    };

    const gFine1 = makeTileGrid(256);
    const gFine2 = makeTileGrid(128);
    const gMid = makeTileGrid(48);
    const gLow = makeTileGrid(16);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const r = sampleTile(gFine1, 256, u, v) * 0.65 + sampleTile(gFine2, 128, u, v) * 0.35;
        const g = sampleTile(gFine1, 256, (u + 0.31) % 1, (v + 0.67) % 1);
        const b = sampleTile(gMid, 48, u, v) * 0.65 + sampleTile(gFine2, 128, u, v) * 0.35;
        const a = sampleTile(gLow, 16, u, v) * 0.72 + sampleTile(gMid, 48, u, v) * 0.28;
        const idx = (y * size + x) * 4;
        data[idx] = Math.round(r * 255);
        data[idx + 1] = Math.round(g * 255);
        data[idx + 2] = Math.round(b * 255);
        data[idx + 3] = Math.round(a * 255);
      }
    }

    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create noise texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  private createPlaceholderTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create placeholder texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return tex;
  }

  private loadImageTexture(url: string): Promise<{ tex: WebGLTexture; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const gl = this.gl;
        const tex = gl.createTexture();
        if (!tex) {
          reject(new Error('Failed to create image texture'));
          return;
        }
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        resolve({ tex, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.simProgram);
    gl.deleteProgram(this.sceneProgram);
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteTexture(this.noiseTex);
    gl.deleteTexture(this.paintTex);
    gl.deleteTexture(this.bgTex);
    gl.deleteTexture(this.handTex);
    for (const buf of this.simBuffers) {
      gl.deleteFramebuffer(buf.fbo);
      gl.deleteTexture(buf.tex);
    }
  }
}
