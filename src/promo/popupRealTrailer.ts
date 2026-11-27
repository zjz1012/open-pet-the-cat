import { CAT_BREEDS, type CatBreed } from '../breeds';
import {
  drawPolaroidToCanvas,
  type AtmosphereMode,
  type PolaroidStyleId,
} from '../creator/catCreator';
import { CatPhysics } from '../physics/catPhysics';
import { CatRenderer } from '../renderer/CatRenderer';

const DURATION = 65.0;

interface ActSpec {
  id: number;
  start: number;
  end: number;
  title: string;
  tag: string;
  sub: string;
}

const ACTS: ActSpec[] = [
  {
    id: 0,
    start: 0,
    end: 10,
    title: '01 翻开立体书',
    tag: '📖 100% 实机录制 · 窗边暖阳',
    sub: '忙了一整天，翻开这本会呼噜的猫猫立体书，一只暖呼呼的小猫正在窗边等你。',
  },
  {
    id: 1,
    start: 10,
    end: 22,
    title: '02 顺毛贴耳呼噜',
    tag: '🤚 20层实时体积毛发 · 真实呼噜',
    sub: '轻轻滑过它的背脊，蓬松毛发随指尖起伏，温柔的呼噜声也在耳边慢慢响起。',
  },
  {
    id: 2,
    start: 22,
    end: 34,
    title: '03 拍屁股与炸毛',
    tag: '🐾 拍屁股尾巴绷直 · 逆毛炸毛自舔',
    sub: '拍拍圆屁股，尾巴立马开心绷直；逆毛搓炸了毛，会气呼呼甩尾再低头舔顺。',
  },
  {
    id: 3,
    start: 34,
    end: 46,
    title: '04 排梳与追激光',
    tag: '🪮 木质排梳攒毛球 · 🔴 360° 追红点',
    sub: '换把木质排梳攒出软乎乎的小毛球，或晃晃红点激光笔，看它满垫转圈扑抓！',
  },
  {
    id: 4,
    start: 46,
    end: 56,
    title: '05 13只猫与拍立得',
    tag: '📸 13 种猫咪 · 4 款可爱拍立得相纸',
    sub: '13 种猫咪随心切换，还能亲手捏猫、选可爱相纸拍立得留念，云存档下次接着撸。',
  },
  {
    id: 5,
    start: 56,
    end: 65,
    title: '06 晴雨夜落版',
    tag: '🌙 晴日 / 雨天 ASMR / 月光晚安',
    sub: '无论晴天、雨天还是月光夜晚，点评论区或视频下方 Toy 链接，来「呼噜噜云撸猫」领走你的治愈呼噜。',
  },
];

function getBreed(id: string): CatBreed {
  return CAT_BREEDS.find((b) => b.id === id) ?? CAT_BREEDS[0];
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function initRealPopupTrailer(): void {
  const stageCanvas = document.getElementById('real-cat-canvas') as HTMLCanvasElement;
  const bookSpreadEl = document.getElementById('book-spread') as HTMLElement;
  const popTagEl = document.getElementById('pop-tag') as HTMLElement;
  const subtitleEl = document.getElementById('subtitle-pill') as HTMLElement;
  const titleCardEl = document.getElementById('intro-ribbon') as HTMLElement;
  const endCardEl = document.getElementById('end-card') as HTMLElement;
  const flashEl = document.getElementById('shutter-flash') as HTMLElement;
  const polaroidWrapEl = document.getElementById('polaroid-pop') as HTMLElement;
  const polaroidCanvas = document.getElementById('polaroid-shot') as HTMLCanvasElement;
  const breedBadgeEl = document.getElementById('breed-pop-badge') as HTMLElement;

  const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  const audioBtn = document.getElementById('audio-btn') as HTMLButtonElement;
  const scrubInput = document.getElementById('scrub') as HTMLInputElement;
  const timeReadoutEl = document.getElementById('time-readout') as HTMLElement;
  const chaptersEl = document.getElementById('chapters') as HTMLElement;
  const themeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-paper-theme]'));

  // 1) Boot the 100% REAL WebGL2 Cat Engine!
  const isRenderMode = window.location.search.includes('render=1');
  const physics = new CatPhysics();
  const renderer = new CatRenderer(stageCanvas);
  renderer.resize();
  const assetsReadyPromise = renderer.loadAssets('/assets/cushion-bg.webp', '/assets/petting-hand.webp');

  // Full 65-second soothing felt-piano + music-box + real cat purr + synced SFX soundtrack!
  const soundtrack = new Audio('/promo-previews/promo-bgm-65s.mp3');
  soundtrack.preload = isRenderMode ? 'none' : 'auto';
  soundtrack.volume = 0.85;
  let audioOn = !isRenderMode;

  function syncAudioTime(forceSeek = false): void {
    if (!audioOn) return;
    if (forceSeek || Math.abs(soundtrack.currentTime - curT) > 0.28) {
      soundtrack.currentTime = Math.max(0, Math.min(DURATION - 0.05, curT));
    }
    if (playing && soundtrack.paused) {
      void soundtrack.play().catch(() => {});
    } else if (!playing && !soundtrack.paused) {
      soundtrack.pause();
    }
  }

  function updateAudioBtnUi(): void {
    audioBtn.setAttribute('aria-pressed', audioOn ? 'true' : 'false');
    audioBtn.textContent = audioOn ? '🔊 舒缓配乐 + 呼噜：开' : '🔇 舒缓配乐 + 呼噜：关';
  }
  updateAudioBtnUi();

  function togglePurrAudio(): void {
    audioOn = !audioOn;
    updateAudioBtnUi();
    if (audioOn) {
      syncAudioTime(true);
    } else {
      soundtrack.pause();
    }
  }
  audioBtn.addEventListener('click', togglePurrAudio);

  // Auto-unlock soundtrack on first click/touch anywhere in the preview page
  if (!isRenderMode) {
    const unlockOnce = (): void => {
      if (audioOn && playing && soundtrack.paused) {
        syncAudioTime(true);
      }
    };
    window.addEventListener('pointerdown', unlockOnce, { capture: true, passive: true });
    void soundtrack.play().catch(() => {});
  }

  // Paper theme switcher (3 cozy Paper Pop-up palettes around the REAL game screen!)
  for (const btn of themeBtns) {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.paperTheme || 'cream';
      document.documentElement.dataset.paper = theme;
      for (const b of themeBtns) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      }
    });
  }

  // Chapter buttons
  const chapBtns = ACTS.map((act) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chap';
    const endLabel = act.end >= 60 ? `1:0${act.end - 60}` : `0:${String(act.end).padStart(2, '0')}`;
    b.innerHTML = `${act.title}<span>0:${String(act.start).padStart(2, '0')}–${endLabel}</span>`;
    b.addEventListener('click', () => {
      jumpTo(act.start);
    });
    chaptersEl.appendChild(b);
    return b;
  });

  let playing = true;
  let curT = 0;
  let currentBreed: CatBreed = getBreed('mugi');
  let currentAtmos: AtmosphereMode = 'day';
  let lastPatIdx = -1;
  let polaroidCaptured = false;

  function setAtmos(next: AtmosphereMode): void {
    if (currentAtmos === next) return;
    currentAtmos = next;
    renderer.setAtmosphere(next);
    bookSpreadEl.dataset.atmos = next;
  }

  function resetSceneForJump(t: number): void {
    physics.clearFurballs();
    physics.setPointerLeave();
    physics.state.ruffleLevel = 0;
    physics.state.annoyance = 0;
    physics.state.catHeading = 0;
    physics.state.catPos.x = 0.525;
    physics.state.catPos.y = 0.545;
    lastPatIdx = -1;
    polaroidCaptured = false;
    polaroidWrapEl.classList.remove('show');
    if (t < 34) {
      physics.setToolMode('hand');
      currentBreed = getBreed('mugi');
    } else if (t < 40) {
      physics.setToolMode('comb');
      currentBreed = getBreed('hana');
    } else if (t < 46) {
      physics.setToolMode('laser');
      currentBreed = getBreed('kuro');
    } else {
      physics.setToolMode('hand');
    }
  }

  function jumpTo(t: number): void {
    curT = Math.max(0, Math.min(DURATION, t));
    resetSceneForJump(curT);
    syncAudioTime(true);
    syncControls();
  }

  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '暂停 ⏸' : '播放 ▶';
    syncAudioTime(true);
  });

  scrubInput.addEventListener('input', () => {
    jumpTo(Number(scrubInput.value));
  });

  function syncControls(): void {
    scrubInput.value = curT.toFixed(2);
    timeReadoutEl.textContent = `${fmtTime(curT)} / 01:05`;
    const act = ACTS.find((a) => curT >= a.start && curT < a.end) ?? ACTS[ACTS.length - 1];
    popTagEl.textContent = act.tag;
    subtitleEl.textContent = act.sub;
    chapBtns.forEach((b, i) => {
      const a = ACTS[i];
      b.classList.toggle('active', curT >= a.start && (curT < a.end || (i === ACTS.length - 1 && curT >= a.start)));
    });
  }

  // Deterministic 65-second director choreography driving the REAL WebGL2 physics & renderer!
  function directFrame(t: number, aspect: number): void {
    // Intro ribbon (0..7.5s)
    titleCardEl.classList.toggle('show', t >= 0.6 && t < 7.8);
    // End card (60.2..65s)
    endCardEl.classList.toggle('show', t >= 60.2);

    if (t < 10) {
      // Act 1: Cozy breathing sunlit Orange Tabby
      setAtmos('day');
      currentBreed = getBreed('mugi');
      physics.setToolMode('hand');
      physics.setPointerLeave();
      breedBadgeEl.classList.remove('show');
      polaroidWrapEl.classList.remove('show');
    } else if (t < 22) {
      // Act 2: Real smooth with-grain petting from head -> back -> rump!
      setAtmos('day');
      currentBreed = getBreed('mugi');
      physics.setToolMode('hand');
      breedBadgeEl.classList.remove('show');
      const lt = t - 10;
      const cycle = (lt % 3.0) / 3.0; // smooth left -> right strokes with grain
      if (cycle < 0.78) {
        const p = cycle / 0.78;
        const u = 0.30 + p * 0.36;
        const v = 0.52 + Math.sin(p * Math.PI) * 0.025;
        physics.setPointer(u, v, true, true);
      } else {
        physics.setPointer(0.32, 0.48, true, false);
      }
    } else if (t < 34) {
      // Act 3: Real butt-pat (stiff tail!) -> real against-grain rub (bristle + tail lash -> self-groom!)
      setAtmos('day');
      currentBreed = getBreed('mugi');
      physics.setToolMode('hand');
      const lt = t - 22;
      if (lt < 5.2) {
        // 4 rhythmic real butt pats -> real stiff tail & elevator butt!
        const patIdx = Math.floor(lt / 1.1);
        const frac = (lt % 1.1) / 1.1;
        physics.setPointer(0.60, 0.53 - Math.sin(Math.min(1, frac * 3) * Math.PI) * 0.06, true, frac < 0.25);
        if (patIdx !== lastPatIdx && patIdx < 4) {
          lastPatIdx = patIdx;
          physics.triggerTap(0.60, 0.53, aspect);
        }
        breedBadgeEl.textContent = '🐾 拍猫屁股 · 尾巴绷直！';
        breedBadgeEl.classList.add('show');
      } else if (lt < 8.4) {
        // Real against-grain strokes (right -> left) to trigger REAL spiky fur & tail lash!
        const rt = lt - 5.2;
        const p = (rt % 0.9) / 0.9;
        const u = 0.64 - p * 0.30;
        physics.setPointer(u, 0.53, true, true);
        breedBadgeEl.textContent = '😾 逆毛炸毛 · 剧烈甩尾巴';
        breedBadgeEl.classList.add('show');
      } else {
        // Hands off -> real cat finishes tail lash and curls head to self-groom!
        physics.setPointerLeave();
        breedBadgeEl.textContent = '👅 甩完尾巴消气 · 低头自舔理顺';
        breedBadgeEl.classList.add('show');
      }
    } else if (t < 46) {
      // Act 4: Real wooden comb spawning furballs -> Real 360° red laser chase!
      setAtmos('day');
      const lt = t - 34;
      if (lt < 6.0) {
        currentBreed = getBreed('hana'); // Calico
        physics.setToolMode('comb');
        const p = (lt % 1.8) / 1.8;
        const u = 0.34 + p * 0.32;
        const v = 0.52 + Math.sin(lt * 2.5) * 0.04;
        physics.setPointer(u, v, true, true);
        breedBadgeEl.textContent = '🪮 木质排梳 · 丝滑梳痕 & 攒毛球';
        breedBadgeEl.classList.add('show');
      } else {
        currentBreed = getBreed('kuro'); // Sleek Black Cat
        physics.setToolMode('laser');
        const ct = lt - 6.0;
        const orb = ct * 1.45;
        const u = 0.52 + Math.cos(orb) * 0.30;
        const v = 0.54 + Math.sin(orb) * 0.26;
        physics.setPointer(u, v, true, ct > 3.2 && ct < 3.8);
        breedBadgeEl.textContent = '🔴 红点激光笔 · 360° 追逐扑抓';
        breedBadgeEl.classList.add('show');
      }
    } else if (t < 56) {
      // Act 5: Real breed parade + LIVE Polaroid capture directly from the real WebGL2 canvas!
      setAtmos('day');
      physics.setToolMode('hand');
      physics.setPointerLeave();
      const lt = t - 46;
      const parade: [string, string][] = [
        ['mugi', '橘猫 · 免费开放'],
        ['kuro', '黑猫 · 免费开放'],
        ['hana', '三花猫 · 关注解锁'],
        ['shiro', '白猫 · 关注解锁'],
        ['ragdoll', '布偶猫 · 关注解锁'],
        ['norwegian', '挪威森林猫 · 关注解锁'],
      ];
      const idx = Math.min(parade.length - 1, Math.floor(lt / 1.45));
      currentBreed = getBreed(parade[idx][0]);
      breedBadgeEl.textContent = `🐱 ${parade[idx][1]}`;
      breedBadgeEl.classList.add('show');

      if (lt >= 5.0 && !polaroidCaptured) {
        polaroidCaptured = true;
        // Snap REAL WebGL2 frame onto the Polaroid card!
        renderer.render(0.016, physics.state, currentBreed);
        const style: PolaroidStyleId =
          document.documentElement.dataset.paper === 'sakura' ? 'sakura' : 'sticker';
        drawPolaroidToCanvas(polaroidCanvas, stageCanvas, {
          catName: currentBreed.nameZh,
          subtitle: '实机拍立得留念',
          atmosphere: currentAtmos,
          style,
          photoWidth: 420,
          showViewfinderGuides: false,
        });
        flashEl.classList.add('active');
        window.setTimeout(() => flashEl.classList.remove('active'), 90);
        polaroidWrapEl.classList.add('show');
      }
    } else {
      // Act 6: Real Day -> Rainy Afternoon ASMR -> Silver Moonlight!
      physics.setToolMode('hand');
      physics.setPointerLeave();
      polaroidWrapEl.classList.remove('show');
      currentBreed = getBreed('mugi');
      if (t < 59.5) {
        setAtmos('rain');
        breedBadgeEl.textContent = '🌧️ 雨天午后 · 窗影雨滴 ASMR';
        breedBadgeEl.classList.add('show');
      } else {
        setAtmos('night');
        breedBadgeEl.classList.remove('show');
      }
    }
  }

  const ro = new ResizeObserver(() => renderer.resize());
  ro.observe(stageCanvas);

  let lastTs = performance.now();
  function frame(ts: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;

    if (playing) {
      curT += dt;
      if (curT > DURATION) {
        curT = 0;
        resetSceneForJump(0);
        syncAudioTime(true);
      } else {
        syncAudioTime(false);
      }
    }

    const aspect = renderer.getAspect();
    directFrame(curT, aspect);
    physics.step(dt, aspect, currentBreed.furLength, currentBreed.primaryColor);
    renderer.render(dt, physics.state, currentBreed);
    syncControls();

    requestAnimationFrame(frame);
  }

  resetSceneForJump(0);

  if (isRenderMode) {
    // Deterministic headless 4K capture mode: driven frame-by-frame via CDP!
    playing = false;
    const win = window as unknown as {
      __trailerReady?: Promise<boolean>;
      __trailerStep?: (t: number, dt: number) => void;
    };
    win.__trailerReady = assetsReadyPromise.then(() => {
      renderer.resize();
      return true;
    });
    win.__trailerStep = (t: number, dt: number) => {
      curT = t;
      const aspect = renderer.getAspect();
      directFrame(curT, aspect);
      physics.step(dt, aspect, currentBreed.furLength, currentBreed.primaryColor);
      renderer.render(dt, physics.state, currentBreed);
      syncControls();
    };
  } else {
    requestAnimationFrame(frame);
  }
}

initRealPopupTrailer();
