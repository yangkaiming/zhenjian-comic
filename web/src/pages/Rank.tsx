import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, assetUrl } from '../api';
import type { Comic } from '../types';
import { Empty, Loading } from '../components/States';
import { formatCount } from '../utils/format';

const TYPES = [
  { key: 'hot', label: '人气榜' },
  { key: 'update', label: '更新榜' },
  { key: 'rating', label: '评分榜' },
];

const REGIONS = ['全部', '国漫', '日漫', '韩漫', '美漫', '其他'];

export default function Rank() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Comic[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const type = params.get('type') || 'hot';
  const region = params.get('region') || '';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .rank(type, region)
      .then((r) => alive && setItems(r.items))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [type, region]);

  const patch = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p);
  };

  return (
    <div className="page">
      <h1 className="page-title">排行榜</h1>
      <div className="toolbar">
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={`chip${type === t.key ? ' active' : ''}`}
            onClick={() => patch({ type: t.key })}
          >
            {t.label}
          </button>
        ))}
        <div className="spacer" />
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

      {loading ? (
        <Loading />
      ) : items.length ? (
        <div className="panel rank-list">
          {items.map((c, i) => (
            <div key={c._id} className="rank-row" onClick={() => navigate(`/comic/${c._id}`)}>
              <div className={`rank-no${i === 0 ? ' top gold' : i === 1 ? ' top silver' : i === 2 ? ' top bronze' : ''}`}>
                {i + 1}
              </div>
              <img className="rank-thumb" src={assetUrl(c.cover)} alt={c.title} />
              <div className="rank-main">
                <div className="update-title">{c.title}</div>
                <div className="update-sub">
                  {c.region} · {c.status} · {c.latestChapter} · {c.categories.join(' / ')}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 96 }}>
                <div style={{ color: 'var(--accent-2)', fontWeight: 700 }}>{c.rating.toFixed(1)} 分</div>
                <div className="update-sub">{formatCount(c.views)} 人气</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </div>
  );
}
