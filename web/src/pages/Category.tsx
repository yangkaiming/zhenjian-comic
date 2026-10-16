import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Comic } from '../types';
import ComicCard from '../components/ComicCard';
import Pager from '../components/Pager';
import { Empty } from '../components/States';

const REGIONS = ['全部', '国漫', '日漫', '韩漫', '美漫', '其他'];
const STATUSES = ['全部', '连载', '完结'];
const SORTS = [
  { key: 'hot', label: '人气' },
  { key: 'update', label: '更新' },
  { key: 'rating', label: '评分' },
  { key: 'new', label: '新作' },
];
// 题材默认折叠，只展示前 N 个，避免筛选栏过长
const CAT_PREVIEW = 14;

export default function Category() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState<string[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [items, setItems] = useState<Comic[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const category = params.get('category') || '';
  const region = params.get('region') || '';
  const status = params.get('status') || '';
  const sort = params.get('sort') || 'hot';
  const page = Number(params.get('page') || 1);

  useEffect(() => {
    api.meta().then((m) => setCategories(m.categories)).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .list({ category, region, status, sort, page, limit: 24 })
      .then((res) => {
        if (!alive) return;
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [category, region, status, sort, page]);

  const patch = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    });
    p.delete('page');
    setParams(p);
  };

  const goPage = (p: number) => {
    const np = new URLSearchParams(params);
    np.set('page', String(Math.min(totalPages, Math.max(1, p))));
    setParams(np);
    document.querySelector('.category-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="category-page">
      <h1 className="page-title">分类找书</h1>

      {/* 筛选栏：滚动时吸顶 */}
      <div className="filter-bar">
        <div className="toolbar filter-row">
          <span className="filter-label">地区</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {REGIONS.map((r) => (
              <button
                key={r}
                className={`chip${(r === '全部' ? !region : region === r) ? ' active' : ''}`}
                onClick={() => patch({ region: r === '全部' ? null : r })}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <span className="filter-label">排序</span>
          <div className="row" style={{ gap: 8 }}>
            {SORTS.map((s) => (
              <button
                key={s.key}
                className={`chip${sort === s.key ? ' active' : ''}`}
                onClick={() => patch({ sort: s.key })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar filter-row">
          <span className="filter-label">状态</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`chip${(s === '全部' ? !status : status === s) ? ' active' : ''}`}
              onClick={() => patch({ status: s === '全部' ? null : s })}
            >
              {s}
            </button>
          ))}
          <span className="muted" style={{ marginLeft: 8 }}>
            共 {total} 部作品
          </span>
        </div>

        <div className="chip-row filter-row filter-row-last">
          <span className="filter-label">题材</span>
          <button className={`chip${!category ? ' active' : ''}`} onClick={() => patch({ category: null })}>
            全部题材
          </button>
          {(catOpen ? categories : categories.slice(0, CAT_PREVIEW)).map((c) => (
            <button
              key={c}
              className={`chip${category === c ? ' active' : ''}`}
              onClick={() => patch({ category: c })}
            >
              {c}
            </button>
          ))}
          {categories.length > CAT_PREVIEW && (
            <button className="chip chip-more" onClick={() => setCatOpen((v) => !v)}>
              {catOpen ? '收起 ▴' : `展开其余 ${categories.length - CAT_PREVIEW} 个 ▾`}
            </button>
          )}
        </div>
      </div>

      {/* 只有这块滚动，上面的筛选栏固定不动 */}
      <div className="category-scroll">
        {loading ? (
          /* 用与真实卡片等高同宽的骨架占位，避免加载完成时布局跳动 */
          <div className="grid grid-lg">
            {Array.from({ length: 18 }, (_, i) => (
              <div className="card" key={i}>
                <div className="cover cover-skeleton-static" />
                <div className="card-title sk-line" />
                <div className="card-sub sk-line" style={{ width: '62%' }} />
              </div>
            ))}
          </div>
        ) : items.length ? (
          <>
            <div className="grid grid-lg">
              {items.map((c) => (
                <ComicCard key={c._id} comic={c} latest={c.latestChapter} />
              ))}
            </div>
            <Pager page={page} totalPages={totalPages} total={total} onChange={goPage} />
          </>
        ) : (
          <Empty text="没有符合条件的漫画，换个筛选试试" />
        )}
      </div>
    </div>
  );
}
