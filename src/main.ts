import './styles.css';
import { CAT_BREEDS, type CatBreed } from './breeds';
import { PurrEngine } from './audio/purrEngine';
import {
  NATURAL_COAT_SWATCHES,
  PATTERN_OPTIONS,
  TEMPERAMENT_OPTIONS,
  breedFromProfile,
  decodeSharedCatHash,
  encodeSharedCatHash,
  exportPolaroidSnapshot,
  generateRandomCatProfile,
  profileFromBreed,
  type AtmosphereMode,
  type CustomCatProfile,
} from './creator/catCreator';
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

function furLengthLabel(val: number): string {
  if (val <= 0.04) return '无毛';
  if (val < 0.48) return '丝滑短毛';
  if (val < 0.74) return '蓬松中毛';
  return '超长绒毛';
}

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

  // Parametric Cat Creator Drawer elements
  const creatorToggleBtn = document.getElementById('creator-toggle') as HTMLButtonElement;
  const creatorPanelEl = document.getElementById('creator-panel') as HTMLElement;
  const creatorCloseBtn = document.getElementById('creator-close') as HTMLButtonElement;
  const creatorRandomBtn = document.getElementById('creator-random') as HTMLButtonElement;
  const creatorReseedBtn = document.getElementById('creator-reseed') as HTMLButtonElement;
  const creatorNameInput = document.getElementById('creator-name') as HTMLInputElement;
  const creatorPatternsEl = document.getElementById('creator-patterns') as HTMLElement;
  const creatorC1Input = document.getElementById('creator-c1') as HTMLInputElement;
  const creatorC2Input = document.getElementById('creator-c2') as HTMLInputElement;
  const creatorC3Input = document.getElementById('creator-c3') as HTMLInputElement;
  const creatorNatSwatchesEl = document.getElementById('creator-natural-swatches') as HTMLElement;
  const creatorFurLenInput = document.getElementById('creator-fur-len') as HTMLInputElement;
  const creatorFurLenOut = document.getElementById('creator-fur-len-out') as HTMLOutputElement;
  const creatorTailInput = document.getElementById('creator-tail-fluff') as HTMLInputElement;
  const creatorTailOut = document.getElementById('creator-tail-fluff-out') as HTMLOutputElement;
  const creatorRuffInput = document.getElementById('creator-ruff') as HTMLInputElement;
  const creatorRuffOut = document.getElementById('creator-ruff-out') as HTMLOutputElement;
  const creatorSheenInput = document.getElementById('creator-sheen') as HTMLInputElement;
  const creatorSheenOut = document.getElementById('creator-sheen-out') as HTMLOutputElement;
  const creatorPurrInput = document.getElementById('creator-purr') as HTMLInputElement;
  const creatorPurrOut = document.getElementById('creator-purr-out') as HTMLOutputElement;
  const creatorTempsEl = document.getElementById('creator-temperaments') as HTMLElement;
  const creatorShareBtn = document.getElementById('creator-share') as HTMLButtonElement;
  const creatorPhotoBtn = document.getElementById('creator-photo') as HTMLButtonElement;

  const toastEl = document.getElementById('stage-toast') as HTMLElement;

  const physics = new CatPhysics();
  const purr = new PurrEngine();

  const defaultBreed = CAT_BREEDS.find((b) => b.id === 'hana') ?? CAT_BREEDS[0];
  let activePresetId: string | null = defaultBreed.id;
  let profile: CustomCatProfile = profileFromBreed(defaultBreed);
  let currentBreed: CatBreed = defaultBreed;
  let atmosphere: AtmosphereMode = 'day';
  let currentTool: ToolMode = 'hand';

  let renderer: CatRenderer | null = null;
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

  // ----- Breed Swatches & Parametric Profile Sync -----
  const swatchButtons = new Map<string, HTMLButtonElement>();
  const patternChipBtns = new Map<string, HTMLButtonElement>();
  const tempChipBtns = new Map<string, HTMLButtonElement>();

  function updateCaption(): void {
    const tempLabel =
      TEMPERAMENT_OPTIONS.find((t) => t.value === profile.temperament)?.label ?? '傲娇主子';
    if (activePresetId) {
      const preset = CAT_BREEDS.find((b) => b.id === activePresetId);
      if (preset) {
        breedCaptionEl.textContent = `${preset.nameZh} · ${preset.nameEn}`;
        return;
      }
    }
    const patLabel = PATTERN_OPTIONS.find((p) => p.value === profile.pattern)?.label ?? '定制';
    breedCaptionEl.textContent = `${profile.name.trim() || '我的小猫'} · ${patLabel} · ${tempLabel}`;
  }

  function syncCreatorForm(): void {
    creatorNameInput.value = profile.name;
    creatorC1Input.value = profile.primaryHex;
    creatorC2Input.value = profile.secondaryHex;
    creatorC3Input.value = profile.tertiaryHex;

    const isSphynx = profile.pattern === 'sphynx';
    const effFur = isSphynx ? 0 : profile.furLength;
    creatorFurLenInput.value = String(Math.round(effFur * 100));
    creatorFurLenInput.disabled = isSphynx;
    creatorFurLenOut.textContent = furLengthLabel(effFur);

    creatorTailInput.value = String(Math.round(profile.tailFluff * 100));
    creatorTailInput.disabled = isSphynx;
    creatorTailOut.textContent = `${Math.round(profile.tailFluff * 100)}%`;

    creatorRuffInput.value = String(Math.round(profile.ruffFluff * 100));
    creatorRuffInput.disabled = isSphynx;
    creatorRuffOut.textContent = `${Math.round(profile.ruffFluff * 100)}%`;

    creatorSheenInput.value = String(Math.round(profile.sheen * 100));
    creatorSheenOut.textContent = `${Math.round(profile.sheen * 100)}%`;

    creatorPurrInput.value = String(profile.purrHz);
    creatorPurrOut.textContent = `${profile.purrHz.toFixed(1)} Hz`;

    for (const [val, btn] of patternChipBtns) {
      btn.setAttribute('aria-pressed', val === profile.pattern ? 'true' : 'false');
    }
    for (const [val, btn] of tempChipBtns) {
      btn.setAttribute('aria-pressed', val === profile.temperament ? 'true' : 'false');
    }
  }

  function applyProfileAsCustom(): void {
    activePresetId = null;
    currentBreed = breedFromProfile(profile);
    purr.setBreedPurrHz(currentBreed.purrHz);
    physics.setTemperament(profile.temperament);
    for (const [, btn] of swatchButtons) {
      btn.setAttribute('aria-pressed', 'false');
    }
    updateCaption();
  }

  function selectPresetBreed(breed: CatBreed): void {
    activePresetId = breed.id;
    currentBreed = breed;
    profile = profileFromBreed(
      breed,
      Number(sizeInput.value),
      Number(widthInput.value),
      profile.temperament,
    );
    purr.setBreedPurrHz(breed.purrHz);
    physics.setTemperament(profile.temperament);
    for (const [id, btn] of swatchButtons) {
      btn.setAttribute('aria-pressed', id === breed.id ? 'true' : 'false');
    }
    syncCreatorForm();
    updateCaption();
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
      selectPresetBreed(breed);
    });

    swatchButtons.set(breed.id, btn);
    breedListEl.appendChild(btn);
  }

  // ----- Build Creator Form Chips & Swatches -----
  for (const opt of PATTERN_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pattern-chip';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      profile.pattern = opt.value;
      if (opt.value === 'sphynx') {
        profile.furLength = 0;
      } else if (profile.furLength < 0.15) {
        profile.furLength = 0.52;
      }
      syncCreatorForm();
      applyProfileAsCustom();
    });
    patternChipBtns.set(opt.value, btn);
    creatorPatternsEl.appendChild(btn);
  }

  for (const sw of NATURAL_COAT_SWATCHES) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'nat-dot';
    dot.style.backgroundColor = sw.hex;
    dot.title = `${sw.name}（点击设为「主毛色」，Shift+点击设为「花纹色」）`;
    dot.setAttribute('aria-label', sw.name);
    dot.addEventListener('click', (e) => {
      if (e.shiftKey) {
        profile.secondaryHex = sw.hex;
      } else {
        profile.primaryHex = sw.hex;
      }
      syncCreatorForm();
      applyProfileAsCustom();
    });
    creatorNatSwatchesEl.appendChild(dot);
  }

  for (const t of TEMPERAMENT_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'temp-chip';
    btn.textContent = t.label;
    btn.title = t.desc;
    btn.addEventListener('click', () => {
      profile.temperament = t.value;
      physics.setTemperament(t.value);
      syncCreatorForm();
      updateCaption();
      showToast(`已切换性格：${t.label}（${t.desc}）`);
    });
    tempChipBtns.set(t.value, btn);
    creatorTempsEl.appendChild(btn);
  }

  // Creator Form Event Listeners (Live 60fps Parametric Generation!)
  creatorNameInput.addEventListener('input', () => {
    profile.name = creatorNameInput.value;
    applyProfileAsCustom();
  });

  creatorC1Input.addEventListener('input', () => {
    profile.primaryHex = creatorC1Input.value;
    applyProfileAsCustom();
  });
  creatorC2Input.addEventListener('input', () => {
    profile.secondaryHex = creatorC2Input.value;
    applyProfileAsCustom();
  });
  creatorC3Input.addEventListener('input', () => {
    profile.tertiaryHex = creatorC3Input.value;
    applyProfileAsCustom();
  });

  creatorReseedBtn.addEventListener('click', () => {
    profile.patternSeed = Number((1 + Math.random() * 90).toFixed(2));
    applyProfileAsCustom();
    showToast('已重新生成花纹分布 ✨', 1200);
  });

  creatorFurLenInput.addEventListener('input', () => {
    profile.furLength = Number(creatorFurLenInput.value) / 100;
    creatorFurLenOut.textContent = furLengthLabel(profile.furLength);
    applyProfileAsCustom();
  });

  creatorTailInput.addEventListener('input', () => {
    profile.tailFluff = Number(creatorTailInput.value) / 100;
    creatorTailOut.textContent = `${Math.round(profile.tailFluff * 100)}%`;
    applyProfileAsCustom();
  });

  creatorRuffInput.addEventListener('input', () => {
    profile.ruffFluff = Number(creatorRuffInput.value) / 100;
    creatorRuffOut.textContent = `${Math.round(profile.ruffFluff * 100)}%`;
    applyProfileAsCustom();
  });

  creatorSheenInput.addEventListener('input', () => {
    profile.sheen = Number(creatorSheenInput.value) / 100;
    creatorSheenOut.textContent = `${Math.round(profile.sheen * 100)}%`;
    applyProfileAsCustom();
  });

  creatorPurrInput.addEventListener('input', () => {
    profile.purrHz = Number(creatorPurrInput.value);
    creatorPurrOut.textContent = `${profile.purrHz.toFixed(1)} Hz`;
    applyProfileAsCustom();
  });

  creatorRandomBtn.addEventListener('click', () => {
    profile = generateRandomCatProfile();
    sizeInput.value = String(profile.sizeIdx);
    widthInput.value = String(profile.widthIdx);
    syncProportions();
    syncCreatorForm();
    applyProfileAsCustom();
    showToast(`领养了一只新小猫「${profile.name}」🐱`, 1800);
  });

  function setCreatorOpen(open: boolean): void {
    creatorPanelEl.hidden = !open;
    creatorToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      setPopoverOpen(false);
      syncCreatorForm();
    }
  }

  creatorToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setCreatorOpen(creatorPanelEl.hidden);
  });

  creatorCloseBtn.addEventListener('click', () => {
    setCreatorOpen(false);
  });

  // ----- Tool Switcher (Hand / Comb / Laser) -----
  function selectTool(tool: ToolMode, announce = false): void {
    currentTool = tool;
    physics.setToolMode(tool);
    stageEl.dataset.tool = tool;
    for (const btn of toolButtons) {
      btn.setAttribute('aria-pressed', btn.dataset.tool === tool ? 'true' : 'false');
    }
    if (announce) {
      const tip: Record<ToolMode, string> = {
        hand: '徒手模式：顺毛轻撸 · 轻点屁股拍打 · 逆毛会炸毛',
        comb: '木质排梳：划过留下梳齿纹路，长毛猫还会掉毛球哦',
        laser: '红点激光笔：移动红点逗猫，凑近猫头会蓄力轻扑！',
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

  // ----- Proportions Popover -----
  function syncProportions(): void {
    const sIdx = Math.max(0, Math.min(SIZE_STEPS.length - 1, Number(sizeInput.value)));
    const wIdx = Math.max(0, Math.min(WIDTH_STEPS.length - 1, Number(widthInput.value)));
    profile.sizeIdx = sIdx;
    profile.widthIdx = wIdx;
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

  // ----- Atmosphere Cycle (Day -> Rain -> Night) -----
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
  function triggerSnapshot(): void {
    if (!renderer) return;
    renderer.render(0.016, physics.state, currentBreed);
    const title = profile.name.trim() || currentBreed.nameZh;
    const patLabel = PATTERN_OPTIONS.find((p) => p.value === profile.pattern)?.label ?? currentBreed.nameEn;
    exportPolaroidSnapshot(canvasEl, title, `${patLabel} · Open Pet the Cat`, atmosphere);
    showToast(`「${title}」拍立得合照已保存 📸`);
  }

  async function triggerShare(): Promise<void> {
    const hash = encodeSharedCatHash({
      atmosphere,
      presetBreedId: activePresetId,
      profile,
    });
    window.history.replaceState(null, '', hash);
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast(`已复制「${profile.name || '小猫'}」专属链接，发给朋友云撸吧 🔗`, 2400);
    } catch {
      showToast('专属链接已写入地址栏，可直接复制分享 🔗', 2400);
    }
  }

  snapshotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerSnapshot();
  });
  creatorPhotoBtn.addEventListener('click', triggerSnapshot);

  shareBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void triggerShare();
  });
  creatorShareBtn.addEventListener('click', () => {
    void triggerShare();
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

  // ----- Pointer & Bongo Butt-Pat Interaction -----
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

  stageEl.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, input, .creator-drawer, .stage-bar')) return;
    setPopoverOpen(false);
    purr.unlock();
    activePointerId = e.pointerId;
    isPressed = true;
    downTime = performance.now();
    downUv = stageUvFromEvent(e);
    stageEl.setPointerCapture?.(e.pointerId);
    physics.setPointer(downUv.u, downUv.v, true, true);
    stageEl.dataset.pressed = 'true';
  });

  stageEl.addEventListener('pointermove', (e) => {
    if ((e.target as HTMLElement).closest('.creator-drawer')) {
      if (!isPressed) physics.setPointerLeave();
      return;
    }
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const { u, v } = stageUvFromEvent(e);
    const touchingOrDown = isPressed || (e.buttons & 1) === 1;
    physics.setPointer(u, v, true, touchingOrDown);
  });

  function endPress(e: PointerEvent): void {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const upUv = stageUvFromEvent(e);
    const elapsed = performance.now() - downTime;
    const moved = Math.hypot(upUv.u - downUv.u, upUv.v - downUv.v);

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
    } else {
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
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      setCreatorOpen(creatorPanelEl.hidden);
    } else if (e.key === '1') {
      selectTool('hand', true);
    } else if (e.key === '2') {
      selectTool('comb', true);
    } else if (e.key === '3') {
      selectTool('laser', true);
    } else if (e.key === 'Escape') {
      if (!propPanelEl.hidden) setPopoverOpen(false);
      if (!creatorPanelEl.hidden) setCreatorOpen(false);
    }
  });

  // ----- Restore Shared Cat from URL Hash (#cat=...) -----
  const shared = decodeSharedCatHash(window.location.hash);
  if (shared) {
    profile = shared.profile;
    sizeInput.value = String(profile.sizeIdx);
    widthInput.value = String(profile.widthIdx);
    setAtmosphere(shared.atmosphere, false);
    if (shared.presetBreedId) {
      const matched = CAT_BREEDS.find((b) => b.id === shared.presetBreedId);
      if (matched) {
        activePresetId = matched.id;
        currentBreed = matched;
      } else {
        applyProfileAsCustom();
      }
    } else {
      applyProfileAsCustom();
    }
    showToast(`已载入分享小猫「${profile.name}」🐱`, 2200);
  } else {
    selectPresetBreed(defaultBreed);
  }

  syncProportions();
  syncCreatorForm();
  updateCaption();
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
