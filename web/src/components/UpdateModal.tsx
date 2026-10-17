import { bridge } from '../api';
import ReleaseNotes, { type NoteSection, toSections } from './ReleaseNotes';

export interface UpdateInfo {
  version: string;
  /** 更新说明：分组数组（新增功能/Bug 修复…）或字符串（旧格式，平铺） */
  notes: string | NoteSection[];
  url: string;
  buildTime?: string;
}

/** 首页更新提示弹窗：展示最新版本对比与分组更新说明 */
export default function UpdateModal({
  info,
  current,
  onClose,
}: {
  info: UpdateInfo;
  current: string;
  onClose: () => void;
}) {
  const sections = toSections(info.notes);

  const download = async () => {
    if (info.url) {
      try {
        await bridge?.openExternal?.(info.url);
      } catch {
        /* 忽略 */
      }
    }
    // 打开下载地址后退出当前应用，便于安装/覆盖新版本
    try {
      bridge?.quitApp?.();
    } catch {
      /* 忽略 */
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal update-modal" onClick={(e) => e.stopPropagation()}>
        <div className="update-hero">
          <div className="update-hero-icon">🎉</div>
          <div className="update-hero-title">发现新版本</div>
          <div className="update-versions">
            <span className="update-ver new">v{info.version}</span>
            <span className="update-arrow">←</span>
            <span className="update-ver cur">当前 v{current}</span>
          </div>
        </div>
        <div className="modal-body update-body">
          {sections.length ? <ReleaseNotes notes={info.notes} /> : <div className="muted">暂无更新说明</div>}
        </div>
        <div className="update-actions">
          <button className="btn update-later" onClick={onClose}>
            稍后再说
          </button>
          <button className="btn btn-primary update-now" onClick={download} disabled={!info.url}>
            {info.url ? '立即更新' : '暂未提供下载地址'}
          </button>
        </div>
      </div>
    </div>
  );
}
