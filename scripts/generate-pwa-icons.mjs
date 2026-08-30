import { deflateSync, inflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_SIZE = 160;
const PALETTE_COLORS = 128;
const RANGER_DATA_B64 = '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';
const outputDir = process.argv[2] ?? 'dist/icons';

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}

function encodePng(size, pixels) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const packed = inflateSync(Buffer.from(RANGER_DATA_B64, 'base64'));
const paletteBytes = PALETTE_COLORS * 3;
if (packed.length !== paletteBytes + SOURCE_SIZE * SOURCE_SIZE) {
  throw new Error('Invalid approved Ranger icon source data');
}
const palette = packed.subarray(0, paletteBytes);
const indices = packed.subarray(paletteBytes);
const source = Buffer.alloc(SOURCE_SIZE * SOURCE_SIZE * 3);
for (let i = 0; i < indices.length; i += 1) {
  const pi = indices[i] * 3;
  const oi = i * 3;
  source[oi] = palette[pi];
  source[oi + 1] = palette[pi + 1];
  source[oi + 2] = palette[pi + 2];
}

function resize(size, zoom = 1) {
  const out = Buffer.alloc(size * size * 3);
  const crop = SOURCE_SIZE / zoom;
  const start = (SOURCE_SIZE - crop) / 2;
  for (let y = 0; y < size; y += 1) {
    const sy = start + ((y + 0.5) / size) * crop - 0.5;
    const y0 = Math.max(0, Math.min(SOURCE_SIZE - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(SOURCE_SIZE - 1, y0 + 1));
    const fy = Math.max(0, Math.min(1, sy - y0));
    for (let x = 0; x < size; x += 1) {
      const sx = start + ((x + 0.5) / size) * crop - 0.5;
      const x0 = Math.max(0, Math.min(SOURCE_SIZE - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(SOURCE_SIZE - 1, x0 + 1));
      const fx = Math.max(0, Math.min(1, sx - x0));
      const oi = (y * size + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        const p00 = source[(y0 * SOURCE_SIZE + x0) * 3 + c];
        const p10 = source[(y0 * SOURCE_SIZE + x1) * 3 + c];
        const p01 = source[(y1 * SOURCE_SIZE + x0) * 3 + c];
        const p11 = source[(y1 * SOURCE_SIZE + x1) * 3 + c];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[oi + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return out;
}

await mkdir(outputDir, { recursive: true });
const icon192 = encodePng(192, resize(192));
const icon512 = encodePng(512, resize(512));
const maskable512 = encodePng(512, resize(512, 1.12));
for (const [name, data] of [
  ['icon-192.png', icon192],
  ['ranger-192.png', icon192],
  ['icon-512.png', icon512],
  ['ranger-512.png', icon512],
  ['icon-maskable-512.png', maskable512],
  ['ranger-maskable-512.png', maskable512]
]) {
  await writeFile(path.join(outputDir, name), data);
}
console.log(`Generated approved in-game Ranger launcher icons in ${outputDir}`);
