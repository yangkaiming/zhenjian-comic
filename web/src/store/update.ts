import { create } from 'zustand';
import { api, bridge } from '../api';
import { isNewer, versionLabel } from '../version';

export interface VersionNotes {
  version: string;
  buildTime?: string;
  notes: string | Array<{ title: string; items: string[] }>;
  url?: string;
}

export interface LatestInfo {
  version: string;
  url: string;
  notes: string | Array<{ title: string; items: string[] }>;
  buildTime?: string;
  versions?: VersionNotes[];
}

interface UpdateState {
  latest: LatestInfo | null;
  hasUpdate: boolean;
  checking: boolean;
  /** 是否已检查过（至少一次） */
  checked: boolean;
  /** 拉取远端版本并判定是否有更新（可重复调用） */
  check: () => Promise<void>;
}

/**
 * 全局更新状态：单一来源。Layout 挂载时检查一次，
 * 侧边栏「我的」角标、首页更新弹窗、版本信息弹窗共用，避免重复拉取 COS。
 */
export const useUpdate = create<UpdateState>((set) => ({
  latest: null,
  hasUpdate: false,
  checking: false,
  checked: false,
  async check() {
    set({ checking: true });
    try {
      const info = await api.appLatest();
      const current = versionLabel(bridge?.appVersion);
      set({ latest: info, hasUpdate: !!info.version && isNewer(info.version, current), checked: true });
    } catch {
      set({ checked: true });
    } finally {
      set({ checking: false });
    }
  },
}));
