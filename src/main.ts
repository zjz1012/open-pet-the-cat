import './styles.css';
import { CAT_BREEDS, type CatBreed } from './breeds';
import { PurrEngine } from './audio/purrEngine';
import { CatPhysics } from './physics/catPhysics';
import { CatRenderer } from './renderer/CatRenderer';

const SIZE_STEPS = [0.65, 0.72, 0.79, 0.86, 0.93, 1.0, 1.03, 1.06, 1.09, 1.11, 1.14];
const WIDTH_STEPS = [0.80, 0.84, 0.88, 0.92, 0.96, 1.0, 1.08, 1.16, 1.24, 1.32, 1.40];

function initApp(): void {
  const viewerEl = document.getElementById('viewer') as HTMLElement;
  const stageEl = document.getElementById('stage') as HTMLElement;
  const canvasEl = document.getElementById('scene') as HTMLCanvasElement;
  const fallbackEl = document.getElementById('webgl-fallback') as HTMLElement;
  const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;

  const breedListEl = document.getElementById('breed-list') as HTMLElement;
  const breedCaptionEl = document.getElementById('breed-caption') as HTMLElement;

  const themeBtn = document.getElementById('theme-toggle') as HTMLButtonElement;
  const soundBtn = document.getElementById('sound-toggle') as HTMLButtonElement;
  const expandBtn = document.getElementById('expand-toggle') as HTMLButtonElement;

  const propToggleBtn = document.getElementById('proportions-toggle') as HTMLButtonElement;
  const propPanelEl = document.getElementById('proportions-panel') as HTMLElement;
  const sizeInput = document.getElementById('cat-size') as HTMLInputElement;
  const widthInput = document.getElementById('cat-width') as HTMLInputElement;
  const sizeOut = document.getElementById('cat-size-out') as HTMLOutputElement;
  const widthOut = document.getElementById('cat-width-out') as HTMLOutputElement;
  const resetPropBtn = document.getElementById('reset-proportions') as HTMLButtonElement;

  const physics = new CatPhysics();
  const purr = new PurrEngine();

  // Default to Calico (三花猫) or Black (黑猫) — start on Calico so fur & markings pop immediately!
  let currentBreed: CatBreed = CAT_BREEDS.find((b) => b.id === 'hana') ?? CAT_BREEDS[0];
  purr.setBreedPurrHz(currentBreed.purrHz);

  let renderer: CatRenderer | null = null;
  let nightMode = false;

  function bootRenderer(): boolean {
    try {
      renderer?.dispose();
      renderer = new CatRenderer(canvasEl);
      renderer.setNightMode(nightMode);
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
    breedCaptionEl.textContent = `${breed.nameZh} · ${breed.nameEn}`;
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
  selectBreed(currentBreed);

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
  syncProportions();

  document.addEventListener('pointerdown', (e) => {
    if (
      !propPanelEl.hidden &&
      !propPanelEl.contains(e.target as Node) &&
      !propToggleBtn.contains(e.target as Node)
    ) {
      setPopoverOpen(false);
    }
  });

  // ----- Theme (Daylight <-> Moonlight) -----
  function setNight(next: boolean): void {
    nightMode = next;
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    themeBtn.setAttribute('aria-checked', next ? 'true' : 'false');
    renderer?.setNightMode(next);
  }

  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setNight(!nightMode);
  });

  // ----- Purring Sound -----
  soundBtn.addEventListener('click', async () => {
    const next = !purr.isEnabled();
    await purr.setEnabled(next);
    soundBtn.setAttribute('aria-checked', next ? 'true' : 'false');
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

  // ----- Pointer & Touch Interaction on Stage -----
  let activePointerId: number | null = null;
  let isPressed = false;

  function stageUvFromEvent(e: PointerEvent): { u: number; v: number } {
    const rect = stageEl.getBoundingClientRect();
    return {
      u: (e.clientX - rect.left) / Math.max(1, rect.width),
      v: (e.clientY - rect.top) / Math.max(1, rect.height),
    };
  }

  stageEl.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setPopoverOpen(false);
    purr.unlock();
    activePointerId = e.pointerId;
    isPressed = true;
    stageEl.setPointerCapture?.(e.pointerId);
    const { u, v } = stageUvFromEvent(e);
    physics.setPointer(u, v, true, true);
    stageEl.dataset.pressed = 'true';
  });

  stageEl.addEventListener('pointermove', (e) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const { u, v } = stageUvFromEvent(e);
    const touchingOrDown = isPressed || (e.buttons & 1) === 1;
    physics.setPointer(u, v, true, touchingOrDown);
  });

  function endPress(e: PointerEvent): void {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    isPressed = false;
    activePointerId = null;
    stageEl.dataset.pressed = 'false';
    if (e.pointerType === 'touch') {
      physics.setPointerLeave();
    } else {
      const { u, v } = stageUvFromEvent(e);
      physics.setPointer(u, v, true, false);
    }
  }

  stageEl.addEventListener('pointerup', endPress);
  stageEl.addEventListener('pointercancel', endPress);
  stageEl.addEventListener('pointerleave', (e) => {
    if (!isPressed && e.pointerType !== 'touch') {
      physics.setPointerLeave();
    }
  });

  // ----- Keyboard Shortcuts (Space / Enter / T) -----
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
      setNight(!nightMode);
    } else if (e.key === 'Escape' && !propPanelEl.hidden) {
      setPopoverOpen(false);
    }
  });

  // Resize observer for crisp Retina rendering
  const ro = new ResizeObserver(() => {
    renderer?.resize();
  });
  ro.observe(stageEl);

  // ----- Main 60fps Animation Loop -----
  let lastTs = performance.now();
  function frame(ts: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;

    if (renderer) {
      const aspect = renderer.getAspect();
      physics.step(dt, aspect);
      stageEl.dataset.over = physics.state.isOverCat ? 'true' : 'false';
      purr.update(dt, physics.state.contentment, physics.state.strokeSpeed, physics.state.isHeadZone);
      renderer.render(dt, physics.state, currentBreed);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

initApp();
