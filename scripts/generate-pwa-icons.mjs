import { deflateSync, inflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_SIZE = 160;
const PALETTE_COLORS = 64;
const SCENE_DATA_B64 = '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';

const compressed = Buffer.from(SCENE_DATA_B64, 'base64');
const payload = inflateSync(compressed);
const paletteBytes = PALETTE_COLORS * 3;
if (payload.length !== paletteBytes + SOURCE_SIZE * SOURCE_SIZE) {
  throw new Error(`Unexpected screenshot icon source length: ${payload.length}`);
}
const palette = payload.subarray(0, paletteBytes);
const indices = payload.subarray(paletteBytes);
const source = Buffer.alloc(SOURCE_SIZE * SOURCE_SIZE * 3);
for (let i = 0; i < indices.length; i += 1) {
  const paletteOffset = indices[i] * 3;
  const pixelOffset = i * 3;
  source[pixelOffset] = palette[paletteOffset];
  source[pixelOffset + 1] = palette[paletteOffset + 1];
  source[pixelOffset + 2] = palette[paletteOffset + 2];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resizeBilinear(input, inputSize, outputSize) {
  const output = Buffer.alloc(outputSize * outputSize * 3);
  for (let y = 0; y < outputSize; y += 1) {
    const sourceY = ((y + 0.5) * inputSize) / outputSize - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, inputSize - 1);
    const y1 = clamp(y0 + 1, 0, inputSize - 1);
    const fy = clamp(sourceY - Math.floor(sourceY), 0, 1);
    for (let x = 0; x < outputSize; x += 1) {
      const sourceX = ((x + 0.5) * inputSize) / outputSize - 0.5;
      const x0 = clamp(Math.floor(sourceX), 0, inputSize - 1);
      const x1 = clamp(x0 + 1, 0, inputSize - 1);
      const fx = clamp(sourceX - Math.floor(sourceX), 0, 1);
      const dst = (y * outputSize + x) * 3;
      const p00 = (y0 * inputSize + x0) * 3;
      const p10 = (y0 * inputSize + x1) * 3;
      const p01 = (y1 * inputSize + x0) * 3;
      const p11 = (y1 * inputSize + x1) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        const top = input[p00 + channel] * (1 - fx) + input[p10 + channel] * fx;
        const bottom = input[p01 + channel] * (1 - fx) + input[p11 + channel] * fx;
        output[dst + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return output;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodeRgbPng(rgb, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    rgb.copy(raw, row + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const outputDir = process.argv[2] ?? 'dist/icons';
await mkdir(outputDir, { recursive: true });

for (const size of [192, 512]) {
  const png = encodeRgbPng(resizeBilinear(source, SOURCE_SIZE, size), size);
  await writeFile(path.join(outputDir, `icon-${size}.png`), png);
  await writeFile(path.join(outputDir, `ranger-${size}.png`), png);
  if (size === 512) {
    await writeFile(path.join(outputDir, 'icon-maskable-512.png'), png);
    await writeFile(path.join(outputDir, 'ranger-maskable-512.png'), png);
  }
}

console.log(`Generated screenshot-derived Villager launcher icons in ${outputDir}`);
