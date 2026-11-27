import './styles.css';
import { CAT_BREEDS, type CatBreed } from './breeds';
import { PurrEngine } from './audio/purrEngine';
import {
  CoatPainter,
  PAINT_PALETTE,
  decodeShareHash,
  encodeShareHash,
  exportPolaroidSnapshot,
  type AtmosphereMode,
} from './paint/coatPainter';
import { CatPhysics, type ToolMode } from './physics/catPhysics';
import { CatRenderer } from './renderer/CatRenderer';

const SIZE_STEPS = [0.65, 0.72, 0.79, 0.86, 0.93, 1.0, 1.03, 1.06, 1.09, 1.11, 1.14];
const WIDTH_STEPS = [0.80, 0.84, 0.88, 0.92, 0.96, 1.0, 1.08, 1.16, 1.24, 1.32, 1.40];
const ATMOSPHERE_CYCLE: AtmosphereMode[] = ['day', 'rain', 'night'];
const ATMOSPHERE_LABEL: Record<AtmosphereMode, string> = {
  day: '晴日',
  rain: '雨天',
  night: '月光',
};

function initApp(): void {
  const viewerEl = document.getElementById('viewer') as HTMLElement;
  const stageEl = document.getElementById('stage') as HTMLElement;
  const canvasEl = document.getElementById('scene') as HTMLCanvasElement;
  const fallbackEl = document.getElementById('webgl-fallback') as HTMLElement;
  const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;

  const breedListEl = document.getElementById('breed-list') as HTMLElement;
  const breedCaptionEl = document.getElementById('breed-caption') as HTMLElement;

  const themeBtn = document.getElementById('theme-toggle') as HTMLButtonElement;
  const atmosphereLabelEl = document.getElementById('atmosphere-label') as HTMLElement;
  const snapshotBtn = document.getElementById('snapshot-btn') as HTMLButtonElement;
  const shareBtn = document.getElementById('share-btn') as HTMLButtonElement;

  const soundBtn = document.getElementById('sound-toggle') as HTMLButtonElement;
  const expandBtn = document.getElementById('expand-toggle') as HTMLButtonElement;

  const propToggleBtn = document.getElementById('proportions-toggle') as HTMLButtonElement;
  const propPanelEl = document.getElementById('proportions-panel') as HTMLElement;
  const sizeInput = document.getElementById('cat-size') as HTMLInputElement;
  const widthInput = document.getElementById('cat-width') as HTMLInputElement;
  const sizeOut = document.getElementById('cat-size-out') as HTMLOutputElement;
  const widthOut = document.getElementById('cat-width-out') as HTMLOutputElement;
  const resetPropBtn = document.getElementById('reset-proportions') as HTMLButtonElement;

  const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tool]'));
  const clearFurballsBtn = document.getElementById('clear-furballs') as HTMLButtonElement;
  const furballBadgeEl = document.getElementById('furball-badge') as HTMLElement;

  const paintStudioEl = document.getElementById('paint-studio') as HTMLElement;
  const paintColorsEl = document.getElementById('paint-colors') as HTMLElement;
  const paintEraserBtn = document.getElementById('paint-eraser') as HTMLButtonElement;
  const paintSizeInput = document.getElementById('paint-size') as HTMLInputElement;
  const paintClearBtn = document.getElementById('paint-clear') as HTMLButtonElement;

  const toastEl = document.getElementById('stage-toast') as HTMLElement;

  const physics = new CatPhysics();
  const purr = new PurrEngine();
  const painter = new CoatPainter();

  let currentBreed: CatBreed = CAT_BREEDS.find((b) => b.id === 'hana') ?? CAT_BREEDS[0];
  let atmosphere: AtmosphereMode = 'day';
  let currentTool: ToolMode = 'hand';
  let activePaintColor = 1; // Warm orange default
  let eraserActive = false;

  let renderer: CatRenderer | null = null;
  const getRenderer = (): CatRenderer | null => renderer;
  let toastTimer: number | null = null;

  function showToast(msg: string, ms = 1900): void {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.add('show');
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('show');
      window.setTimeout(() => {
        if (!toastEl.classList.contains('show')) toastEl.hidden = true;
      }, 260);
    }, ms);
  }

  function bootRenderer(): boolean {
    try {
      renderer?.dispose();
      renderer = new CatRenderer(canvasEl);
      renderer.setAtmosphere(atmosphere);
      renderer.uploadPaintCanvas(painter.canvas, painter.hasPaint());
      renderer.resize();
      void renderer.loadAssets('./assets/cushion-bg.webp', './assets/petting-hand.webp');
      fallbackEl.hidden = true;
      return true;
    } catch (err) {
      console.error(err);
      fallbackEl.hidden = false;
      return false;
    }
  }

  bootRenderer();
  retryBtn.addEventListener('click', () => {
    bootRenderer();
  });

  // ----- Breed Swatches -----
  const swatchButtons = new Map<string, HTMLButtonElement>();

  function selectBreed(breed: CatBreed): void {
    currentBreed = breed;
    purr.setBreedPurrHz(breed.purrHz);
    breedCaptionEl.textContent = `${breed.nameZh} · ${breed.nameEn}${painter.hasPaint() ? ' (定制涂鸦)' : ''}`;
    for (const [id, btn] of swatchButtons) {
      btn.setAttribute('aria-pressed', id === breed.id ? 'true' : 'false');
    }
  }

  for (const breed of CAT_BREEDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'breed-swatch';
    btn.dataset.breed = breed.id;
    btn.title = `${breed.nameZh} (${breed.nameEn})`;
    btn.setAttribute('aria-label', `${breed.nameZh} ${breed.nameEn}`);
    btn.setAttribute('aria-pressed', breed.id === currentBreed.id ? 'true' : 'false');

    const fill = document.createElement('span');
    fill.className = 'breed-swatch-fill';
    fill.style.background = breed.swatchGradient;
    btn.appendChild(fill);

    btn.addEventListener('click', () => {
      selectBreed(breed);
    });

    swatchButtons.set(breed.id, btn);
    breedListEl.appendChild(btn);
  }

  // ----- Tool Switcher (Hand / Comb / Laser / Paint) -----
  function selectTool(tool: ToolMode, announce = false): void {
    currentTool = tool;
    physics.setToolMode(tool);
    stageEl.dataset.tool = tool;
    paintStudioEl.hidden = tool !== 'paint';
    for (const btn of toolButtons) {
      btn.setAttribute('aria-pressed', btn.dataset.tool === tool ? 'true' : 'false');
    }
    if (announce) {
      const tip: Record<ToolMode, string> = {
        hand: '徒手模式：顺毛轻撸 · 轻点屁股拍打 · 逆毛会炸毛',
        comb: '木质排梳：划过留下梳齿纹路，长毛猫还会掉毛球哦',
        laser: '红点激光笔：移动红点逗猫，凑近猫头会蓄力轻扑！',
        paint: '捏猫模式：直接在猫背上画斑块，画完点右上角可分享',
      };
      showToast(tip[tool], 2300);
    }
  }

  for (const btn of toolButtons) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tool = btn.dataset.tool as ToolMode | undefined;
      if (tool) selectTool(tool, true);
    });
  }

  clearFurballsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    physics.clearFurballs();
    clearFurballsBtn.hidden = true;
    showToast('浮毛球已清扫干净 ✨');
  });

  // ----- Paint Studio Controls -----
  const paintDotBtns: HTMLButtonElement[] = [];

  function syncPaintUi(): void {
    paintDotBtns.forEach((btn, idx) => {
      btn.setAttribute('aria-pressed', !eraserActive && idx === activePaintColor ? 'true' : 'false');
    });
    paintEraserBtn.setAttribute('aria-pressed', eraserActive ? 'true' : 'false');
  }

  PAINT_PALETTE.forEach((p, idx) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'paint-dot';
    dot.style.backgroundColor = p.hex;
    dot.title = p.name;
    dot.setAttribute('aria-label', p.name);
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      activePaintColor = idx;
      eraserActive = false;
      syncPaintUi();
    });
    paintDotBtns.push(dot);
    paintColorsEl.appendChild(dot);
  });

  paintEraserBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    eraserActive = !eraserActive;
    syncPaintUi();
  });

  paintClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    painter.clear();
    renderer?.uploadPaintCanvas(painter.canvas, false);
    selectBreed(currentBreed);
    showToast('已清空自定义花色');
  });
  syncPaintUi();

  // ----- Proportions Popover -----
  function syncProportions(): void {
    const sIdx = Math.max(0, Math.min(SIZE_STEPS.length - 1, Number(sizeInput.value)));
    const wIdx = Math.max(0, Math.min(WIDTH_STEPS.length - 1, Number(widthInput.value)));
    const sVal = SIZE_STEPS[sIdx];
    const wVal = WIDTH_STEPS[wIdx];
    sizeOut.textContent = `${Math.round(sVal * 100)}%`;
    widthOut.textContent = `${Math.round(wVal * 100)}%`;
    physics.setProportions(sVal, wVal);
  }

  function setPopoverOpen(open: boolean): void {
    propPanelEl.hidden = !open;
    propToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  propToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setPopoverOpen(propPanelEl.hidden);
  });

  sizeInput.addEventListener('input', syncProportions);
  widthInput.addEventListener('input', syncProportions);
  resetPropBtn.addEventListener('click', () => {
    sizeInput.value = '5';
    widthInput.value = '5';
    syncProportions();
  });

  document.addEventListener('pointerdown', (e) => {
    if (
      !propPanelEl.hidden &&
      !propPanelEl.contains(e.target as Node) &&
      !propToggleBtn.contains(e.target as Node)
    ) {
      setPopoverOpen(false);
    }
  });

  // ----- Atmosphere Cycle (Day -> Rainy Afternoon ASMR -> Moonlight) -----
  function setAtmosphere(mode: AtmosphereMode, announce = false): void {
    atmosphere = mode;
    document.documentElement.dataset.theme = mode === 'night' ? 'dark' : mode === 'rain' ? 'rain' : 'light';
    atmosphereLabelEl.textContent = ATMOSPHERE_LABEL[mode];
    renderer?.setAtmosphere(mode);
    purr.setRainAmbience(mode === 'rain');
    if (announce) {
      if (mode === 'rain') {
        showToast(purr.isEnabled() ? '雨天午后 · 窗外细雨 + 呼噜白噪音' : '雨天午后 · 开启右下角声音可听细雨 ASMR');
      } else if (mode === 'night') {
        showToast('月光时刻 · 晚安小猫');
      } else {
        showToast('晴日暖阳');
      }
    }
  }

  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextIdx = (ATMOSPHERE_CYCLE.indexOf(atmosphere) + 1) % ATMOSPHERE_CYCLE.length;
    setAtmosphere(ATMOSPHERE_CYCLE[nextIdx], true);
  });

  // ----- Polaroid Snapshot & Share URL -----
  snapshotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!renderer) return;
    // Render one fresh frame right before capture so WebGL drawing buffer is populated!
    renderer.render(0.016, physics.state, currentBreed);
    const caption = `${currentBreed.nameZh} · ${currentBreed.nameEn}`;
    exportPolaroidSnapshot(canvasEl, caption, atmosphere);
    showToast('拍立得合照已保存 📸');
  });

  shareBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const hash = encodeShareHash({
      breedId: currentBreed.id,
      sizeIdx: Number(sizeInput.value),
      widthIdx: Number(widthInput.value),
      atmosphere,
      dots: painter.getDots(),
    });
    window.history.replaceState(null, '', hash);
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('已复制专属撸猫链接，发给朋友云撸你家的猫 🔗', 2400);
    } catch {
      showToast('专属链接已更新至地址栏，可直接复制分享 🔗', 2400);
    }
  });

  // ----- Sound Toggle -----
  soundBtn.addEventListener('click', async () => {
    const next = !purr.isEnabled();
    await purr.setEnabled(next);
    soundBtn.setAttribute('aria-checked', next ? 'true' : 'false');
    if (next && atmosphere === 'rain') {
      showToast('呼噜声 + 窗外细雨 ASMR 已开启 🌧️');
    }
  });

  // ----- Fullscreen -----
  function syncFullscreenUi(): void {
    const isFull = document.fullscreenElement === viewerEl || viewerEl.classList.contains('is-full');
    expandBtn.setAttribute('aria-pressed', isFull ? 'true' : 'false');
    renderer?.resize();
  }

  expandBtn.addEventListener('click', async () => {
    if (document.fullscreenElement === viewerEl) {
      await document.exitFullscreen().catch(() => {});
      viewerEl.classList.remove('is-full');
    } else if (viewerEl.classList.contains('is-full')) {
      viewerEl.classList.remove('is-full');
    } else if (viewerEl.requestFullscreen) {
      try {
        await viewerEl.requestFullscreen();
      } catch {
        viewerEl.classList.add('is-full');
      }
    } else {
      viewerEl.classList.add('is-full');
    }
    syncFullscreenUi();
  });

  document.addEventListener('fullscreenchange', syncFullscreenUi);

  // ----- Pointer, Bongo Butt-Pat Tap & Custom Fur Painting -----
  let activePointerId: number | null = null;
  let isPressed = false;
  let downTime = 0;
  let downUv = { u: 0, v: 0 };

  function stageUvFromEvent(e: PointerEvent): { u: number; v: number } {
    const rect = stageEl.getBoundingClientRect();
    return {
      u: (e.clientX - rect.left) / Math.max(1, rect.width),
      v: (e.clientY - rect.top) / Math.max(1, rect.height),
    };
  }

  function applyPaintAt(u: number, v: number): void {
    if (!renderer) return;
    const local = physics.stageToCatLocal(u, v, renderer.getAspect());
    const hit = physics.hitTestCat(local);
    if (!hit.inside) return;
    const radius = Number(paintSizeInput.value) || 16;
    painter.paintDot(local, radius, eraserActive ? -1 : activePaintColor);
    if (painter.isDirty()) {
      renderer.uploadPaintCanvas(painter.canvas, painter.hasPaint());
      painter.markClean();
      selectBreed(currentBreed);
    }
  }

  stageEl.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, input, .paint-studio, .stage-bar')) return;
    setPopoverOpen(false);
    purr.unlock();
    activePointerId = e.pointerId;
    isPressed = true;
    downTime = performance.now();
    downUv = stageUvFromEvent(e);
    stageEl.setPointerCapture?.(e.pointerId);

    if (currentTool === 'paint') {
      applyPaintAt(downUv.u, downUv.v);
      return;
    }

    physics.setPointer(downUv.u, downUv.v, true, true);
    stageEl.dataset.pressed = 'true';
  });

  stageEl.addEventListener('pointermove', (e) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const { u, v } = stageUvFromEvent(e);
    const touchingOrDown = isPressed || (e.buttons & 1) === 1;

    if (currentTool === 'paint') {
      if (touchingOrDown) applyPaintAt(u, v);
      return;
    }

    physics.setPointer(u, v, true, touchingOrDown);
  });

  function endPress(e: PointerEvent): void {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const upUv = stageUvFromEvent(e);
    const elapsed = performance.now() - downTime;
    const moved = Math.hypot(upUv.u - downUv.u, upUv.v - downUv.v);

    // Quick tap on cat's rump/back triggers Bongo Butt-Pat jelly bounce!
    if (currentTool === 'hand' && elapsed < 240 && moved < 0.035 && renderer) {
      const combo = physics.triggerTap(upUv.u, upUv.v, renderer.getAspect());
      if (combo > 0) {
        purr.playButtPat(combo);
        if (combo === 1) {
          showToast('拍猫屁股 🐾', 1100);
        } else if (combo >= 3) {
          showToast(`连拍猫屁股 ×${combo}！屁股翘高高 🐾`, 1200);
        }
      }
    }

    isPressed = false;
    activePointerId = null;
    stageEl.dataset.pressed = 'false';
    if (e.pointerType === 'touch') {
      physics.setPointerLeave();
    } else if (currentTool !== 'paint') {
      physics.setPointer(upUv.u, upUv.v, true, false);
    }
  }

  stageEl.addEventListener('pointerup', endPress);
  stageEl.addEventListener('pointercancel', endPress);
  stageEl.addEventListener('pointerleave', (e) => {
    if (!isPressed && e.pointerType !== 'touch') {
      physics.setPointerLeave();
    }
  });

  // ----- Keyboard Shortcuts -----
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      purr.unlock();
      const on = physics.toggleAutoPet();
      stageEl.dataset.pressed = on ? 'true' : 'false';
    } else if (e.code === 'Enter' && document.activeElement === stageEl) {
      e.preventDefault();
      purr.unlock();
      physics.triggerSingleStroke();
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      const nextIdx = (ATMOSPHERE_CYCLE.indexOf(atmosphere) + 1) % ATMOSPHERE_CYCLE.length;
      setAtmosphere(ATMOSPHERE_CYCLE[nextIdx], true);
    } else if (e.key === '1') {
      selectTool('hand', true);
    } else if (e.key === '2') {
      selectTool('comb', true);
    } else if (e.key === '3') {
      selectTool('laser', true);
    } else if (e.key === '4') {
      selectTool('paint', true);
    } else if (e.key === 'Escape' && !propPanelEl.hidden) {
      setPopoverOpen(false);
    }
  });

  // ----- Restore Shared Custom Cat from URL Hash (#cat=...) -----
  const shared = decodeShareHash(window.location.hash);
  if (shared) {
    const matched = CAT_BREEDS.find((b) => b.id === shared.breedId);
    if (matched) currentBreed = matched;
    sizeInput.value = String(Math.max(0, Math.min(10, shared.sizeIdx)));
    widthInput.value = String(Math.max(0, Math.min(10, shared.widthIdx)));
    setAtmosphere(shared.atmosphere, false);
    if (shared.dots.length > 0) {
      painter.loadDots(shared.dots);
      getRenderer()?.uploadPaintCanvas(painter.canvas, painter.hasPaint());
    }
    showToast('已载入分享的专属小猫 🐱', 2200);
  }

  syncProportions();
  selectBreed(currentBreed);
  selectTool('hand', false);

  const ro = new ResizeObserver(() => {
    renderer?.resize();
  });
  ro.observe(stageEl);

  // ----- Main 60fps Loop -----
  let lastTs = performance.now();
  let lastFurballCount = 0;

  function frame(ts: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;

    if (renderer) {
      const aspect = renderer.getAspect();
      const events = physics.step(dt, aspect, currentBreed.furLength, currentBreed.primaryColor);
      stageEl.dataset.over = physics.state.isOverCat ? 'true' : 'false';

      if (events.softMeow) {
        purr.playSoftMeow();
      }
      if (events.hissPushback) {
        purr.playHiss();
        showToast('逆毛搓太狠炸毛啦！顺着毛轻轻摸~ 😾', 1800);
      }
      if (events.furballSpawned) {
        showToast('梳出一团软乎乎的浮毛球，可以拨着玩 🧶', 1800);
      }

      const fbCount = physics.state.furballs.length;
      if (fbCount !== lastFurballCount) {
        lastFurballCount = fbCount;
        clearFurballsBtn.hidden = fbCount === 0;
        furballBadgeEl.textContent = String(fbCount);
      }

      purr.update(
        dt,
        physics.state.contentment,
        physics.state.strokeSpeed,
        physics.state.isHeadZone,
        physics.state.annoyance,
      );
      renderer.render(dt, physics.state, currentBreed);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

initApp();
