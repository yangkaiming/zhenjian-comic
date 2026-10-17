export interface NoteSection {
  title: string;
  items: string[];
}

/** 去掉行首的列表符号/序号 */
const cleanItem = (l: string) => l.replace(/^\s*(?:[-*+•·]|\d+[.、)])\s*/, '').trim();

/** 归一化为分组；字符串则作为单个「更新内容」组 */
export function toSections(notes: string | NoteSection[] | undefined | null): NoteSection[] {
  if (Array.isArray(notes)) return notes.filter((s) => s && s.items && s.items.length);
  const items = (notes || '').split(/\r?\n/).map(cleanItem).filter(Boolean);
  return items.length ? [{ title: '更新内容', items }] : [];
}

/** 根据分组标题给个图标 */
export function sectionIcon(title: string): string {
  const t = title.toLowerCase();
  if (/bug|修复|fix/.test(t)) return '🐛';
  if (/新增|功能|feature|new/.test(t)) return '✨';
  if (/优化|improve|perf/.test(t)) return '⚡';
  return '📌';
}

/** 分组渲染更新/版本说明（新增功能 / Bug 修复…），无内容返回 null */
export default function ReleaseNotes({ notes }: { notes: string | NoteSection[] | undefined | null }) {
  const sections = toSections(notes);
  if (!sections.length) return null;
  return (
    <>
      {sections.map((s, i) => (
        <div key={i} className="update-section">
          <div className="update-section-title">
            <span className="update-section-icon">{sectionIcon(s.title)}</span>
            {s.title}
          </div>
          <ul className="update-points">
            {s.items.map((p, j) => (
              <li key={j}>
                <span className="update-dot" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
