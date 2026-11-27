/**
 * True 4K UHD (3840x2160, 30fps, 65s) deterministic video renderer
 * Uses macOS Chrome (Metal WebGL2) over native Node 26 WebSocket CDP
 * and streams 4K PNG frames directly into FFmpeg + muxes our 65s soothing soundtrack!
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://127.0.0.1:5173/promo-previews/popup-real-trailer.html?render=1';
const AUDIO_PATH = path.resolve('promo-previews/promo-bgm-65s.mp3');
const OUT_MP4 = path.resolve('release/hululu-promo-4k-65s.mp4');
const OUT_POSTER = path.resolve('release/hululu-promo-poster.jpg');

const FPS = 30;
const DURATION = 65.0;
const TOTAL_FRAMES = Math.round(FPS * DURATION); // 1950 frames
const CDP_PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCdp(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (resp.ok) {
        const list = await resp.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome CDP endpoint');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_MP4), { recursive: true });

  const tmpProfile = `/tmp/chrome-4k-render-${Date.now()}`;
  const chrome = spawn(
    CHROME_BIN,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpProfile}`,
      '--window-size=1920,1080',
      '--force-device-scale-factor=2',
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      URL,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let cdp = null;
  let ffmpeg = null;

  try {
    const wsUrl = await waitForCdp(CDP_PORT);
    cdp = new CdpClient(wsUrl);
    await cdp.ready;

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // Exact 1920x1080 CSS viewport at 2x Retina = true 3840x2160 4K UHD!
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
      mobile: false,
    });

    // Wait for page + WebGL2 assets (cushion-bg.webp & petting-hand.webp) to be 100% loaded
    console.log('Waiting for WebGL2 engine & textures to load...');
    for (let attempt = 0; attempt < 60; attempt++) {
      const check = await cdp.send('Runtime.evaluate', {
        expression: `typeof window.__trailerReady !== 'undefined'`,
        returnByValue: true,
      });
      if (check.result?.value === true) break;
      await sleep(150);
    }
    await cdp.send('Runtime.evaluate', {
      expression: `window.__trailerReady`,
      awaitPromise: true,
      returnByValue: true,
    });
    // Allow 1 layout tick after assets load
    await sleep(250);

    // Spawn FFmpeg streaming pipe: high-quality 4K JPEG-96 frames -> H.264 4K UHD + 65s soothing soundtrack
    ffmpeg = spawn(
      'ffmpeg',
      [
        '-y',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-r', String(FPS),
        '-i', '-',
        '-i', AUDIO_PATH,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-profile:v', 'high',
        '-level', '5.1',
        '-crf', '17',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-shortest',
        OUT_MP4,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );

    let ffErr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      ffErr += chunk.toString();
    });

    const dt = 1 / FPS;
    const t0 = Date.now();
    console.log(`Rendering ${TOTAL_FRAMES} frames at 3840x2160 @ ${FPS}fps (65.0s, fast JPEG-96 pipe)...`);

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const t = i * dt;
      await cdp.send('Runtime.evaluate', {
        expression: `window.__trailerStep(${t.toFixed(5)}, ${dt.toFixed(5)})`,
      });
      // Wait 1 rAF so DOM + WebGL swap buffer is completely committed
      await cdp.send('Runtime.evaluate', {
        expression: `new Promise(r => requestAnimationFrame(() => r(true)))`,
        awaitPromise: true,
      });

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 96,
        fromSurface: true,
      });
      const jpgBuf = Buffer.from(shot.data, 'base64');

      // Save frame ~13.5s (petting warm sunlit cat) as high-res 4K poster JPG
      if (i === Math.round(13.5 * FPS)) {
        fs.writeFileSync(OUT_POSTER, jpgBuf);
      }

      if (!ffmpeg.stdin.write(jpgBuf)) {
        await new Promise((resolve) => ffmpeg.stdin.once('drain', resolve));
      }

      if ((i + 1) % 150 === 0 || i === TOTAL_FRAMES - 1) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const pct = (((i + 1) / TOTAL_FRAMES) * 100).toFixed(1);
        console.log(`Progress: ${i + 1}/${TOTAL_FRAMES} (${pct}%) — ${elapsed}s elapsed`);
      }
    }

    ffmpeg.stdin.end();
    const exitCode = await new Promise((resolve) => ffmpeg.on('close', resolve));
    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}:\n${ffErr.slice(-1200)}`);
    }

    const stat = fs.statSync(OUT_MP4);
    console.log(`SUCCESS! Rendered 4K MP4: ${OUT_MP4} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
