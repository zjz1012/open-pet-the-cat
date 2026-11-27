import './styles.css';
import { CAT_BREEDS, type CatBreed } from './breeds';
import { PurrEngine, type PurrVoiceId, type PurrVoicePreference } from './audio/purrEngine';
import {
  NATURAL_COAT_SWATCHES,
  PATTERN_OPTIONS,
  TEMPERAMENT_OPTIONS,
  breedFromProfile,
  decodeSharedCatState,
  downloadDataUrl,
  encodeSharedCatHash,
  encodeSharedCatToken,
  generateRandomCatProfile,
  profileFromBreed,
  renderPolaroidDataUrl,
  type AtmosphereMode,
  type CustomCatProfile,
} from './creator/catCreator';
import { CatPhysics, type ToolMode } from './physics/catPhysics';
import { CatRenderer } from './renderer/CatRenderer';
import { ToyBridge, type AuthorInfo, type ToyContainerState } from './sdk/toySdk';

const SIZE_STEPS = [0.65, 0.72, 0.79, 0.86, 0.93, 1.0, 1.03, 1.06, 1.09, 1.11, 1.14];
const WIDTH_STEPS = [0.80, 0.84, 0.88, 0.92, 0.96, 1.0, 1.08, 1.16, 1.24, 1.32, 1.40];
const ATMOSPHERE_CYCLE: AtmosphereMode[] = ['day', 'rain', 'night'];
const ATMOSPHERE_LABEL: Record<AtmosphereMode, string> = {
  day: '晴日',
  rain: '雨天',
  night: '月光',
};

/** Special rare longhair/hairless breeds & advanced toys that unlock after following the author */
const FOLLOW_LOCKED_BREEDS = new Set(['ragdoll', 'siberian', 'norwegian', 'sphynx']);
const LOCAL_DEMO_UNLOCK_KEY = 'open_pet_the_cat_local_demo_unlocked';

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
  const landscapeBtn = document.getElementById('landscape-toggle') as HTMLButtonElement;
  const expandBtn = document.getElementById('expand-toggle') as HTMLButtonElement;

  const propToggleBtn = document.getElementById('proportions-toggle') as HTMLButtonElement;
  const propPanelEl = document.getElementById('proportions-panel') as HTMLElement;
  const sizeInput = document.getElementById('cat-size') as HTMLInputElement;
  const widthInput = document.getElementById('cat-width') as HTMLInputElement;
  const sizeOut = document.getElementById('cat-size-out') as HTMLOutputElement;
  const widthOut = document.getElementById('cat-width-out') as HTMLOutputElement;
  const purrVolInput = document.getElementById('purr-volume') as HTMLInputElement;
  const purrVolOut = document.getElementById('purr-volume-out') as HTMLOutputElement;
  const purrVoiceBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-voice]'));
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

  // Follow-Lock Modal elements
  const followModalEl = document.getElementById('follow-modal') as HTMLElement;
  const followCloseBtn = document.getElementById('follow-close-btn') as HTMLButtonElement;
  const followAvatarEl = document.getElementById('follow-author-avatar') as HTMLImageElement;
  const followPlaceholderEl = document.getElementById('follow-author-placeholder') as HTMLElement;
  const followTitleEl = document.getElementById('follow-modal-title') as HTMLElement;
  const followSubEl = document.getElementById('follow-modal-sub') as HTMLElement;
  const followHintEl = document.getElementById('follow-status-hint') as HTMLElement;
  const followGoBtn = document.getElementById('follow-go-btn') as HTMLButtonElement;
  const followVerifyBtn = document.getElementById('follow-verify-btn') as HTMLButtonElement;
  const followDemoBtn = document.getElementById('follow-demo-btn') as HTMLButtonElement;

  const toastEl = document.getElementById('stage-toast') as HTMLElement;

  const toyBridge = new ToyBridge();
  const physics = new CatPhysics();
  const purr = new PurrEngine();

  const defaultBreed = CAT_BREEDS.find((b) => b.id === 'hana') ?? CAT_BREEDS[0];
  let activePresetId: string | null = defaultBreed.id;
  let profile: CustomCatProfile = profileFromBreed(defaultBreed);
  let currentBreed: CatBreed = defaultBreed;
  let atmosphere: AtmosphereMode = 'day';
  let currentTool: ToolMode = 'hand';
  let purrVoicePref: PurrVoicePreference = 'auto';

  function resolveBreedPurrVoice(breed: CatBreed): PurrVoiceId {
    if (purrVoicePref !== 'auto') return purrVoicePref;
    if (breed.purrHz <= 24.4) return 'deep'; // Big floofs, Orange Tabby, Blue Grey, Ragdoll, Siberian, Norwegian
    if (breed.purrHz >= 26.2) return 'soft'; // White, Calico, Siamese, Sphynx
    return 'warm'; // Classic warm domestic purr (Black, Silver/Brown Tabby, Bicolor, Tortie)
  }

  function syncPurrVoice(): void {
    purr.setBreedPurrHz(currentBreed.purrHz);
    purr.setPurrVoice(resolveBreedPurrVoice(currentBreed));
  }

  // Follow-Lock state (locked by default until verified via toy.getAuthorRelation!)
  let followUnlocked = false;
  let isStandalonePreview = false;
  let authorInfo: AuthorInfo | null = null;
  let isLandscapeMode = false;
  let pendingUnlockAction: (() => void) | null = null;

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

  // ----- Follow-Lock UI & Bilibili SDK Verification -----
  const swatchButtons = new Map<string, HTMLButtonElement>();
  const lockedFeatureEls = Array.from(document.querySelectorAll<HTMLElement>('[data-lock-feature]'));

  function syncLockBadges(): void {
    for (const el of lockedFeatureEls) {
      if (followUnlocked) {
        delete el.dataset.locked;
      } else {
        el.dataset.locked = 'true';
      }
    }
    for (const [id, btn] of swatchButtons) {
      if (!followUnlocked && FOLLOW_LOCKED_BREEDS.has(id)) {
        btn.dataset.locked = 'true';
      } else {
        delete btn.dataset.locked;
      }
    }
  }

  function openFollowModal(featureLabel: string, onUnlocked?: () => void): void {
    pendingUnlockAction = onUnlocked ?? null;
    followTitleEl.textContent = authorInfo?.nickname
      ? `关注「${authorInfo.nickname}」免费解锁`
      : '关注 UP 主免费解锁';
    followSubEl.textContent = `「${featureLabel}」为粉丝专属特色功能，关注即可立即使用`;
    followHintEl.textContent = '';

    if (authorInfo?.avatar) {
      followAvatarEl.src = authorInfo.avatar;
      followAvatarEl.hidden = false;
      followPlaceholderEl.hidden = true;
    } else {
      followAvatarEl.hidden = true;
      followPlaceholderEl.hidden = false;
    }

    // Demo unlock button is strictly hidden inside real Bilibili runtime!
    followDemoBtn.hidden = !isStandalonePreview;
    followModalEl.hidden = false;
  }

  function closeFollowModal(): void {
    followModalEl.hidden = true;
    pendingUnlockAction = null;
  }

  function requireFollowUnlock(featureLabel: string, action: () => void): void {
    if (followUnlocked) {
      action();
      return;
    }
    openFollowModal(featureLabel, action);
  }

  async function refreshFollowStatus(userTriggered = false): Promise<void> {
    const res = await toyBridge.checkAuthorFollow();
    if (res.state === 'following') {
      isStandalonePreview = false;
      const wasLocked = !followUnlocked;
      followUnlocked = true;
      syncLockBadges();
      const cb = pendingUnlockAction;
      closeFollowModal();
      if (wasLocked) {
        showToast('感谢关注！已解锁全部稀有猫种与特色玩法 ✨', 2400);
      }
      cb?.();
      return;
    }

    if (res.state === 'not_following') {
      isStandalonePreview = false;
      followUnlocked = false;
      syncLockBadges();
      if (userTriggered) {
        followHintEl.textContent = '暂未检测到关注状态，请先关注 UP 主后再点击刷新哦~';
      }
      return;
    }

    if (res.state === 'unavailable') {
      isStandalonePreview = false;
      // Strictly follow SDK rule: never treat unavailable/unauthorized as unlocked!
      followUnlocked = false;
      syncLockBadges();
      if (userTriggered) {
        followHintEl.textContent = '请先登录 B站账号并关注 UP 主，或稍后再试';
      }
      return;
    }

    // Standalone local/Web preview outside Bilibili Toy SDK
    isStandalonePreview = true;
    followUnlocked = window.localStorage.getItem(LOCAL_DEMO_UNLOCK_KEY) === '1';
    syncLockBadges();
    if (userTriggered && !followUnlocked) {
      followHintEl.textContent = '当前为非 B站独立预览环境，可点下方「模拟已关注」体验解锁效果';
    }
  }

  followCloseBtn.addEventListener('click', closeFollowModal);
  followModalEl.addEventListener('pointerdown', (e) => {
    if (e.target === followModalEl) closeFollowModal();
  });

  followGoBtn.addEventListener('click', async () => {
    // navigate() MUST be triggered directly inside a user click gesture
    if (authorInfo?.mid) {
      const ok = await toyBridge.navigateToAuthorSpace(authorInfo.mid);
      if (ok) {
        followHintEl.textContent = '已前往 UP 主主页，关注后返回即可自动解锁~';
        return;
      }
    }
    if (isStandalonePreview) {
      followHintEl.textContent = '请在 B站 App/Web Toy 页面中关注作者，本地预览可点下方模拟解锁';
    } else {
      followHintEl.textContent = '请点击页面顶部作者头像关注 UP 主，关注后点「刷新解锁」即可';
    }
  });

  followVerifyBtn.addEventListener('click', () => {
    followHintEl.textContent = '正在验证关注状态…';
    void refreshFollowStatus(true);
  });

  followDemoBtn.addEventListener('click', () => {
    if (!isStandalonePreview) return;
    window.localStorage.setItem(LOCAL_DEMO_UNLOCK_KEY, '1');
    followUnlocked = true;
    syncLockBadges();
    const cb = pendingUnlockAction;
    closeFollowModal();
    showToast('本地预览：已模拟关注并解锁全部特色功能 ✨', 2200);
    cb?.();
  });

  // Auto re-check follow status whenever user returns from author space page!
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!followUnlocked) {
        void refreshFollowStatus(false);
      }
    } else if (document.visibilityState === 'hidden') {
      // Best-practice cloud save checkpoint on page hide
      const token = encodeSharedCatToken({
        atmosphere,
        presetBreedId: activePresetId,
        profile,
      });
      void toyBridge.saveCloudProfile(token);
    }
  });

  // ----- Bilibili App Container SafeArea & Orientation Adaptation -----
  function applyContainerState(state: ToyContainerState): void {
    const root = document.documentElement;
    root.dataset.biliApp = 'true';
    root.style.setProperty('--safe-top', `${state.safeArea?.top ?? 0}px`);
    root.style.setProperty('--safe-right', `${state.safeArea?.right ?? 0}px`);
    root.style.setProperty('--safe-bottom', `${state.safeArea?.bottom ?? 0}px`);
    root.style.setProperty('--safe-left', `${state.safeArea?.left ?? 0}px`);

    const isLand = state.orientation === 'landscape';
    isLandscapeMode = isLand;
    root.dataset.landscape = isLand ? 'true' : 'false';
    landscapeBtn.setAttribute('aria-pressed', isLand ? 'true' : 'false');
    renderer?.resize();
  }

  landscapeBtn.addEventListener('click', async () => {
    const nextLand = !isLandscapeMode;
    // Try native Bilibili App atomic orientation + immersive switch first!
    // Per SDK doc: mobile requires landscape + immersive:true together.
    const sdkApplied = await toyBridge.setContainerMode(
      nextLand ? 'landscape' : 'portrait',
      nextLand,
    );
    if (!sdkApplied) {
      // Fallback for mobile browsers & desktop preview
      isLandscapeMode = nextLand;
      document.documentElement.dataset.landscape = nextLand ? 'true' : 'false';
      landscapeBtn.setAttribute('aria-pressed', nextLand ? 'true' : 'false');
      const scrOri = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
        unlock?: () => void;
      };
      if (nextLand) {
        await scrOri?.lock?.('landscape').catch(() => {});
      } else {
        scrOri?.unlock?.();
      }
      renderer?.resize();
      showToast(nextLand ? '已切换横屏沉浸视野 📱' : '已恢复常规视野');
    } else {
      showToast(nextLand ? '正在切换横屏沉浸模式…' : '正在恢复竖屏模式…', 1400);
    }
  });

  // ----- Breed Swatches & Parametric Profile Sync -----
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
    syncPurrVoice();
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
    syncPurrVoice();
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
    const isRare = FOLLOW_LOCKED_BREEDS.has(breed.id);
    btn.title = isRare ? `${breed.nameZh}（关注 UP 主解锁）` : `${breed.nameZh} (${breed.nameEn})`;
    btn.setAttribute('aria-label', `${breed.nameZh} ${breed.nameEn}`);
    btn.setAttribute('aria-pressed', breed.id === currentBreed.id ? 'true' : 'false');

    const fill = document.createElement('span');
    fill.className = 'breed-swatch-fill';
    fill.style.background = breed.swatchGradient;
    btn.appendChild(fill);

    btn.addEventListener('click', () => {
      if (isRare) {
        requireFollowUnlock(`稀有猫种 · ${breed.nameZh}`, () => selectPresetBreed(breed));
      } else {
        selectPresetBreed(breed);
      }
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
    dot.title = `${sw.name}（点击设为主毛色，Shift+点击设为花纹色）`;
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
    if (!creatorPanelEl.hidden) {
      setCreatorOpen(false);
      return;
    }
    requireFollowUnlock('基因捏猫工坊', () => setCreatorOpen(true));
  });

  creatorCloseBtn.addEventListener('click', () => {
    setCreatorOpen(false);
  });

  // ----- Tool Switcher (Hand free; Comb & Laser follow-locked!) -----
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
        comb: '木质排梳：顺毛留丝滑梳痕掉毛球 · 逆梳会炸毛自舔哦',
        laser: '红点激光笔：围着猫画圈，看它 360° 转圈追红点！',
      };
      showToast(tip[tool], 2300);
    }
  }

  for (const btn of toolButtons) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tool = btn.dataset.tool as ToolMode | undefined;
      if (!tool) return;
      if (tool === 'comb') {
        requireFollowUnlock('木质排梳', () => selectTool('comb', true));
      } else if (tool === 'laser') {
        requireFollowUnlock('红点激光笔', () => selectTool('laser', true));
      } else {
        selectTool('hand', true);
      }
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

  purrVolInput.addEventListener('input', () => {
    const pct = Number(purrVolInput.value);
    purrVolOut.textContent = `${pct}%`;
    purr.setVolume(pct / 100);
  });

  for (const btn of purrVoiceBtns) {
    btn.addEventListener('click', () => {
      const v = btn.dataset.voice as PurrVoicePreference | undefined;
      if (!v) return;
      purrVoicePref = v;
      for (const b of purrVoiceBtns) {
        b.setAttribute('aria-pressed', b.dataset.voice === v ? 'true' : 'false');
      }
      syncPurrVoice();
      if (!purr.isEnabled()) {
        void purr.setEnabled(true).then(() => {
          soundBtn.setAttribute('aria-checked', 'true');
        });
      }
      const names: Record<PurrVoicePreference, string> = {
        auto: '随猫咪品种自动匹配呼噜声',
        warm: '温润贴耳呼噜声',
        deep: '低沉大猫呼噜声',
        soft: '轻柔晚安呼噜声',
      };
      showToast(`已切换：${names[v]}`, 1500);
    });
  }

  resetPropBtn.addEventListener('click', () => {
    sizeInput.value = '5';
    widthInput.value = '5';
    purrVolInput.value = '40';
    purrVolOut.textContent = '40%';
    purr.setVolume(0.40);
    purrVoicePref = 'auto';
    for (const b of purrVoiceBtns) {
      b.setAttribute('aria-pressed', b.dataset.voice === 'auto' ? 'true' : 'false');
    }
    syncProportions();
    syncPurrVoice();
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

  // ----- Atmosphere Cycle (Day & Night free; Rainy Afternoon ASMR follow-locked!) -----
  function setAtmosphere(mode: AtmosphereMode, announce = false): void {
    atmosphere = mode;
    document.documentElement.dataset.theme = mode === 'night' ? 'dark' : mode === 'rain' ? 'rain' : 'light';
    atmosphereLabelEl.textContent = ATMOSPHERE_LABEL[mode];
    renderer?.setAtmosphere(mode);
    purr.setRainAmbience(mode === 'rain');
    if (announce) {
      if (mode === 'rain') {
        showToast(purr.isEnabled() ? '雨天午后 · 窗外细雨 + 呼噜白噪音' : '雨天午后 · 开启声音可听细雨 ASMR');
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
    const nextMode = ATMOSPHERE_CYCLE[nextIdx];
    if (nextMode === 'rain' && !followUnlocked) {
      // Allow cycling to night smoothly or offer follow unlock for Rain ASMR!
      openFollowModal('雨天午后 ASMR', () => setAtmosphere('rain', true));
      return;
    }
    setAtmosphere(nextMode, true);
  });

  // ----- Safety Check + Polaroid Snapshot (Native Bilibili Album or Web Download) + Share -----
  async function validateCustomNameBeforeExport(): Promise<boolean> {
    if (activePresetId) return true; // Built-in breed names don't need check
    const check = await toyBridge.checkCatNameSafety(profile.name);
    if (check === 'rejected') {
      showToast('这个猫咪名字暂不可展示，换一个名字试试吧', 2400);
      return false;
    }
    if (check === 'unavailable') {
      showToast('暂时无法校验名字安全，请稍后再试', 2200);
      return false;
    }
    return true;
  }

  async function triggerSnapshot(): Promise<void> {
    if (!renderer) return;
    if (!(await validateCustomNameBeforeExport())) return;

    renderer.render(0.016, physics.state, currentBreed);
    const title = profile.name.trim() || currentBreed.nameZh;
    const patLabel = PATTERN_OPTIONS.find((p) => p.value === profile.pattern)?.label ?? currentBreed.nameEn;
    const dataUrl = renderPolaroidDataUrl(canvasEl, title, `${patLabel} · Open Pet the Cat`, atmosphere);
    if (!dataUrl) return;

    const saveRes = await toyBridge.saveImage(dataUrl);
    if (saveRes === 'saved_album') {
      showToast(`「${title}」拍立得已保存到手机相册 📸`);
    } else if (saveRes === 'fallback') {
      downloadDataUrl(dataUrl, `pet-the-cat-${Date.now()}.jpg`);
      showToast(`「${title}」拍立得合照已保存 📸`);
    } else {
      showToast('保存相册未完成，请检查相册权限后重试');
    }
  }

  async function triggerShare(): Promise<void> {
    if (!(await validateCustomNameBeforeExport())) return;

    const token = encodeSharedCatToken({
      atmosphere,
      presetBreedId: activePresetId,
      profile,
    });
    void toyBridge.saveCloudProfile(token);

    // Inside Bilibili App: use native toy.share with relative Toy path (index.html?cat=...)
    const sharedNative = await toyBridge.shareToyPath(`index.html?cat=${token}`);
    if (sharedNative) return;

    // Web fallback: update hash & copy link
    const hash = encodeSharedCatHash({
      atmosphere,
      presetBreedId: activePresetId,
      profile,
    });
    window.history.replaceState(null, '', hash);
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast(`已复制「${profile.name || '小猫'}」专属链接，发给朋友云撸吧 🔗`, 2400);
    } catch {
      showToast('专属链接已写入地址栏，可直接复制分享 🔗', 2400);
    }
  }

  snapshotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void triggerSnapshot();
  });
  creatorPhotoBtn.addEventListener('click', () => {
    void triggerSnapshot();
  });

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
      themeBtn.click();
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      creatorToggleBtn.click();
    } else if (e.key === '1') {
      selectTool('hand', true);
    } else if (e.key === '2') {
      requireFollowUnlock('木质排梳', () => selectTool('comb', true));
    } else if (e.key === '3') {
      requireFollowUnlock('红点激光笔', () => selectTool('laser', true));
    } else if (e.key === 'Escape') {
      if (!followModalEl.hidden) closeFollowModal();
      if (!propPanelEl.hidden) setPopoverOpen(false);
      if (!creatorPanelEl.hidden) setCreatorOpen(false);
    }
  });

  // ----- Restore Shared Cat from Query (?cat=...) or Hash (#cat=...) -----
  function applyDecodedState(shared: NonNullable<ReturnType<typeof decodeSharedCatState>>, announce: boolean): void {
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
    syncProportions();
    syncCreatorForm();
    updateCaption();
    if (announce) {
      showToast(`已载入分享小猫「${profile.name}」🐱`, 2200);
    }
  }

  const sharedFromUrl =
    decodeSharedCatState(window.location.search) ?? decodeSharedCatState(window.location.hash);
  if (sharedFromUrl) {
    applyDecodedState(sharedFromUrl, true);
  } else {
    selectPresetBreed(defaultBreed);
    syncProportions();
  }

  syncLockBadges();
  selectTool('hand', false);

  // ----- Async Bootstrap Bilibili Toy SDK (Container safeArea, Author Profile, Follow-Lock, Cloud Save, PageClose) -----
  void (async () => {
    await toyBridge.initContainer(applyContainerState);
    authorInfo = await toyBridge.getAuthorProfile();
    await refreshFollowStatus(false);

    // Restore cloud-saved cat if no explicit shared URL was opened
    if (!sharedFromUrl) {
      const cloudToken = await toyBridge.loadCloudProfile();
      if (cloudToken) {
        const cloudState = decodeSharedCatState(cloudToken);
        if (cloudState) applyDecodedState(cloudState, false);
      }
    }

    await toyBridge.onPageClose(() => {
      purr.dispose();
    });
  })();

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
      if (events.startedSelfGroom) {
        showToast('毛被梳炸啦，小猫正在自己低头舔毛理顺… 👅', 2400);
      }
      if (events.lickStroke) {
        purr.playLickSound();
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
