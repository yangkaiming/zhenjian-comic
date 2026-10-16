import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Empty, Loading } from '../components/States';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';

type Candidate = { slug: string; title: string; cover?: string; exists?: boolean };

type Progress = {
  running: boolean;
  target: number;
  added: number;
  skipped: number;
  chapters: number;
  current: string;
  done: boolean;
  items: Array<{ title: string; status: 'fetching' | 'done' | 'skipped'; chapters: number }>;
  error?: string;
};

/** 漫画导入（数据源抓取）管理页：独立二级窗口，仅管理员可见 */
export default function AdminFetch() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const ready = useAuth((s) => s.ready);

  const [sources, setSources] = useState<Array<{ key: string; name: string; desc: string; supportsSearch: boolean }>>([]);
  const [fetchSource, setFetchSource] = useState('baozimh');
  const [fetchCount, setFetchCount] = useState('20');
  const [bookName, setBookName] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedSlug, setPickedSlug] = useState('');
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 数据源列表（下拉框由后端注册表驱动）
  useEffect(() => {
    if (!isAdmin) return;
    api
      .comicSources()
      .then((r) => setSources(r.items))
      .catch(() => setSources([]));
  }, [isAdmin]);

  const pollProgress = useCallback(() => {
    const timer = window.setInterval(async () => {
      try {
        const st = await api.fetchStatus();
        setProgress(st);
        if (!st.running && st.done) {
          window.clearInterval(timer);
          setFetching(false);
          if (st.error) toast.error(`导入失败：${st.error}`);
          else toast.success(`导入完成：新增 ${st.added} 部 / ${st.chapters} 话${st.skipped ? `，跳过 ${st.skipped}` : ''}`);
        }
      } catch {
        window.clearInterval(timer);
        setFetching(false);
        toast.error('获取导入进度失败');
      }
    }, 800);
  }, []);

  /** 批量导入：按条数从数据源抓取 */
  const doFetch = async () => {
    const n = Number(fetchCount);
    if (!Number.isFinite(n) || n < 1) {
      toast.error('请输入有效条数');
      return;
    }
    setFetching(true);
    setProgress(null);
    setModalOpen(true);
    try {
      await api.fetchComics(Math.floor(n), fetchSource);
    } catch (e) {
      toast.error((e as Error).message || '导入失败');
      setFetching(false);
      return;
    }
    pollProgress();
  };

  /** 按书名搜索候选（不导入），供用户挑选 */
  const doSearchCandidates = async () => {
    const name = bookName.trim();
    if (!name) {
      toast.error('请输入书名');
      return;
    }
    setSearching(true);
    try {
      const r = await api.searchFetchCandidates(name, fetchSource);
      const items = r.items || [];
      setCandidates(items);
      setPickedSlug(items[0]?.slug || '');
      if (!items.length) toast.info('没有找到匹配的漫画，换个关键词试试');
    } catch (e) {
      setCandidates([]);
      setPickedSlug('');
      toast.error((e as Error).message || '搜索失败');
    } finally {
      setSearching(false);
    }
  };

  /** 导入用户选中的那一本 */
  const doFetchPicked = async () => {
    const picked = candidates.find((c) => c.slug === pickedSlug);
    if (!picked) {
      toast.error('请先选择要导入的漫画');
      return;
    }
    setFetching(true);
    setProgress(null);
    setModalOpen(true);
    try {
      await api.fetchBySlug(picked.slug, fetchSource);
    } catch (e) {
      toast.error((e as Error).message || '导入失败');
      setFetching(false);
      return;
    }
    pollProgress();
  };

  if (!ready) return <Loading />;
  if (!isAdmin) {
    return <Empty text="无权限访问（仅管理员可见）" icon="🔒" />;
  }

  const sourceList = sources.length
    ? sources
    : [{ key: 'baozimh', name: '包子漫画', desc: '', supportsSearch: true }];

  return (
    <div className="page">
      <div className="panel users-head">
        <div className="users-title-row">
          <div>
            <div className="page-title users-title" style={{ margin: 0 }}>
              漫画导入
            </div>
            <div className="reports-sub">从数据源批量导入漫画与全部章节，自动去重，仅新增</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <span>📥 批量导入</span>
          <span className="panel-tag">仅管理员</span>
        </div>
        <div className="fetch-group">
          <div className="fetch-group-head">按数量导入</div>
          <div className="fetch-controls">
            <label className="fetch-field">
              <span className="fetch-label">数据源</span>
              <select
                className="input"
                value={fetchSource}
                onChange={(e) => {
                  setFetchSource(e.target.value);
                  setCandidates([]);
                  setPickedSlug('');
                }}
                disabled={fetching}
                title="选择漫画数据源"
              >
                {sourceList.map((s) => (
                  <option key={s.key} value={s.key} title={s.desc}>
                    {s.name}
                    {s.key === 'baozimh' ? '（稳定）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="fetch-field">
              <span className="fetch-label">导入数量</span>
              <input
                className="input"
                style={{ maxWidth: 120 }}
                type="number"
                min={1}
                value={fetchCount}
                onChange={(e) => setFetchCount(e.target.value)}
                placeholder="数量"
              />
            </label>
            <button className="btn btn-primary fetch-action" onClick={doFetch} disabled={fetching}>
              {fetching ? '导入中…' : '开始导入'}
            </button>
          </div>
        </div>

        <div className="fetch-group">
          <div className="fetch-group-head">按书名导入</div>
          <div className="fetch-controls">
            <input
              className="input fetch-title"
              value={bookName}
              onChange={(e) => {
                setBookName(e.target.value);
                // 书名变化后旧候选已失效，清空等待重新搜索
                setCandidates([]);
                setPickedSlug('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doSearchCandidates();
              }}
              placeholder="输入书名后搜索，如：葬送的芙莉莲"
            />
            <button className="btn" onClick={doSearchCandidates} disabled={fetching || searching}>
              {searching ? '搜索中…' : '搜索'}
            </button>
          </div>

          {searching && <div className="fetch-loading">正在搜索候选…</div>}

          {!searching && candidates.length > 0 && (
            <>
              <div className="fetch-cand-hint">共 {candidates.length} 个候选，点击选择要导入的一本</div>
              <div className="fetch-cand-grid">
                {candidates.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    className={`fetch-cand${pickedSlug === c.slug ? ' active' : ''}`}
                    onClick={() => setPickedSlug(c.slug)}
                    title={c.title}
                  >
                    {c.cover ? (
                      <img src={c.cover} alt={c.title} loading="lazy" draggable={false} />
                    ) : (
                      <span className="fetch-cand-nocover">无封面</span>
                    )}
                    <span className="fetch-cand-title">{c.title}</span>
                    {c.exists && <span className="fetch-cand-exists">已入库</span>}
                  </button>
                ))}
              </div>
              <div className="fetch-cand-actions">
                <button className="btn btn-primary" onClick={doFetchPicked} disabled={fetching || !pickedSlug}>
                  {fetching ? '导入中…' : '导入选中的一本'}
                </button>
              </div>
            </>
          )}

          {!searching && !candidates.length && bookName.trim() && (
            <div className="fetch-loading">点击「搜索」查看匹配到的漫画，再选择要导入的一本</div>
          )}
        </div>

        {progress && (() => {
          const pct = progress.target
            ? Math.min(100, Math.round((progress.added / progress.target) * 100))
            : progress.done
              ? 100
              : 0;
          return (
            <div className="fetch-progress">
              <div className="fetch-progress-head">
                <span className="fetch-progress-title">导入进度</span>
                <span className={`fetch-pill ${progress.running ? 'running' : 'done'}`}>
                  {progress.running ? '进行中' : '已完成'}
                </span>
              </div>
              <div className="fetch-bar">
                <div className="fetch-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="fetch-stats">
                新增 {progress.added}/{progress.target} · 章节 {progress.chapters} · 跳过 {progress.skipped}
              </div>
              {progress.running && progress.current && (
                <div className="fetch-current" title={progress.current}>
                  正在处理：{progress.current}
                </div>
              )}
              <div className="fetch-progress-actions">
                <button className="btn btn-primary fetch-detail" onClick={() => setModalOpen(true)}>
                  查看详情
                </button>
                {!progress.running && progress.done && (
                  <button className="btn" onClick={() => setProgress(null)}>
                    收起
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {modalOpen && progress && (
        <div className="modal-mask" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              导入进度
              <div className="spacer" />
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                新增 {progress.added}/{progress.target} · 章节 {progress.chapters} · 跳过 {progress.skipped}
                {progress.running ? ` · ${progress.current}` : progress.done ? ' · 已完成' : ''}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 12 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress.target ? Math.min(100, (progress.added / progress.target) * 100) : 0}%`,
                    background: 'var(--accent)',
                    transition: 'width .3s',
                  }}
                />
              </div>
              {progress.items.length === 0 && <div className="muted">正在发现候选…</div>}
              {progress.items
                .filter((it) => it.status !== 'skipped')
                .map((it, i) => (
                  <div className={`fetch-item ${it.status}`} key={`${it.title}-${i}`}>
                    <span className="st">{it.status === 'done' ? '✅' : '⏳'}</span>
                    <span className="tt" title={it.title}>
                      {it.title}
                    </span>
                    <span className="ch">{it.status === 'done' ? `${it.chapters} 话` : '导入中'}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}