/**
 * 动态生成"漫画占位图"（SVG）。
 * 这样项目无需依赖任何外部图片资源即可完整跑起来，
 * 同时每本漫画/每一页都有稳定且不同的画面。
 */

const PALETTES: Array<[string, string, string]> = [
  ['#FFD79A', '#FF8A5B', '#5B3A29'],
  ['#A8E6CF', '#3AB795', '#12463A'],
  ['#FFC3D8', '#FF6E9C', '#5E1F3A'],
  ['#C6D8FF', '#6E8BFF', '#1B2560'],
  ['#FFE9A8', '#FFB23F', '#5A3B10'],
  ['#D9C7FF', '#9A6BFF', '#2E1A5E'],
  ['#BFF3F8', '#3FB6C6', '#0F3B45'],
  ['#FFD6C2', '#F27438', '#4A1F10'],
  ['#E7F7C9', '#8FC93A', '#2B3D12'],
  ['#F8D7FF', '#C44BD8', '#3E1247'],
  ['#D6E4FF', '#5C7CFA', '#182B5E'],
  ['#FFE0E0', '#E35D6A', '#4A1219'],
];

const PHRASES = [
  '?!', '……', '住手！', '快跑——', '真的吗？', '嘿嘿', '呜哇——',
  '看这边', '别过来！', '我赢了', '交给我吧', '原来如此', '糟糕了',
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function esc(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(text: string, perLine: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += perLine) {
    lines.push(text.slice(i, i + perLine));
  }
  return lines.slice(0, 4);
}

const FONT = "'PingFang SC','Microsoft YaHei','Hiragino Sans GB',sans-serif";

/** 漫画封面 3:4 */
export function coverSvg(seed: string, title: string, author: string): string {
  const h = hashString(`cover:${seed}`);
  const rng = makeRng(h);
  const [c1, c2, dark] = PALETTES[h % PALETTES.length];
  const W = 600;
  const H = 800;

  const lines = wrap(title, 5);
  const fontSize = lines.length > 2 ? 52 : 64;
  const startY = H - 210 - (lines.length - 1) * (fontSize + 12);

  let shapes = '';
  // 远景圆
  const sunX = 120 + rng() * 360;
  const sunY = 160 + rng() * 160;
  shapes += `<circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="${(70 + rng() * 60).toFixed(0)}" fill="#ffffff" opacity="0.35"/>`;
  // 山峦
  for (let i = 0; i < 3; i += 1) {
    const baseY = 470 + i * 60;
    const peak = 180 + rng() * 200;
    shapes += `<polygon points="-40,${baseY + 220} ${(rng() * 500).toFixed(0)},${(baseY - peak).toFixed(0)} ${(300 + rng() * 400).toFixed(0)},${(baseY + 40).toFixed(0)} 640,${baseY + 220}" fill="${dark}" opacity="${(0.18 + i * 0.12).toFixed(2)}"/>`;
  }
  // 前景人物剪影
  const px = 300 + (rng() - 0.5) * 220;
  const py = 700;
  shapes += `<g fill="${dark}" opacity="0.85"><circle cx="${px.toFixed(0)}" cy="${(py - 150).toFixed(0)}" r="26"/><path d="M${(px - 34).toFixed(0)} ${py} q34 -110 68 0 z"/></g>`;
  // 装饰小方块
  for (let i = 0; i < 14; i += 1) {
    const x = rng() * W;
    const y = rng() * H;
    const s = 4 + rng() * 12;
    shapes += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="2" fill="#ffffff" opacity="${(0.08 + rng() * 0.18).toFixed(2)}" transform="rotate(${(rng() * 90).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }

  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${startY + i * (fontSize + 12)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" font-weight="800" fill="#ffffff" stroke="${dark}" stroke-width="6" paint-order="stroke" letter-spacing="2">${esc(line)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<clipPath id="clip"><rect width="${W}" height="${H}" rx="18"/></clipPath>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.55"/></linearGradient>
</defs>
<g clip-path="url(#clip)">
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${shapes}
<rect width="${W}" height="${H}" fill="url(#fade)"/>
${titleSvg}
<text x="${W / 2}" y="${H - 150}" text-anchor="middle" font-family="${FONT}" font-size="26" fill="#ffffff" opacity="0.92">${esc(author || '佚名')}</text>
<rect x="${W / 2 - 70}" y="${H - 108}" width="140" height="44" rx="22" fill="#ffffff" opacity="0.22"/>
<text x="${W / 2}" y="${H - 79}" text-anchor="middle" font-family="${FONT}" font-size="24" fill="#ffffff" opacity="0.95">帧间漫画</text>
</g>
</svg>`;
}

/** 漫画内页 */
export function pageSvg(
  seed: string,
  comicTitle: string,
  chapterTitle: string,
  page: number,
  W: number,
  H: number,
): string {
  const h = hashString(`page:${seed}:${page}`);
  const rng = makeRng(h);
  const [c1, c2, dark] = PALETTES[Math.floor(rng() * PALETTES.length)];
  const pad = 24;
  const iw = W - pad * 2;
  const ih = H - pad * 2;

  const templates = [1, 2, 3, 4, 5];
  const tpl = templates[Math.floor(rng() * templates.length)];

  let rects: Array<[number, number, number, number]> = [];
  if (tpl === 1) {
    rects = [
      [0, 0, iw, ih * 0.55],
      [0, ih * 0.58, iw, ih * 0.42],
    ];
  } else if (tpl === 2) {
    rects = [
      [0, 0, iw * 0.62 - 6, ih],
      [iw * 0.62 + 6, 0, iw * 0.38 - 6, ih * 0.48],
      [iw * 0.62 + 6, ih * 0.52, iw * 0.38 - 6, ih * 0.48],
    ];
  } else if (tpl === 3) {
    rects = [
      [0, 0, iw, ih * 0.4],
      [0, ih * 0.43, iw * 0.48 - 5, ih * 0.57],
      [iw * 0.52, ih * 0.43, iw * 0.48, ih * 0.57],
    ];
  } else if (tpl === 4) {
    rects = [
      [0, 0, iw * 0.49 - 4, ih * 0.49],
      [iw * 0.51, 0, iw * 0.49, ih * 0.49],
      [0, ih * 0.51, iw * 0.49 - 4, ih * 0.49],
      [iw * 0.51, ih * 0.51, iw * 0.49, ih * 0.49],
    ];
  } else {
    rects = [
      [0, 0, iw, ih * 0.32],
      [0, ih * 0.35, iw * 0.32 - 4, ih * 0.65],
      [iw * 0.34, ih * 0.35, iw * 0.32, ih * 0.65],
      [iw * 0.68, ih * 0.35, iw * 0.32, ih * 0.65],
    ];
  }

  let panels = '';
  rects.forEach((r, idx) => {
    const [x, y, w, hh] = r;
    const px = pad + x;
    const py = pad + y;
    const gid = `g${idx}`;
    const rot = (rng() * 360).toFixed(0);
    const useDark = rng() > 0.55;
    const bg = useDark ? dark : c1;
    const bg2 = useDark ? c2 : '#ffffff';
    panels += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}" stop-opacity="${useDark ? '0.9' : '0.85'}"/><stop offset="1" stop-color="${bg2}" stop-opacity="0.9"/></linearGradient></defs>`;
    panels += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="6" fill="url(#${gid})" stroke="#1b1b1f" stroke-width="2"/>`;
    // 简单人物剪影
    const cx = px + w * (0.3 + rng() * 0.4);
    const cy = py + hh * 0.82;
    const scale = Math.min(w, hh) / 320;
    const headR = 26 * scale * 1.4;
    panels += `<g clip-path="url(#pclip${idx})">`;
    panels += `<g fill="${useDark ? '#ffffff' : dark}" opacity="0.82"><circle cx="${cx.toFixed(1)}" cy="${(cy - 90 * scale * 1.4).toFixed(1)}" r="${headR.toFixed(1)}"/><path d="M${(cx - 52 * scale).toFixed(1)} ${cy.toFixed(1)} q${(52 * scale).toFixed(1)} ${(-150 * scale).toFixed(1)} ${(104 * scale).toFixed(1)} 0 z"/></g>`;
    // 速度线
    for (let i = 0; i < 5; i += 1) {
      const ly = py + rng() * hh;
      panels += `<rect x="${px.toFixed(1)}" y="${ly.toFixed(1)}" width="${w.toFixed(1)}" height="${(2 + rng() * 4).toFixed(1)}" fill="#ffffff" opacity="${(0.12 + rng() * 0.2).toFixed(2)}"/>`;
    }
    // 对话气泡
    if (rng() > 0.35) {
      const bw = Math.min(w * 0.6, 220 * scale + 90);
      const bh = Math.min(hh * 0.28, 90 * scale + 48);
      const bx = px + 10 + rng() * Math.max(1, w - bw - 20);
      const by = py + 10 + rng() * Math.max(1, hh - bh - 20);
      const phrase = PHRASES[Math.floor(rng() * PHRASES.length)];
      panels += `<g><ellipse cx="${(bx + bw / 2).toFixed(1)}" cy="${(by + bh / 2).toFixed(1)}" rx="${(bw / 2).toFixed(1)}" ry="${(bh / 2).toFixed(1)}" fill="#ffffff" stroke="#1b1b1f" stroke-width="2.5"/><text x="${(bx + bw / 2).toFixed(1)}" y="${(by + bh / 2 + 7).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${Math.min(26, bh * 0.42).toFixed(0)}" font-weight="700" fill="#1b1b1f">${esc(phrase)}</text></g>`;
    }
    panels += `</g>`;
    panels += `<clipPath id="pclip${idx}"><rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="6"/></clipPath>`;
    void rot;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#f4f1ea"/>
<defs><clipPath id="pclip-all"><rect x="${pad}" y="${pad}" width="${iw}" height="${ih}" rx="8"/></clipPath></defs>
<g clip-path="url(#pclip-all)">
<rect x="${pad}" y="${pad}" width="${iw}" height="${ih}" fill="#fbf9f4"/>
${panels}
</g>
<rect x="${pad}" y="${pad}" width="${iw}" height="${ih}" rx="8" fill="none" stroke="#d8d2c6" stroke-width="2"/>
<text x="${pad + 6}" y="${H - 8}" font-family="${FONT}" font-size="16" fill="#9a9384">${esc(comicTitle)} · ${esc(chapterTitle)}</text>
<text x="${W - pad - 6}" y="${H - 8}" text-anchor="end" font-family="${FONT}" font-size="16" fill="#9a9384">${page}</text>
</svg>`;
}

export const SVG_HEADERS = { 'Content-Type': 'image/svg+xml; charset=utf-8' };
