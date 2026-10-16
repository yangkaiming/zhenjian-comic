import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Comic } from '../types';
import ComicCard from '../components/ComicCard';
import Pager from '../components/Pager';
import { Empty, Loading } from '../components/States';

const HOT = ['剑歌', '恋爱', '玄幻', '热血', '悬疑', '校园', '修真', '甜宠', '电竞', '末日'];
const HISTORY_KEY = 'zj_search_history';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const resultPage = Number(params.get('page') || 1);
  const [keyword, setKeyword] = useState(q);
  const [suggests, setSuggests] = useState<Comic[]>([]);
  const [results, setResults] = useState<Comic[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hotKeywords, setHotKeywords] = useState<string[]>(HOT);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const timer = useRef<number | null>(null);

  useEffect(() => setKeyword(q), [q]);

  useEffect(() => {
    api
      .meta()
      .then((m) => setHotKeywords(m.hotKeywords?.length ? m.hotKeywords : HOT))
      .catch(() => setHotKeywords(HOT));
  }, []);

  useEffect(() => {
    if (!q) {
      setResults([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .list({ q, limit: 24, page: resultPage })
      .then((r) => {
        if (!alive) return;
        setResults(r.items);
        setTotal(r.total);
        setTotalPages(r.totalPages);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, resultPage]);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const next = [v, ...history.filter((h) => h !== v)].slice(0, 10);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    setSuggests([]);
    setParams({ q: v });
  };

  const onInput = (value: string) => {
    setKeyword(value);
    if (timer.current) window.clearTimeout(timer.current);
    if (!value.trim()) {
      setSuggests([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      api
        .suggest(value.trim())
        .then((r) => setSuggests(r.items))
        .catch(() => setSuggests([]));
    }, 220);
  };

  const showSuggest = useMemo(() => suggests.length > 0 && keyword.trim().length > 0, [suggests, keyword]);

  return (
    <div className="page">
      <h1 className="page-title">搜索</h1>

      <div className="search-box" style={{ maxWidth: 520, marginBottom: 14, height: 40 }}>
        <span className="muted">🔍</span>
        <input
          value={keyword}
          placeholder="搜索漫画名或作者，回车开始找书"
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(keyword)}
        />
        {keyword && (
          <button className="btn btn-ghost" style={{ height: 26 }} onClick={() => { setKeyword(''); setSuggests([]); setParams({}); }}>
            清空
          </button>
        )}
      </div>

      {showSuggest && (
        <div className="panel" style={{ padding: 8, marginBottom: 14 }}>
          {suggests.map((c) => (
            <div
              key={c._id}
              className="chapter-mini"
              onClick={() => navigate(`/comic/${c._id}`)}
            >
              <span>{c.title}</span>
              <span className="muted">{c.author}</span>
            </div>
          ))}
        </div>
      )}

      {!q && (
        <>
          <div className="section">
            <div className="section-title" style={{ marginBottom: 12 }}>热门搜索</div>
            <div className="chip-row">
              {hotKeywords.map((k) => (
                <button key={k} className="chip" onClick={() => submit(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          {history.length > 0 && (
            <div className="section">
              <div className="section-head">
                <div className="section-title">搜索历史</div>
                <button
                  className="link-more"
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem(HISTORY_KEY);
                  }}
                >
                  清空
                </button>
              </div>
              <div className="chip-row">
                {history.map((h) => (
                  <button key={h} className="chip" onClick={() => submit(h)}>
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {q && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">“{q}” 的搜索结果</div>
            <span className="muted">{total} 部</span>
          </div>
          {loading ? (
            <Loading />
          ) : results.length ? (
            <>
              <div className="grid grid-lg">
                {results.map((c) => (
                  <ComicCard key={c._id} comic={c} latest={c.latestChapter} />
                ))}
              </div>
              <Pager
                page={resultPage}
                totalPages={totalPages}
                total={total}
                onChange={(p) => {
                  const np = new URLSearchParams(params);
                  np.set('page', String(p));
                  setParams(np);
                  document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          ) : (
            <Empty text="没有找到相关漫画" icon="🔎" />
          )}
        </div>
      )}
    </div>
  );
}
