import { useEffect, useState } from 'react';
import { api, assetUrl } from '../api';
import type { Comic } from '../types';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { Empty, Loading } from '../components/States';

const MAX = 12;

export default function AdminRecommend() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const ready = useAuth((s) => s.ready);

  const [picks, setPicks] = useState<Comic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<Comic[]>([]);
  const [searching, setSearching] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .adminRecommend()
      .then((r) => setPicks(r.items))
      .catch(() => toast.error('加载失败'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const doSearch = async (query: string) => {
    setQ(query);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await api.list({ q: query, limit: 20 });
      const ids = new Set(picks.map((p) => p._id));
      setResults(r.items.filter((c) => !c.deleted && !ids.has(c._id)));
    } catch {
      /* 忽略 */
    } finally {
      setSearching(false);
    }
  };

  const add = (c: Comic) => {
    if (picks.length >= MAX) {
      toast.error(`最多 ${MAX} 部`);
      return;
    }
    setPicks((p) => [...p, c]);
    setResults((rs) => rs.filter((x) => x._id !== c._id));
    setDirty(true);
  };

  const remove = (id: string) => {
    setPicks((p) => p.filter((c) => c._id !== id));
    setDirty(true);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= picks.length) return;
    setPicks((p) => {
      const a = [...p];
      [a[idx], a[j]] = [a[j], a[idx]];
      return a;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveRecommend(picks.map((c) => c._id));
      setPicks(r.items);
      setDirty(false);
      toast.success('已保存编辑推荐');
    } catch (e) {
      toast.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <Loading />;
  if (!isAdmin) {
    return <Empty text="无权限访问（仅管理员可见）" icon="🔒" />;
  }

  return (
    <div className="page reco-page">
      <div className="reco-header">
        <span className="reco-header-icon">⭐</span>
        <div className="reco-header-text">
          <h1 className="page-title">编辑推荐</h1>
          <p className="reco-sub">配置首页轮播展示的漫画，最多 {MAX} 部，列表顺序即展示顺序（越靠前越优先）。</p>
        </div>
      </div>

      <div className="reco-block">
        <div className="reco-block-head">
          <span>当前推荐（{picks.length}/{MAX}）</span>
          {picks.length > 0 && <span className="reco-hint-inline">拖动 ⋮⋮ 或点击 ↑↓ 调整顺序</span>}
        </div>
        {loading ? (
          <div className="reco-loading">加载中…</div>
        ) : picks.length === 0 ? (
          <div className="reco-empty">
            <div className="reco-empty-icon">📭</div>
            <div>暂无推荐</div>
            <div className="reco-empty-sub">在下方搜索框中查找漫画并点击添加</div>
          </div>
        ) : (
          <div className="reco-list">
            {picks.map((c, i) => (
              <div className="reco-row" key={c._id}>
                <span className="reco-handle" title="拖拽排序（演示）">⋮⋮</span>
                <span className="reco-idx">{i + 1}</span>
                <img className="reco-cover" src={assetUrl(c.cover)} alt={c.title} draggable={false} />
                <div className="reco-info">
                  <div className="reco-title">{c.title}</div>
                  <div className="reco-meta">
                    <span className="reco-chip">{c.region}</span>
                    <span>{c.author || '佚名'}</span>
                  </div>
                </div>
                <div className="reco-ctrl">
                  <button className="reco-btn" disabled={i === 0} onClick={() => move(i, -1)} title="上移">↑</button>
                  <button className="reco-btn" disabled={i === picks.length - 1} onClick={() => move(i, 1)} title="下移">↓</button>
                  <button className="reco-btn danger" onClick={() => remove(c._id)} title="移除">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="reco-block">
        <div className="reco-block-head">
          <span>添加漫画</span>
        </div>
        <input
          className="reco-search"
          placeholder="搜索漫画标题 / 作者…"
          value={q}
          onChange={(e) => doSearch(e.target.value)}
        />
        {searching ? (
          <div className="reco-loading">搜索中…</div>
        ) : (
          <div className="reco-grid">
            {results.map((c) => (
              <div className="reco-card" key={c._id} onClick={() => add(c)} title={`点击添加：${c.title}`}>
                <img src={assetUrl(c.cover)} alt={c.title} draggable={false} />
                <div className="reco-card-title">{c.title}</div>
                <div className="reco-card-add">＋</div>
              </div>
            ))}
            {q.trim() && !searching && results.length === 0 && (
              <div className="reco-nores">没有匹配的漫画</div>
            )}
          </div>
        )}
      </div>

      <div className={`reco-foot${dirty ? ' dirty' : ''}`}>
        <span className="reco-foot-tip">{dirty ? '有未保存的改动' : '已保存'}</span>
        <button className="reco-save-btn" disabled={saving || !dirty} onClick={save}>
          {saving ? '保存中…' : '保存修改'}
        </button>
      </div>
    </div>
  );
}
