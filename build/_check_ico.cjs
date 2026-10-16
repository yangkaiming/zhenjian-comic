// 校验 ico 结构：头部、目录项、偏移与长度是否自洽
const fs = require('node:fs');

const buf = fs.readFileSync('icon.ico');
const reserved = buf.readUInt16LE(0);
const type = buf.readUInt16LE(2);
const count = buf.readUInt16LE(4);
console.log(`reserved=${reserved} type=${type} count=${count} totalBytes=${buf.length}`);

let ok = reserved === 0 && type === 1;
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  const w = buf.readUInt8(o) || 256;
  const planes = buf.readUInt16LE(o + 4);
  const bpp = buf.readUInt16LE(o + 6);
  const size = buf.readUInt32LE(o + 8);
  const off = buf.readUInt32LE(o + 12);
  const inRange = off + size <= buf.length;
  if (!inRange) ok = false;
  console.log(`  #${i} ${w}x${w} planes=${planes} bpp=${bpp} size=${size} end=${off + size} ${inRange ? 'OK' : 'X'}`);
}

for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  const w = buf.readUInt8(o) || 256;
  const size = buf.readUInt32LE(o + 8);
  const off = buf.readUInt32LE(o + 12);
  const hdrSize = buf.readUInt32LE(off);
  const biW = buf.readInt32LE(off + 4);
  const biH = buf.readInt32LE(off + 8);
  const biBpp = buf.readUInt16LE(off + 14);
  const good = hdrSize === 40 && biW === w && biH === w * 2 && biBpp === 32;
  if (!good) ok = false;
  const maskRow = Math.ceil(w / 32) * 4;
  const need = 40 + w * 4 * w + maskRow * w;
  let lenOk = need <= size;
  if (!lenOk) ok = false;
  console.log(`  DIB#${i}: hdr=${hdrSize} w=${biW} h=${biH} bpp=${biBpp} need=${need} size=${size} -> ${good && lenOk ? 'OK' : 'X'}`);
}

console.log(ok ? '==> ICO 结构校验通过' : '==> 存在问题');
process.exit(ok ? 0 : 1);