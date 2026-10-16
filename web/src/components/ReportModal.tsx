import { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from '../store/toast';
import type { ReportItem } from '../types';

export interface ReportContext {
  type: ReportItem['type'];
  comicId?: string;
  comicTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  targetId?: string;
}

const REASONS = ['内容违规', '涉嫌侵权', '章节缺失/乱序', '图片无法加载', '其它问题'];

/** 举报反馈弹窗：选定对象 + 选择/填写理由 + 提交 */
export default function ReportModal({
  open,
  context,
  onClose,
}: {
  open: boolean;
  context: ReportContext | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setCustom('');
      setDetail('');
    }
  }, [open]);

  if (!open || !context) return null;

  const finalReason = reason === '__custom__' ? custom.trim() : reason;
  const target =
    context.comicTitle && context.chapterTitle
      ? `${context.comicTitle} · ${context.chapterTitle}`
      : context.comicTitle || context.chapterTitle || '当前内容';

  const submit = async () => {
    if (!finalReason) {
      toast.error('请选择或填写举报理由');
      return;
    }
    setSubmitting(true);
    try {
      await api.createReport({
        type: context.type,
        reason: finalReason,
        detail: detail.trim(),
        targetId: context.targetId,
        comicId: context.comicId,
        comicTitle: context.comicTitle,
        chapterId: context.chapterId,
        chapterTitle: context.chapterTitle,
      });
      toast.success('已提交举报，感谢反馈');
      onClose();
    } catch (e) {
      toast.error((e as Error).message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-mask" onClick={() => !submitting && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">举报反馈</div>
        <div className="modal-body">
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            举报对象：<b>{target}</b>
          </div>
          <div className="setting-label" style={{ marginBottom: 8 }}>举报理由</div>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {REASONS.map((r) => (
              <button
                key={r}
                className={`chip${reason === r ? ' active' : ''}`}
                onClick={() => setReason(reason === r ? '' : r)}
              >
                {r}
              </button>
            ))}
            <button
              className={`chip${reason === '__custom__' ? ' active' : ''}`}
              onClick={() => setReason('__custom__')}
            >
              自定义
            </button>
          </div>
          {reason === '__custom__' && (
            <input
              className="input"
              placeholder="请填写举报理由"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              style={{ marginBottom: 10 }}
            />
          )}
          <div className="setting-label" style={{ marginBottom: 8 }}>补充说明（选填）</div>
          <textarea
            className="input"
            rows={3}
            placeholder="补充更多细节，便于管理员处理…"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button className="btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? '提交中…' : '提交举报'}
          </button>
        </div>
      </div>
    </div>
  );
}
