/**
 * Bilibili Toy JS SDK Bridge (//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js)
 *
 * Strictly follows all Toy SDK rules:
 * - Checks `window.toy` and `toy.isSupport(ability)` before calling any native/platform API.
 * - Never treats `unavailable` / `unauthorized` / `denied` as passed/unlocked.
 * - Uses `visibilitychange` to re-verify follow status when returning from author space.
 * - Respects cloud-storage rate limits (single batch key, never per-keystroke, handles 307044).
 * - Gracefully degrades in standalone web browsers outside Bilibili.
 */

export interface ToySafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ToyContainerState {
  deviceType: 'phone' | 'tablet' | 'desktop' | 'unknown';
  viewport: { width: number; height: number };
  safeArea: ToySafeArea;
  orientation: 'portrait' | 'landscape';
  immersive: boolean;
  changedFields: string[];
}

export interface ToyAuthorProfileResp {
  status: string;
  data?: {
    mid?: number | string;
    nickname?: string;
    avatar?: string;
    follower?: number;
  };
}

export interface ToyAuthorRelationResp {
  status: string;
  data?: {
    isFollowing?: boolean;
    hasFanMedal?: boolean;
    isCharging?: boolean;
  };
}

export interface ToyCheckInputSafetyResp {
  passed: boolean;
  status: 'ok' | 'rejected' | 'unavailable';
}

export interface ToySDKGlobal {
  isSupport(ability: string): Promise<boolean>;
  navigate(req: { type: string; id: string; extra?: Record<string, string> }): Promise<void>;
  saveImageToAlbum(req: { url?: string; base64Data?: string; hintMsg?: string }): Promise<{ localPath: string }>;
  share(req: { path: string }): Promise<void>;
  sharePicture(req: { url?: string; base64Data?: string }): Promise<void>;
  getQrCode(req?: { path?: string; size?: number }): Promise<{ base64: string; url: string }>;
  getAuthorProfile(): Promise<ToyAuthorProfileResp>;
  getAuthorRelation(): Promise<ToyAuthorRelationResp>;
  getCloudStorage(keys?: string[]): Promise<Record<string, string>>;
  setCloudStorage(items: Record<string, string>): Promise<void>;
  checkInputSafety(req: { text: string; scene?: string }): Promise<ToyCheckInputSafetyResp>;
  getContainerState(): Promise<ToyContainerState>;
  onContainerChange(listener: (state: ToyContainerState) => void): () => void;
  setContainerMode(req: { orientation?: 'portrait' | 'landscape' | 'auto'; immersive?: boolean }): Promise<void>;
  onPageClose(listener: () => void): () => void;
}

declare global {
  interface Window {
    toy?: ToySDKGlobal;
  }
}

export interface AuthorInfo {
  mid: string | null;
  nickname: string;
  avatar: string;
  follower: number | null;
}

export type FollowCheckResult =
  | { state: 'following' }
  | { state: 'not_following' }
  | { state: 'unavailable'; reason: string }
  | { state: 'standalone_preview' };

export class ToyBridge {
  private readonly supportCache = new Map<string, boolean>();
  private inBiliRuntime = false;
  private lastCloudSaveTs = 0;
  private cloudBackoffMs = 0;

  public getRawSdk(): ToySDKGlobal | null {
    return typeof window !== 'undefined' && window.toy ? window.toy : null;
  }

  public isInBiliRuntime(): boolean {
    return this.inBiliRuntime;
  }

  public async isSupport(ability: string): Promise<boolean> {
    if (this.supportCache.has(ability)) {
      return this.supportCache.get(ability)!;
    }
    const sdk = this.getRawSdk();
    if (!sdk || typeof sdk.isSupport !== 'function') {
      this.supportCache.set(ability, false);
      return false;
    }
    try {
      const ok = Boolean(await sdk.isSupport(ability));
      this.supportCache.set(ability, ok);
      if (ok) this.inBiliRuntime = true;
      return ok;
    } catch {
      this.supportCache.set(ability, false);
      return false;
    }
  }

  public isBilibiliHost(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    const isBiliDomain =
      host === 'bilibili.com' ||
      host.endsWith('.bilibili.com') ||
      host.endsWith('.hdslb.com');
    const isBiliUa = /BiliApp/i.test(window.navigator.userAgent || '');
    return isBiliDomain || isBiliUa;
  }

  /**
   * Checks whether current Bilibili visitor follows the Toy author.
   * Never treats error/unavailable/unlogged-in states as unlocked!
   */
  public async checkAuthorFollow(): Promise<FollowCheckResult> {
    if (!this.isBilibiliHost()) {
      return { state: 'standalone_preview' };
    }
    const ok = await this.isSupport('getAuthorRelation');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) {
      return { state: 'unavailable', reason: 'unsupported' };
    }
    try {
      const resp = await sdk.getAuthorRelation();
      if (resp && resp.status === 'ok' && resp.data) {
        return resp.data.isFollowing ? { state: 'following' } : { state: 'not_following' };
      }
      return { state: 'unavailable', reason: resp?.status || 'unauthorized' };
    } catch (err) {
      const msg = (err as { type?: string; message?: string })?.type || 'error';
      return { state: 'unavailable', reason: msg };
    }
  }

  public async getAuthorProfile(): Promise<AuthorInfo | null> {
    const ok = await this.isSupport('getAuthorProfile');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return null;
    try {
      const resp = await sdk.getAuthorProfile();
      if (resp && resp.status === 'ok' && resp.data) {
        return {
          mid: resp.data.mid !== undefined && resp.data.mid !== null ? String(resp.data.mid) : null,
          nickname: resp.data.nickname || 'UP主',
          avatar: resp.data.avatar || '',
          follower: typeof resp.data.follower === 'number' ? resp.data.follower : null,
        };
      }
    } catch {
      // Ignore profile fetch errors gracefully
    }
    return null;
  }

  /** Must be called directly inside a user click gesture! */
  public async navigateToAuthorSpace(mid: string): Promise<boolean> {
    const ok = await this.isSupport('navigate');
    const sdk = this.getRawSdk();
    if (!ok || !sdk || !mid) return false;
    try {
      await sdk.navigate({ type: 'space', id: mid, extra: { from: 'toy' } });
      return true;
    } catch {
      return false;
    }
  }

  /** Bind safeArea & container state inside Bilibili App */
  public async initContainer(onChange: (state: ToyContainerState) => void): Promise<() => void> {
    const canListen = await this.isSupport('onContainerChange');
    const canRead = await this.isSupport('getContainerState');
    const sdk = this.getRawSdk();
    if (!sdk) return () => {};

    if (canRead) {
      try {
        const current = await sdk.getContainerState();
        onChange(current);
      } catch {
        // Ignore outside App
      }
    }
    if (canListen) {
      try {
        return sdk.onContainerChange(onChange);
      } catch {
        return () => {};
      }
    }
    return () => {};
  }

  /** Request landscape/immersive or portrait mode atomically inside Bilibili App */
  public async setContainerMode(
    orientation: 'portrait' | 'landscape' | 'auto',
    immersive: boolean,
  ): Promise<boolean> {
    const ok = await this.isSupport('setContainerMode');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return false;
    try {
      await sdk.setContainerMode({ orientation, immersive });
      return true;
    } catch {
      return false;
    }
  }

  /** Save Polaroid image via native Bilibili album in App, or returns 'fallback' on Web */
  public async saveImage(base64Data: string): Promise<'saved_album' | 'fallback' | 'error'> {
    const ok = await this.isSupport('saveImageToAlbum');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return 'fallback';
    try {
      await sdk.saveImageToAlbum({
        base64Data,
        hintMsg: '需要相册权限保存猫咪拍立得合照',
      });
      return 'saved_album';
    } catch {
      return 'error';
    }
  }

  /** Share Polaroid image directly via native Bilibili share sheet (App only) */
  public async shareImage(base64Data: string): Promise<boolean> {
    const ok = await this.isSupport('sharePicture');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return false;
    try {
      await sdk.sharePicture({ base64Data });
      return true;
    } catch {
      return false;
    }
  }

  /** Native Bilibili App share panel with relative Toy path (index.html?cat=...) */
  public async shareToyPath(relativePath: string): Promise<boolean> {
    const ok = await this.isSupport('share');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return false;
    try {
      await sdk.share({ path: relativePath });
      return true;
    } catch {
      return false;
    }
  }

  /** Check player-entered custom cat name safety ONLY on explicit share/export submit */
  public async checkCatNameSafety(text: string): Promise<'ok' | 'rejected' | 'unavailable'> {
    const trimmed = text.trim();
    if (!trimmed) return 'ok';
    const ok = await this.isSupport('checkInputSafety');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return 'ok';
    try {
      const resp = await sdk.checkInputSafety({ text: trimmed, scene: 'cat_name' });
      if (resp.passed && resp.status === 'ok') return 'ok';
      if (resp.status === 'rejected') return 'rejected';
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /** Read single JSON profile key from Bilibili cloud storage once on startup */
  public async loadCloudProfile(): Promise<string | null> {
    const ok = await this.isSupport('getCloudStorage');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return null;
    try {
      const data = await sdk.getCloudStorage(['cat_profile_v1']);
      return typeof data?.cat_profile_v1 === 'string' ? data.cat_profile_v1 : null;
    } catch {
      return null;
    }
  }

  /** Rate-limit-aware cloud save (single key <= 1024 bytes, exponential backoff on 307044) */
  public async saveCloudProfile(encodedPayload: string): Promise<void> {
    if (encodedPayload.length > 980) return;
    const now = Date.now();
    if (now - this.lastCloudSaveTs < Math.max(4000, this.cloudBackoffMs)) return;

    const ok = await this.isSupport('setCloudStorage');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return;

    this.lastCloudSaveTs = now;
    try {
      await sdk.setCloudStorage({ cat_profile_v1: encodedPayload });
      this.cloudBackoffMs = 0;
    } catch (err) {
      const e = err as { type?: string; code?: number };
      if (e?.type === 'http_error' && e?.code === 307044) {
        this.cloudBackoffMs = this.cloudBackoffMs ? Math.min(60000, this.cloudBackoffMs * 2) : 10000;
      }
    }
  }

  public async onPageClose(listener: () => void): Promise<() => void> {
    const ok = await this.isSupport('onPageClose');
    const sdk = this.getRawSdk();
    if (!ok || !sdk) return () => {};
    try {
      return sdk.onPageClose(listener);
    } catch {
      return () => {};
    }
  }
}
