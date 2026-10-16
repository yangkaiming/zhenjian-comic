import type { ReactNode } from 'react';

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <div>{text}</div>
    </div>
  );
}

export function Empty({
  text = '暂无内容',
  icon = '🍂',
  action,
}: {
  text?: string;
  icon?: string;
  /** 底部操作区，如「返回上一层」按钮 */
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div>{text}</div>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
