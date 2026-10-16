import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { assetUrl } from '../api';
import type { Comic } from '../types';
import { formatCount } from '../utils/format';

interface Props {
  comic: Comic;
  latest?: string;
  extra?: ReactNode;
  progress?: number;
  onClick?: () => void;
  /** 已删除漫画：悬停展示的「移除记录」操作 */
  onRemove?: () => void;
  removeLabel?: string;
}

export default function ComicCard({ comic, latest, extra, progress, onClick, onRemove, removeLabel }: Props) {
  const navigate = useNavigate();
  /**
   * 封面加载态：
   * - loading骨架屏 + 扫光动画，避免大片空白死板
   * - loaded   图片淡入，消除「突然蹦出」的割裂感
   * - error    隐藏破图并给出兜底文案（外站封面可能防盗链失效）
   */
  const [coverState, setCoverState] = useState<'loading' | 'loaded' | 'error'>(
    comic.cover ? 'loading' : 'error',
  );
  return (
    <div
      className={`card${progress !== undefined ? ' shelf-card' : ''}${comic.deleted ? ' is-deleted' : ''}`}
      onClick={() => (onClick ? onClick() : navigate(`/comic/${comic._id}`))}
    >
      <div className={`cover is-${coverState}`}>
        {comic.cover ? (
          <img
            src={assetUrl(comic.cover)}
            alt={comic.title}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setCoverState('loaded')}
            onError={() => setCoverState('error')}
          />
        ) : null}
        {coverState !== 'loaded' && (
          <div className="cover-skeleton">
            {coverState === 'error' ? <span className="cover-fallback">暂无封面</span> : null}
          </div>
        )}
        {comic.status ? <span className="cover-badge">{comic.status}</span> : null}
        {comic.rating > 0 && <span className="cover-score">{comic.rating.toFixed(1)}</span>}
        {latest && <div className="cover-latest">{latest}</div>}
        {extra}
        {comic.deleted && (
          <div
            className="deleted-mask"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="deleted-mask-inner">
              <span className="deleted-icon">🚫</span>
              <span className="deleted-text">已被删除</span>
            </div>
            {onRemove && (
              <button
                className="deleted-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                {removeLabel || '移除记录'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="card-title" title={comic.title}>
        {comic.title}
      </div>
      {progress !== undefined ? (
        <div className="shelf-progress">
          <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      ) : (
        <div className="card-sub">
          {comic.author} · {formatCount(comic.views)}人气
        </div>
      )}
    </div>
  );
}
