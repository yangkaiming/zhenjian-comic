import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { ShelfItem } from '../types';
import ComicCard from '../components/ComicCard';
import Pager from '../components/Pager';
import { Empty, Loading } from '../components/States';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { statusText } from '../utils/format';

const TABS = [
  { key: '', label: '全部' },
  { key: 'want', label: '想读' },
  { key: 'following', label: '追更中' },
  { key: 'finished', label: '已看完' },
  { key: 'dropped', label: '搁置' },
];

const CYCLE = ['want', 'following', 'finished', 'dropped'];
const PAGE_SIZE = 24;

export default function Bookshelf() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const navigate = useNavigate();
  const [tab, setTab] = useState('');
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .shelf(tab)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [user, tab]);

  useEffect(load, [load]);

  if (!ready) return <Loading />;

  if (!user) {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <div className="empty-icon">📚</div>
        <div>登录后可同步书架与阅读进度</div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/login')}>
          去登录
        </button>
      </div>
    );
  }

  const open = (item: ShelfItem) => {
    api
      .resume(item.comic._id)
      .then((r) => {
        if (r.chapterId) navigate(`/read/${r.chapterId}?p=${r.page + 1}`);
        else navigate(`/comic/${item.comic._id}`);
      })
      .catch(() => navigate(`/comic/${item.comic._id}`));
  };

  const cycleStatus = async (item: ShelfItem) => {
    const next = CYCLE[(CYCLE.indexOf(item.status) + 1) % CYCLE.length];
    try {
      await api.updateShelf(item.comic._id, { status: next });
      setItems((list) => list.map((x) => (x._id === item._id ? { ...x, status: next } : x)));
      toast.success(`已标记为「${statusText(next)}」`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (item: ShelfItem) => {
    await api.removeShelf(item.comic._id);
    setItems((list) => list.filter((x) => x._id !== item._id));
    toast.success('已移出书架');
  };

  // 客户端分页（参考分类列表）
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = items.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  return (
    <div className="page">
      <h1 className="page-title">我的书架</h1>
      <div className="toolbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`chip${tab === t.key ? ' active' : ''}`}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        <span className="muted">共 {items.length} 部</span>
      </div>

      {loading ? (
        <Loading />
      ) : items.length ? (
        <>
          <div className="grid grid-lg">
            {pageItems.map((item) => {
              const deleted = !!item.comic.deleted;
              return (
                <div key={item._id}>
                  <ComicCard
                    comic={item.comic}
                    progress={item.progress}
                    onClick={() => (deleted ? navigate(`/comic/${item.comic._id}`) : open(item))}
                    onRemove={deleted ? () => void remove(item) : undefined}
                    removeLabel="移出书架"
                    extra={
                      deleted ? undefined : (
                        <span
                          className="shelf-status"
                          onClick={(e) => {
                            e.stopPropagation();
                            void cycleStatus(item);
                          }}
                          title="点击切换状态"
                        >
                          {statusText(item.status)}
                        </span>
                      )
                    }
                  />
                  {!deleted && (
                    <div className="shelf-meta">
                      <span>读到第 {item.lastChapterIndex} 话</span>
                      <button className="link-danger" onClick={() => void remove(item)}>
                        移出书架
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pager page={curPage} totalPages={totalPages} total={items.length} onChange={setPage} />
        </>
      ) : (
        <Empty text="书架空空如也，去首页挑几本吧" icon="📚" />
      )}
    </div>
  );
}
