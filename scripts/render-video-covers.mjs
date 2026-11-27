/**
 * Renders two Bilibili-ready video covers (16:9 1920x1080 & 4:3 1200x900)
 * compositing our 100% REAL WebGL2 cat-petting frame with crisp, high-CTR
 * Chinese typography, warm sunlit grading, and Bilibili safe-zone clearance!
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const POSTER_IMG = path.resolve('release/hululu-promo-poster.jpg');
const OUT_16_9 = path.resolve('release/video-cover-16x9-1920x1080.jpg');
const OUT_4_3 = path.resolve('release/video-cover-4x3-1200x900.jpg');

function buildCoverHtml(w, h, imgDataUri, is43) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${w}px;
    height: ${h}px;
    overflow: hidden;
    font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif;
    background: #231912;
  }
  .cover {
    position: relative;
    width: ${w}px;
    height: ${h}px;
    overflow: hidden;
  }
  /* Crop strictly inside the pure real WebGL2 stage (zero book border/stray UI) & shift cat+hand right! */
  .bg-shot {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 45%;
    transform: translate(${is43 ? '12%' : '14%'}, ${is43 ? '5%' : '6%'}) scale(${is43 ? 1.62 : 1.56});
    filter: contrast(1.07) saturate(1.14) brightness(1.03);
  }
  /* Warm espresso-amber left scrim for crisp high-CTR text legibility without darkening the cat */
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      95deg,
      rgba(26, 17, 11, 0.92) 0%,
      rgba(32, 21, 14, 0.80) 30%,
      rgba(36, 24, 15, 0.24) 50%,
      rgba(255, 226, 175, 0.02) 100%
    );
  }
  /* Subtle warm sunlight rim glow from top-right */
  .sun-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 78% 18%, rgba(255, 224, 156, 0.26), transparent 52%);
    pointer-events: none;
  }

  .left-col {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: ${is43 ? '64%' : '56%'};
    padding: ${is43 ? '58px 46px 56px 52px' : '74px 56px 70px 76px'};
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    z-index: 5;
  }

  .top-pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    align-self: flex-start;
    padding: ${is43 ? '10px 22px' : '12px 26px'};
    border-radius: 999px;
    background: linear-gradient(135deg, #ff8b47, #f26430);
    color: #fffdf9;
    font-size: ${is43 ? '26px' : '32px'};
    font-weight: 800;
    letter-spacing: 0.03em;
    box-shadow: 0 10px 24px rgba(242, 100, 48, 0.45), inset 0 1px 0 rgba(255,255,255,0.35);
  }

  .headline {
    display: flex;
    flex-direction: column;
    gap: ${is43 ? '10px' : '14px'};
    margin-top: ${is43 ? '6px' : '10px'};
  }
  .line-sub-hook {
    font-size: ${is43 ? '36px' : '44px'};
    font-weight: 700;
    color: #f8e2c4;
    text-shadow: 0 4px 14px rgba(18, 10, 5, 0.72);
    letter-spacing: 0.02em;
  }
  .line-big-1 {
    font-size: ${is43 ? '86px' : '112px'};
    font-weight: 900;
    line-height: 1.04;
    letter-spacing: -0.01em;
    color: #ffd36e;
    -webkit-text-stroke: ${is43 ? '3px' : '4px'} #3b210e;
    paint-order: stroke fill;
    text-shadow: 0 10px 26px rgba(18, 10, 4, 0.75);
  }
  .line-big-2 {
    font-size: ${is43 ? '82px' : '106px'};
    font-weight: 900;
    line-height: 1.06;
    letter-spacing: -0.01em;
    color: #fffdf9;
    -webkit-text-stroke: ${is43 ? '3px' : '4px'} #321d0f;
    paint-order: stroke fill;
    text-shadow: 0 10px 26px rgba(18, 10, 4, 0.78);
  }
  .highlight-box {
    display: inline-block;
    padding: ${is43 ? '4px 16px' : '6px 22px'};
    border-radius: ${is43 ? '14px' : '18px'};
    background: linear-gradient(135deg, #ffe08a, #ffb347);
    color: #2e1808;
    -webkit-text-stroke: 0;
    text-shadow: none;
    box-shadow: 0 10px 22px rgba(24, 12, 4, 0.42);
    margin-left: 6px;
  }

  .feature-row {
    display: flex;
    flex-wrap: wrap;
    gap: ${is43 ? '10px' : '14px'};
    margin-top: ${is43 ? '12px' : '16px'};
  }
  .feat {
    padding: ${is43 ? '9px 18px' : '11px 22px'};
    border-radius: 12px;
    background: rgba(255, 248, 236, 0.16);
    border: 2px solid rgba(255, 224, 174, 0.42);
    backdrop-filter: blur(8px);
    color: #fff6e8;
    font-size: ${is43 ? '24px' : '29px'};
    font-weight: 700;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  }

  .brand-foot {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: ${is43 ? '24px' : '28px'};
    font-weight: 600;
    color: rgba(255, 238, 214, 0.90);
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.65);
  }
  .brand-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #ffd36e;
    box-shadow: 0 0 12px #ffd36e;
  }

  /* Real gameplay authenticity stamp at top-right */
  .real-badge {
    position: absolute;
    top: ${is43 ? '36px' : '46px'};
    right: ${is43 ? '36px' : '50px'};
    z-index: 6;
    padding: ${is43 ? '10px 20px' : '12px 24px'};
    border-radius: 999px;
    background: rgba(28, 20, 14, 0.78);
    border: 2px solid rgba(255, 224, 172, 0.55);
    color: #fff7ea;
    font-size: ${is43 ? '22px' : '26px'};
    font-weight: 700;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  }
</style>
</head>
<body>
  <div class="cover">
    <img class="bg-shot" src="${imgDataUri}" alt="" />
    <div class="scrim"></div>
    <div class="sun-glow"></div>

    <div class="real-badge">🐱 100% 实机画面 · 呼噜噜云撸猫</div>

    <div class="left-col">
      <div class="top-pill">✨ B站 Toy · 点开直接玩</div>

      <div class="headline">
        <div class="line-sub-hook">上班太累想吸猫？</div>
        <div class="line-big-1">用AI做了个</div>
        <div class="line-big-2">实时毛发<span class="highlight-box">云撸猫</span></div>
      </div>

      <div class="feature-row">
        <span class="feat">🤚 20层毛发手感</span>
        <span class="feat">🔊 真实呼噜ASMR</span>
        <span class="feat">🐱 拍屁股会绷直尾巴</span>
      </div>

      <div class="brand-foot">
        <span class="brand-dot"></span>
        <span>不用下载 · 13种猫咪 + 拍立得 · UP主 知喵~</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function renderOne(w, h, outPath, htmlPath) {
  await new Promise((resolve, reject) => {
    const proc = spawn(
      CHROME_BIN,
      [
        '--headless=new',
        `--window-size=${w},${h}`,
        '--force-device-scale-factor=1',
        '--hide-scrollbars',
        '--no-first-run',
        `--screenshot=${outPath.replace('.jpg', '.png')}`,
        `file://${htmlPath}`,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let err = '';
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome failed (${code}): ${err.slice(-500)}`));
    });
  });

  // Convert PNG -> crisp high-quality JPG & remove temp PNG
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y',
      '-i', outPath.replace('.jpg', '.png'),
      '-q:v', '2',
      outPath,
    ]);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
  fs.rmSync(outPath.replace('.jpg', '.png'), { force: true });
}

async function main() {
  const b64 = fs.readFileSync(POSTER_IMG).toString('base64');
  const uri = `data:image/jpeg;base64,${b64}`;

  const html169 = '/tmp/cover-16x9.html';
  const html43 = '/tmp/cover-4x3.html';
  fs.writeFileSync(html169, buildCoverHtml(1920, 1080, uri, false));
  fs.writeFileSync(html43, buildCoverHtml(1200, 900, uri, true));

  await renderOne(1920, 1080, OUT_16_9, html169);
  await renderOne(1200, 900, OUT_4_3, html43);

  fs.rmSync(html169, { force: true });
  fs.rmSync(html43, { force: true });
  console.log('Generated both covers successfully:', OUT_16_9, OUT_4_3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
