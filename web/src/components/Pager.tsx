import { useEffect, useMemo, useState } from 'react';

export interface PagerProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** 总条数，用于展示 */
  total?: number;
}

type Cell = number | 'gap';

/** 生成页码序列：首末页 + 当前页左右各 1 个，其余用省略号 */
function buildCells(current: number, total: number): Cell[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const cells: Cell[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) cells.push('gap');
  for (let i = start; i <= end; i += 1) cells.push(i);
  if (end < total - 1) cells.push('gap');
  cells.push(total);
  return cells;
}

export default function Pager({ page, totalPages, onChange, total }: PagerProps) {
  const [jump, setJump] = useState('');
  const cells = useMemo(() => buildCells(page, totalPages), [page, totalPages]);

  useEffect(() => {
    setJump('');
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  const go = (p: number) => {
    const next = Math.min(totalPages, Math.max(1, Math.round(p)));
    if (next !== page) onChange(next);
  };

  const submitJump = () => {
    const n = Number(jump);
    if (Number.isFinite(n) && n >= 1) go(n);
    setJump('');
  };

  return (
    <div className="pager">
      <button className="pager-btn" disabled={page <= 1} onClick={() => go(page - 1)}>
        ‹ 上一页
      </button>

      {cells.map((c, i) =>
        c === 'gap' ? (
          <span className="pager-gap" key={`gap-${i}`}>
            …
          </span>
        ) : (
          <button
            key={c}
            className={`pager-btn${c === page ? ' active' : ''}`}
            onClick={() => go(c)}
            aria-current={c === page ? 'page' : undefined}
          >
            {c}
          </button>
        ),
      )}

      <button className="pager-btn" disabled={page >= totalPages} onClick={() => go(page + 1)}>
        下一页 ›
      </button>

      <div className="pager-jump">
        <span>共 {totalPages} 页</span>
        {total !== undefined && <span className="pager-total">{total} 条</span>}
        <span>跳至</span>
        <input
          className="pager-input"
          value={jump}
          inputMode="numeric"
          placeholder={String(page)}
          onChange={(e) => setJump(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitJump();
          }}
          onBlur={submitJump}
        />
        <span>页</span>
        <button className="pager-btn" onClick={submitJump} disabled={!jump}>
          跳转
        </button>
      </div>
    </div>
  );
}
