// 零依赖生成 ApexTodo 图标：A 字尖峰(Apex) + 腰间对勾(Todo)，2x 超采样抗锯齿。
// 运行：node scripts/generate-icons.mjs
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- 设计参数（归一化到 128 画布）----
const CENTER = { x: 64, y: 66 };
const HALF = 56;
const RADIUS = 30;
const TOP = [12, 208, 108];
const BOTTOM = [6, 170, 82];

// 字母 A / 尖峰(Apex)：外三角减内三角 + 一条水平横杠，挺拔、粗细均匀
const OUTER = [{ x: 64, y: 16 }, { x: 27, y: 108 }, { x: 101, y: 108 }];
const INNER = [{ x: 64, y: 50 }, { x: 50.5, y: 108 }, { x: 77.5, y: 108 }];
const BAR = { cx: 64, cy: 75, halfW: 14.5, halfH: 4.3, radius: 2 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const distSeg = (px, py, a, b) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - a.x) * vx + (py - a.y) * vy) / len2, 0, 1);
  return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy));
};
function inTri(px, py, a, b, c) {
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function rasterize(size) {
  const scale = size / 128;
  const buf = Buffer.alloc(size * size * 4);
  const cx = CENTER.x;
  const cy = CENTER.y;
  const half = HALF;
  const radius = RADIUS;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      // 2x2 超采样
      for (const sy of [0.25, 0.75]) {
        for (const sx of [0.25, 0.75]) {
          const px = (x + sx) / scale;
          const py = (y + sy) / scale;

          const qx = Math.abs(px - cx) - (half - radius);
          const qy = Math.abs(py - cy) - (half - radius);
          const boxDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
          const boxCov = 1 - smooth(-0.9, 0.9, boxDist);
          if (boxCov <= 0.002) {
            continue;
          }

          const isA = inTri(px, py, OUTER[0], OUTER[1], OUTER[2]) &&
            !inTri(px, py, INNER[0], INNER[1], INNER[2]);
          const bx = Math.abs(px - BAR.cx) - (BAR.halfW - BAR.radius);
          const by = Math.abs(py - BAR.cy) - (BAR.halfH - BAR.radius);
          const barDist = Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0) - BAR.radius;
          const white = isA || barDist < 0 ? 1 : 0;

          const t = clamp(py / 128, 0, 1);
          let rr = TOP[0] + (BOTTOM[0] - TOP[0]) * t;
          let gg = TOP[1] + (BOTTOM[1] - TOP[1]) * t;
          let bb = TOP[2] + (BOTTOM[2] - TOP[2]) * t;
          rr += (255 - rr) * white;
          gg += (255 - gg) * white;
          bb += (255 - bb) * white;

          r += rr * boxCov;
          g += gg * boxCov;
          b += bb * boxCov;
          a += boxCov;
        }
      }
      const o = (y * size + x) * 4;
      buf[o] = Math.round(r / 4);
      buf[o + 1] = Math.round(g / 4);
      buf[o + 2] = Math.round(b / 4);
      buf[o + 3] = Math.round(clamp(a / 4, 0, 1) * 255);
    }
  }
  return buf;
}

// ---- 极简 PNG 编码 ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  const images = [];
  let offset = 6 + pngs.length * 16;
  pngs.forEach(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
    images.push(data);
  });
  return Buffer.concat([header, ...entries, ...images]);
}
function paste(canvas, cw, ch, src, sSize, dx, dy) {
  for (let y = 0; y < sSize; y += 1) {
    for (let x = 0; x < sSize; x += 1) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= cw || ty >= ch) {
        continue;
      }
      const so = (y * sSize + x) * 4;
      const da = src[so + 3] / 255;
      if (da <= 0) {
        continue;
      }
      const co = (ty * cw + tx) * 4;
      const ia = 1 - da;
      canvas[co] = Math.round(src[so] * da + canvas[co] * ia);
      canvas[co + 1] = Math.round(src[so + 1] * da + canvas[co + 1] * ia);
      canvas[co + 2] = Math.round(src[so + 2] * da + canvas[co + 2] * ia);
      canvas[co + 3] = 255;
    }
  }
}

async function main() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const raster = {};
  const pngs = [];
  for (const s of sizes) {
    raster[s] = rasterize(s);
    pngs.push({ size: s, data: encodePng(raster[s], s, s) });
  }
  await writeFile(path.join(root, 'build', 'icon.ico'), encodeIco(pngs));
  await writeFile(path.join(root, 'build', 'icon.png'), encodePng(rasterize(512), 512, 512));
  await writeFile(path.join(root, 'resources', 'tray-icon.png'), pngs.find((p) => p.size === 32).data);

  const W = 760;
  const H = 380;
  const preview = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const dark = x < W / 2;
      const o = (y * W + x) * 4;
      preview[o] = dark ? 31 : 247;
      preview[o + 1] = dark ? 31 : 247;
      preview[o + 2] = dark ? 31 : 247;
      preview[o + 3] = 255;
    }
  }
  const big = rasterize(140);
  paste(preview, W, H, big, 140, 120, 55);
  paste(preview, W, H, big, 140, 500, 55);
  paste(preview, W, H, raster[48], 48, 120, 245);
  paste(preview, W, H, raster[32], 32, 200, 253);
  paste(preview, W, H, raster[16], 16, 262, 261);
  paste(preview, W, H, raster[48], 48, 500, 245);
  paste(preview, W, H, raster[32], 32, 580, 253);
  paste(preview, W, H, raster[16], 16, 642, 261);
  await writeFile(path.join(root, 'build', 'icon-preview.png'), encodePng(preview, W, H));

  console.log('图标已生成：build/icon.ico, build/icon.png, resources/tray-icon.png, build/icon-preview.png');
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
