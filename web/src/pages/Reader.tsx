import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, bridge, pageImageUrl } from '../api';
import type { ChapterDetail, ChapterPayload, PageImage } from '../types';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { READER_BG_COLORS, READER_BG_LABELS, useSettings, type ReaderFit, type ReaderMode } from '../store/settings';
import ReportModal, { type ReportContext } from '../components/ReportModal';

/* 带加载/失败状态的图片：不使用原生 lazy（Electron 下易整页加载失败），改为显式 loading 占位 */
function ReaderImage({ url, alt, style, onContextMenu }: { url: string; alt: string; style?: CSSProperties; onContextMenu?: (e: ReactMouseEvent) => void }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(url ? 'loading' : 'error');
  const imgRef = useRef<HTMLImageElement | null>(null);

  // 兜底：缓存命中的图片，load 事件可能在挂载并绑定 onLoad 前就已触发，导致 onLoad 永不回调。
  // 挂载后主动检查 complete / naturalWidth，覆盖该竞态。
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete) {
      setStatus(el.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }, [url]);

  return (
    <>
      {status !== 'loaded' && (
        <div className="reader-img-state">
          {status === 'loading' ? (
            <>
              <div className="spinner" />
              <span>图片加载中…</span>
            </>
          ) : (
            <span>图片加载失败</span>
          )}
        </div>
      )}
      {url && (
        <img
          ref={imgRef}
          className={`reader-img-el${status === 'loaded' ? ' is-loaded' : ''}`}
          src={pageImageUrl(url)}
          alt={alt}
          style={style}
          draggable={false}
          decoding="async"
          onContextMenu={onContextMenu}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
    </>
  );
}

export default function Reader() {
  const { chapterId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const location = useLocation();
  // 是否从“详情页”进入本阅读器（用于原路返回，避免重复入栈）
  const fromDetail = (location.state as { from?: string } | null)?.from === 'detail';

  const [payload, setPayload] = useState<ChapterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageNo, setPageNo] = useState(1);
  const [chapters, setChapters] = useState<Array<{ _id: string; index: number; title: string }>>([]);
  const [showBar, setShowBar] = useState(true);
  const [drawer, setDrawer] = useState<'none' | 'chapters' | 'settings'>('none');
  const [imgMenu, setImgMenu] = useState<{ x: number; y: number; url: string; name: string } | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 });
  const [reportOpen, setReportOpen] = useState(false);

  const mode = useSettings((s) => s.mode);
  const fit = useSettings((s) => s.fit);
  const customScale = useSettings((s) => s.customScale);
  const brightness = useSettings((s) => s.brightness);
  const gap = useSettings((s) => s.gap);
  const readerBg = useSettings((s) => s.readerBg);
  const update = useSettings((s) => s.update);

  const win = bridge;
  const [fullscreen, setFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const idleTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const zoomDrag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const chapter: ChapterDetail | null = payload?.chapter || null;
  const comic = payload?.comic;
  const pages: PageImage[] = chapter?.pages || [];
  const total = pages.length || 1;

  /* ---------- 数据加载 ---------- */
  useEffect(() => {
    if (!chapterId) return;
    let alive = true;
    setLoading(true);
    api
      .chapter(chapterId)
      .then((data) => {
        if (!alive) return;
        setPayload(data);
        api
          .chapters(data.comic._id, 1, 500)
          .then((r) => setChapters(r.items.map((i) => ({ _id: i._id, index: i.index, title: i.title }))))
          .catch(() => setChapters([]));
      })
      .catch(() => toast.error('章节加载失败'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [chapterId]);

  const initialPage = Math.min(total, Math.max(1, Number(params.get('p') || 1)));
  useEffect(() => {
    setPageNo(initialPage);
  }, [initialPage, chapterId]);

  // 翻页 / 切章时关闭图片右键菜单
  useEffect(() => {
    setImgMenu(null);
  }, [pageNo, chapterId]);

  /* ---------- 进度上报 ---------- */
  const saveProgress = useCallback(
    (index: number, page: number) => {
      if (!user || !comic || !chapter) return;
      const comicId = comic._id;
      const chapterIdx = chapter.index;
      const chapterIdStr = chapter._id;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        api
          .saveHistory({ comicId, chapterId: chapterIdStr, chapterIndex: chapterIdx, page })
          .catch(() => undefined);
        api
          .updateShelf(comicId, {
            lastChapterId: chapterIdStr,
            lastChapterIndex: chapterIdx,
            lastPage: page,
            progress: Math.min(100, Math.round((chapterIdx / Math.max(1, comic.chapterCount)) * 100)),
          })
          .catch(() => undefined);
      }, 700);
    },
    [user, comic, chapter],
  );

  useEffect(() => {
    if (!chapter) return;
    saveProgress(chapter.index, pageNo);
  }, [pageNo, chapter, saveProgress]);

  /* ---------- 滚动模式：定位 & 页码同步 ---------- */
  useEffect(() => {
    if (mode !== 'scroll' || !pages.length) return;
    // 切章时按“目标起始页”定位：下一章=第1页(顶部)，上一章带 p=9999=末页。
    // 用 initialPage 而非 pageNo——切章瞬间 pageNo 还是上一章残留值，会被旧页码在新章里定位而回不到顶部。
    const idx = Math.min(pages.length, Math.max(1, initialPage)) - 1;
    const el = pageRefs.current[idx];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop, behavior: 'auto' });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, mode, pages.length]);

  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const top = container.scrollTop + container.clientHeight * 0.35;
    let idx = 1;
    pageRefs.current.forEach((el, i) => {
      if (el && el.offsetTop <= top) idx = i + 1;
    });
    if (idx !== pageNo) setPageNo(idx);
  };

  /* ---------- 翻页 ---------- */
  const goPage = useCallback(
    (target: number) => {
      const clamped = Math.min(total, Math.max(1, target));
      setPageNo(clamped);
      if (mode === 'scroll') {
        const el = pageRefs.current[clamped - 1];
        if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
      }
    },
    [total, mode],
  );

  const gotoChapter = useCallback(
    (id: string | null) => {
      if (!id) {
        toast.info('已经是边界章节了');
        return;
      }
      // 章跳转用 replace：历史里只保留一个阅读器条目，避免“返回上一层”落到另一个阅读器
      navigate(`/read/${id}`, { replace: true, state: location.state ?? undefined });
    },
    [navigate, location.state],
  );

  // 返回详情：从详情进来的原路返回（不重复入栈）；深链进入的用详情替换阅读器
  const backToDetail = useCallback(() => {
    if (fromDetail) navigate(-1);
    else if (comic) navigate(`/comic/${comic._id}`, { replace: true });
    else navigate(-1);
  }, [fromDetail, comic, navigate]);

  const nextPage = useCallback(() => {
    if (pageNo < total) {
      goPage(pageNo + 1);
      return;
    }
    if (chapter?.nextId) gotoChapter(chapter.nextId);
    else toast.info('已经是最新一话了');
  }, [pageNo, total, chapter, goPage, gotoChapter]);

  const prevPage = useCallback(() => {
    if (pageNo > 1) {
      goPage(pageNo - 1);
      return;
    }
    if (chapter?.prevId) {
      navigate(`/read/${chapter.prevId}?p=9999`, { replace: true, state: location.state ?? undefined });
    } else {
      toast.info('已经是第一页');
    }
  }, [pageNo, chapter, goPage, navigate, location.state]);

  /* ---------- 图片查看（右键进入，支持缩放/平移，点击退出） ---------- */
  const ZOOM_MIN = 0.2;
  const ZOOM_MAX = 5;
  const openZoom = useCallback((url: string) => {
    setZoomUrl(url);
    setZoomScale(1);
    setZoomPos({ x: 0, y: 0 });
  }, []);
  const zoomBy = useCallback((delta: number) => {
    setZoomScale((s) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 100) / 100));
      if (next <= 1) setZoomPos({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const closeZoom = useCallback(() => setZoomUrl(null), []);

  /* ---------- 键盘 & 自动隐藏 ---------- */
  useEffect(() => {
    if (!win) return;
    void win.getWinState().then((s) => setFullscreen(s.fullscreen));
    return win.onWinStateChange((s) => setFullscreen(s.fullscreen));
  }, [win]);

  const toggleFullscreen = useCallback(() => {
    void win?.toggleFullScreen();
  }, [win]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 查看大图时：Esc 退出、+/- 缩放，吞掉其它快捷键
      if (zoomUrl) {
        if (e.key === 'Escape') closeZoom();
        else if (e.key === '+' || e.key === '=') zoomBy(0.25);
        else if (e.key === '-' || e.key === '_') zoomBy(-0.25);
        return;
      }
      if (drawer !== 'none') {
        if (e.key === 'Escape') setDrawer('none');
        return;
      }
      const rtl = mode === 'manga';
      if (e.key === 'ArrowRight') rtl ? prevPage() : nextPage();
      else if (e.key === 'ArrowLeft') rtl ? nextPage() : prevPage();
      else if (e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextPage();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevPage();
      } else if (e.key === 'Escape') {
        // 全屏时优先退出全屏，否则返回详情
        if (fullscreen) toggleFullscreen();
        else backToDetail();
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        setDrawer('chapters');
      } else if (e.key === 's' || e.key === 'S') {
        setDrawer('settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, mode, nextPage, prevPage, fullscreen, toggleFullscreen, backToDetail, zoomUrl, closeZoom, zoomBy]);

  const wake = useCallback(() => {
    setShowBar(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (drawer === 'none') setShowBar(false);
    }, 2600);
  }, [drawer]);

  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [wake]);

  /* ---------- 离线缓存 ---------- */
  const imgStyle: CSSProperties = useMemo(() => {
    if (fit === 'height') return { height: '100vh', width: 'auto' };
    if (fit === 'width') return { width: '100%', height: 'auto' };
    if (fit === 'custom') return { width: `${customScale}%`, height: 'auto', maxWidth: 'none' };
    return { width: 'auto', height: 'auto' };
  }, [fit, customScale]);

  // 阅读器背景：非“跟随主题”时用固定色覆盖画布背景
  const canvasBg = readerBg !== 'theme' ? { background: READER_BG_COLORS[readerBg] } : undefined;

  if (loading || !payload || !chapter) {
    return (
      <div className="reader bg-dark">
        <div className="reader-canvas" style={canvasBg}>
          <div className="reader-loading">
            <div className="spinner" />
            <div>加载中...</div>
          </div>
          <div className="reader-bar">
            <button className="rbtn" onClick={backToDetail}>
              ← 返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 付费/锁定章节：数据源不公开页图，给出明确提示而非空白
  if (chapter.locked) {
    return (
      <div className="reader bg-dark">
        <div className="reader-canvas" style={canvasBg}>
          <div className="reader-loading">
            <div style={{ fontSize: 20, marginBottom: 10 }}>🔒 该章节为付费章节</div>
            <div className="muted">数据源（动漫屋）未公开页图，暂不支持阅读</div>
          </div>
          <div className="reader-bar">
            <button className="rbtn" onClick={backToDetail}>
              ← 返回详情
            </button>
            <div className="spacer" />
            <button className="rbtn" disabled={!chapter.prevId} onClick={() => gotoChapter(chapter.prevId)}>
              上一话
            </button>
            <button className="rbtn" disabled={!chapter.nextId} onClick={() => gotoChapter(chapter.nextId)}>
              下一话
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dim = brightness < 100 ? { opacity: (100 - brightness) / 100 * 0.75 } : undefined;

  return (
    <div className={`reader fit-${fit}${gap ? ' gap' : ''}`} onMouseMove={wake}>
      <div className="reader-canvas" style={canvasBg}>
        {mode === 'scroll' ? (
          <div className="reader-scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="reader-pages" style={{ width: '100%', maxWidth: fit === 'origin' || fit === 'custom' ? 'none' : 1100 }}>
              {pages.map((p, i) => (
                <div
                  className="reader-page"
                  key={p.index}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                  style={{ width: fit === 'width' || fit === 'custom' ? '100%' : 'auto' }}
                >
                  <ReaderImage
                    url={p.url}
                    alt={`第 ${p.index} 页`}
                    style={imgStyle}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const name = `${comic?.title || 'comic'}-${chapter?.title || 'chapter'}-P${p.index}`.replace(
                        /[\\/:*?"<>|\s]+/g,
                        '_',
                      );
                      setImgMenu({
                        x: Math.min(e.clientX, window.innerWidth - 150),
                        y: Math.min(e.clientY, window.innerHeight - 110),
                        url: p.url,
                        name,
                      });
                    }}
                  />
                </div>
              ))}
              <div style={{ padding: '30px 0 80px', textAlign: 'center' }}>
                {chapter.nextId ? (
                  <button className="btn btn-primary" onClick={() => gotoChapter(chapter.nextId)}>
                    下一话：{chapter.index + 1} →
                  </button>
                ) : (
                  <span className="muted">已完成本章，敬请期待更新</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="reader-single">
            <ReaderImage
              key={pageNo}
              url={pages[pageNo - 1]?.url || ''}
              alt={`第 ${pageNo} 页`}
              onContextMenu={(e) => {
                e.preventDefault();
                const name = `${comic?.title || 'comic'}-${chapter?.title || 'chapter'}-P${pageNo}`.replace(
                  /[\\/:*?"<>|\s]+/g,
                  '_',
                );
                setImgMenu({
                  x: Math.min(e.clientX, window.innerWidth - 150),
                  y: Math.min(e.clientY, window.innerHeight - 110),
                  url: pages[pageNo - 1]?.url || '',
                  name,
                });
              }}
            />
            <div
              style={{ position: 'absolute', inset: 0, cursor: mode === 'manga' ? 'w-resize' : 'e-resize' }}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const left = e.clientX - rect.left < rect.width / 2;
                if (mode === 'manga') left ? nextPage() : prevPage();
                else left ? prevPage() : nextPage();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const name = `${comic?.title || 'comic'}-${chapter?.title || 'chapter'}-P${pageNo}`.replace(
                  /[\\/:*?"<>|\s]+/g,
                  '_',
                );
                setImgMenu({
                  x: Math.min(e.clientX, window.innerWidth - 150),
                  y: Math.min(e.clientY, window.innerHeight - 110),
                  url: pages[pageNo - 1]?.url || '',
                  name,
                });
              }}
            />
          </div>
        )}

        {dim && <div className="reader-dim" style={dim} />}

        {/* 顶栏 */}
        <div className={`reader-bar${showBar ? '' : ' hidden'}`}>
          <button className="rbtn" onClick={backToDetail}>
            ← 返回详情
          </button>
          <span className="reader-title">
            {comic?.title} · {chapter.title}
          </span>
          <div className="spacer" />
          <button className="rbtn" disabled={!chapter.prevId} onClick={() => gotoChapter(chapter.prevId)}>
            上一话
          </button>
          <button className="rbtn" disabled={!chapter.nextId} onClick={() => gotoChapter(chapter.nextId)}>
            下一话
          </button>
          <button className="rbtn" onClick={() => setDrawer(drawer === 'chapters' ? 'none' : 'chapters')}>
            目录
          </button>
          <button className="rbtn" onClick={() => setDrawer(drawer === 'settings' ? 'none' : 'settings')}>
            设置
          </button>
          <button className="rbtn" onClick={() => setReportOpen(true)} title="举报当前章节">
            举报
          </button>
          {win && (
            <button className="rbtn" onClick={toggleFullscreen} title="F / F11 也可切换">
              {fullscreen ? '退出全屏' : '全屏'}
            </button>
          )}
        </div>

        {/* 底栏 */}
        <div className={`reader-foot${showBar ? '' : ' hidden'}`}>
          <button className="rbtn" onClick={prevPage}>
            ←
          </button>
          <input
            className="reader-slider"
            type="range"
            min={1}
            max={total}
            value={pageNo}
            onChange={(e) => goPage(Number(e.target.value))}
          />
          <span className="reader-page-no">
            {pageNo} / {total}
          </span>
          <button className="rbtn" onClick={nextPage}>
            →
          </button>
        </div>

        {fullscreen && <div className="reader-fs-hint">按 Esc 或 F 退出全屏</div>}

        {/* 目录抽屉 */}
        {drawer !== 'none' && <div className="drawer-mask" onClick={() => setDrawer('none')} />}
        <div className={`drawer left${drawer === 'chapters' ? '' : ' hidden-left'}`}>
          <div className="drawer-head">
            目录（{chapters.length} 话）
            <div className="spacer" />
            <button className="btn btn-ghost" onClick={() => setDrawer('none')}>
              关闭
            </button>
          </div>
          <div className="drawer-body">
            {chapters.map((c) => (
              <div
                key={c._id}
                className={`chapter-mini${c._id === chapterId ? ' active' : ''}`}
                onClick={() => {
                  setDrawer('none');
                  navigate(`/read/${c._id}`, { replace: true, state: location.state ?? undefined });
                }}
              >
                <span className="chapter-mini-title">{c.title}</span>
                {c._id === chapterId && <span>在读</span>}
              </div>
            ))}
            {!chapters.length && <div className="muted">目录加载中…</div>}
          </div>
        </div>

        {/* 设置抽屉 */}
        <div className={`drawer right${drawer === 'settings' ? '' : ' hidden-right'}`}>
          <div className="drawer-head">
            设置
            <div className="spacer" />
            <button className="btn btn-ghost" onClick={() => setDrawer('none')}>
              关闭
            </button>
          </div>
          <div className="drawer-body">
            <div className="drawer-section-title">阅读设置</div>
            <div className="setting-group setting-card">
              <div className="setting-label">阅读模式</div>
              <div className="setting-options">
                {(
                  [
                    ['scroll', '卷轴（条漫）'],
                    ['page', '翻页'],
                    ['manga', '日漫（右→左）'],
                  ] as Array<[ReaderMode, string]>
                ).map(([k, label]) => (
                  <button
                    key={k}
                    className={`setting-opt${mode === k ? ' active' : ''}`}
                    onClick={() => update({ mode: k })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-group setting-card">
              <div className="setting-label">页面适配</div>
              <div className="setting-options">
                {(
                  [
                    ['width', '适应宽度'],
                    ['height', '适应高度'],
                    ['origin', '原始尺寸'],
                    ['custom', '自定义'],
                  ] as Array<[ReaderFit, string]>
                ).map(([k, label]) => (
                  <button
                    key={k}
                    className={`setting-opt${fit === k ? ' active' : ''}`}
                    onClick={() => update({ fit: k })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {fit === 'custom' && (
                <div className="setting-sub">
                  <div className="setting-label-row">
                    <span className="setting-label">图片尺寸</span>
                    <span className="setting-value">{customScale}%</span>
                  </div>
                  <input
                    className="setting-slider"
                    type="range"
                    min={50}
                    max={300}
                    step={5}
                    value={customScale}
                    onChange={(e) => update({ customScale: Number(e.target.value) })}
                    style={{
                      background: `linear-gradient(90deg, var(--accent) ${
                        ((customScale - 50) / 250) * 100
                      }%, var(--panel-2) ${((customScale - 50) / 250) * 100}%)`,
                    }}
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    按百分比缩放图片宽度（50%–300%）
                  </div>
                </div>
              )}
            </div>

            <div className="setting-group setting-card">
              <div className="setting-label">阅读器背景</div>
              <div className="setting-options">
                {READER_BG_LABELS.map(([k, label]) => (
                  <button
                    key={k}
                    className={`setting-opt${readerBg === k ? ' active' : ''}`}
                    onClick={() => update({ readerBg: k })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-group setting-card">
              <div className="setting-label-row">
                <span className="setting-label">亮度</span>
                <span className="setting-value">{brightness}%</span>
              </div>
              <input
                className="setting-slider"
                type="range"
                min={40}
                max={100}
                value={brightness}
                onChange={(e) => update({ brightness: Number(e.target.value) })}
                style={{
                  background: `linear-gradient(90deg, var(--accent) ${
                    ((brightness - 40) / 60) * 100
                  }%, var(--panel-2) ${((brightness - 40) / 60) * 100}%)`,
                }}
              />
            </div>

            <div className="setting-group setting-card">
              <div className="setting-label">页间距</div>
              <div className="setting-options">
                <button className={`setting-opt${gap ? ' active' : ''}`} onClick={() => update({ gap: !gap })}>
                  {gap ? '已开启' : '已关闭'}
                </button>
              </div>
            </div>

            <div className="drawer-section-title">功能</div>

            <div className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
              快捷键：← → 翻页 / 空格 下一页 / M 目录 / S 设置 / F 或 F11 全屏切换 / Esc 退出全屏
            </div>
          </div>
        </div>

        {/* 图片右键菜单：保存图片 */}
        {imgMenu && (
          <>
            <div
              className="img-menu-mask"
              onClick={() => setImgMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setImgMenu(null);
              }}
            />
            <div className="img-menu" style={{ left: imgMenu.x, top: imgMenu.y }} role="menu">
              <button
                onClick={() => {
                  const m = imgMenu;
                  setImgMenu(null);
                  openZoom(m.url);
                }}
              >
                查看大图
              </button>
              <button
                onClick={async () => {
                  const m = imgMenu;
                  setImgMenu(null);
                  if (!bridge?.saveImage) {
                    toast.error('当前环境不支持保存图片');
                    return;
                  }
                  try {
                    const r = await bridge.saveImage(m.url, `${m.name}.jpg`);
                    if (r.ok) toast.success(`已保存到 ${r.path}`);
                    else toast.error(r.error || '保存失败');
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                保存图片
              </button>
              <button onClick={() => setImgMenu(null)}>取消</button>
            </div>
          </>
        )}

        {/* 查看大图：滚轮/按钮缩放，拖动平移，点击图片退出 */}
        {zoomUrl && (
          <div className="img-zoom-mask">
            <div className="img-zoom-toolbar">
              <button className="zbtn" onClick={() => zoomBy(-0.25)} title="缩小（-）">
                －
              </button>
              <span className="zbtn-scale">{Math.round(zoomScale * 100)}%</span>
              <button className="zbtn" onClick={() => zoomBy(0.25)} title="放大（+）">
                ＋
              </button>
              <button
                className="zbtn"
                onClick={() => {
                  setZoomScale(1);
                  setZoomPos({ x: 0, y: 0 });
                }}
                title="重置为适应大小"
              >
                适应
              </button>
              <div className="spacer" />
              <button className="zbtn" onClick={closeZoom} title="关闭（Esc）">
                ✕
              </button>
            </div>
            <div
              className="img-zoom-stage"
              style={{ cursor: zoomScale > 1 ? 'grab' : 'zoom-out' }}
              onWheel={(e) => {
                e.preventDefault();
                zoomBy(e.deltaY < 0 ? 0.15 : -0.15);
              }}
              onMouseDown={(e) => {
                zoomDrag.current = { x: e.clientX - zoomPos.x, y: e.clientY - zoomPos.y, moved: false };
              }}
              onMouseMove={(e) => {
                const d = zoomDrag.current;
                if (!d) return;
                const nx = e.clientX - d.x;
                const ny = e.clientY - d.y;
                if (Math.abs(nx - zoomPos.x) > 3 || Math.abs(ny - zoomPos.y) > 3) d.moved = true;
                setZoomPos({ x: nx, y: ny });
              }}
              onMouseUp={() => {
                const d = zoomDrag.current;
                if (d && !d.moved) closeZoom(); // 未拖动即点击图片 → 退出查看
                zoomDrag.current = null;
              }}
              onMouseLeave={() => {
                zoomDrag.current = null;
              }}
            >
              <img
                src={pageImageUrl(zoomUrl)}
                alt="查看大图"
                draggable={false}
                style={{ transform: `translate(${zoomPos.x}px, ${zoomPos.y}px) scale(${zoomScale})` }}
              />
            </div>
            <div className="reader-fs-hint">滚轮缩放 · 拖动平移 · 点击图片退出</div>
          </div>
        )}

        <ReportModal
          open={reportOpen}
          context={{
            type: 'chapter',
            comicId: comic?._id,
            comicTitle: comic?.title,
            chapterId: chapter?._id,
            chapterTitle: chapter?.title,
            targetId: chapter?._id,
          }}
          onClose={() => setReportOpen(false)}
        />
      </div>
    </div>
  );
}
