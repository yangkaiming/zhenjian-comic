import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../api';
import type { Comic, HomeData, ShelfItem } from '../types';
import ComicCard from '../components/ComicCard';
import { Empty } from '../components/States';
import { useAuth } from '../store/auth';
import { formatDate } from '../utils/format';

/** 首页加载骨架屏：比转圈更贴近最终布局，减少等待焦虑 */
function HomeSkeleton() {
  return (
    <div className="page">
      <div className="sk-banner" />
      <div className="home-search sk-search" />
      <div className="sk-chips" />
      <div className="section">
        <div className="sk-line" style={{ width: 120 }} />
        <div className="grid grid-lg">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sk-card" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [shelf, setShelf] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .home()
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setShelf([]);
      return;
    }
    api
      .shelf()
      .then((r) => setShelf(r.items.slice(0, 8)))
      .catch(() => setShelf([]));
  }, [user]);

  const banners = data?.banners || [];

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIndex((i) => (i + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (loading) return <HomeSkeleton />;
  if (!data) return <Empty text="加载失败，请检查服务端与 MongoDB 是否已启动" icon="⚠️" />;

  return (
    <div className="page">
      {banners.length > 0 && (
        <div className="banner">
          {banners.map((b, i) => (
            <div
              key={b._id}
              className={`banner-slide${i === bannerIndex ? ' active' : ''}`}
              aria-hidden={i !== bannerIndex}
              onClick={() => navigate(`/comic/${b._id}`)}
            >
              <img src={assetUrl(b.banner || b.cover)} alt={b.title} draggable={false} />
              <div className="banner-mask" />
              <div className="banner-info">
                <span className="banner-tag">编辑推荐 · {b.region}</span>
                <h2 className="banner-title">{b.title}</h2>
                <div className="banner-desc">{b.description}</div>
                <div className="banner-meta">
                  <span className="banner-rate">★ {(b.rating ?? 0).toFixed(1)}</span>
                  <span>{b.author || '佚名'}</span>
                  <span>更新至 {b.latestChapter || '—'}</span>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/comic/${b._id}`);
                  }}
                >
                  立即阅读
                </button>
              </div>
            </div>
          ))}
          <div className="banner-dots">
            {banners.map((b, i) => (
              <button
                key={b._id}
                className={`banner-dot${i === bannerIndex ? ' active' : ''}`}
                onClick={() => setBannerIndex(i)}
                aria-label={`第 ${i + 1} 张`}
              />
            ))}
          </div>
        </div>
      )}

      <form
        className="home-search"
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          if (v) navigate(`/search?q=${encodeURIComponent(v)}`);
        }}
        role="search"
      >
        <span className="hs-icon">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索漫画 / 作者，回车直达"
          aria-label="搜索漫画"
        />
        {q && (
          <button type="button" className="hs-clear" onClick={() => setQ('')} aria-label="清空">
            ✕
          </button>
        )}
        <button type="submit" className="hs-go">
          搜索
        </button>
      </form>

      {user && shelf.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">继续阅读</div>
            <button className="link-more" onClick={() => navigate('/bookshelf')}>
              查看书架 →
            </button>
          </div>
          <div className="grid">
            {shelf.map((item) => (
              <ComicCard
                key={item._id}
                comic={item.comic}
                progress={item.progress}
                onClick={() =>
                  api.resume(item.comic._id).then((r) =>
                    r.chapterId ? navigate(`/read/${r.chapterId}?p=${r.page + 1}`) : navigate(`/comic/${item.comic._id}`),
                  )
                }
                extra={<span className="shelf-status">读到第 {item.lastChapterIndex} 话</span>}
              />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <div className="section-title">分类速览</div>
          <button className="link-more" onClick={() => navigate('/category')}>
            全部分类 →
          </button>
        </div>
        <div className="panel">
          <div className="chip-row">
            {(data.categories || []).slice(0, 20).map((c) => (
              <button key={c} className="chip" onClick={() => navigate(`/category?category=${encodeURIComponent(c)}`)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">热门连载</div>
          <button className="link-more" onClick={() => navigate('/rank?type=hot')}>
            更多 →
          </button>
        </div>
        <div className="grid grid-lg">
          {data.hot.map((c: Comic) => (
            <ComicCard key={c._id} comic={c} latest={c.latestChapter} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">编辑精选</div>
          <button className="link-more" onClick={() => navigate('/rank?type=rating')}>
            更多 →
          </button>
        </div>
        <div className="grid grid-lg">
          {data.recommend.map((c: Comic) => (
            <ComicCard key={c._id} comic={c} latest={c.latestChapter} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">最近更新</div>
          <button className="link-more" onClick={() => navigate('/rank?type=update')}>
            更新榜 →
          </button>
        </div>
        <div>
          {data.latest.slice(0, 8).map(({ comic, chapter }) => (
            <div
              key={chapter._id}
              className="update-row"
              onClick={() => navigate(`/read/${chapter._id}`)}
            >
              <img className="update-thumb" src={assetUrl(comic.cover)} alt={comic.title} />
              <div className="update-main">
                <div className="update-title">{comic.title}</div>
                <div className="update-sub">
                  更新至 {chapter.title} · {formatDate(chapter.releasedAt)}
                </div>
              </div>
              <button className="btn btn-ghost">阅读</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
