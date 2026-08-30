import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync, inflateRawSync, inflateSync } from 'node:zlib';

const SOURCE_SIZE = 160;
const PALETTE_COLORS = 128;
const outputDir = process.argv[2] ?? 'public/icons';

const generatorUrl = new URL('./generate-pwa-icons.mjs', import.meta.url);
const generatorSource = await readFile(generatorUrl, 'utf8');
const sourceMatch = generatorSource.match(/const RANGER_DATA_B64 = '([^']+)';/);

if (!sourceMatch) {
  throw new Error('Approved Ranger icon source payload is missing');
}

const compressed = Buffer.from(sourceMatch[1], 'base64');
if (compressed.length < 6) {
  throw new Error('Approved Ranger icon source payload is too short');
}

const packed = inflateRawSync(compressed.subarray(2, -4));
const paletteBytes = PALETTE_COLORS * 3;
const expectedPackedLength = paletteBytes + (SOURCE_SIZE * SOURCE_SIZE);
let repairedPacked = packed;

if (packed.length === expectedPackedLength - 2) {
  const terminalEdge = packed.subarray(packed.length - 18);
  if (!terminalEdge.every((value) => value === 127)) {
    throw new Error('Truncated Ranger source no longer ends in the known uniform forest-edge palette index');
  }
  repairedPacked = Buffer.concat([packed, Buffer.from([127, 127])]);
  console.log('Restored two truncated uniform Ranger edge indices');
} else if (packed.length !== expectedPackedLength) {
  throw new Error(`Approved Ranger icon payload decoded to ${packed.length} bytes; expected ${expectedPackedLength}`);
}

const repairedCompressed = deflateSync(repairedPacked, { level: 9 });
const repairedSource = generatorSource.replace(sourceMatch[1], repairedCompressed.toString('base64'));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(repairedSource).toString('base64')}`;
await import(moduleUrl);

function decodeGeneratedRgbPng(data, expectedSize) {
  if (data.readUInt32BE(0) !== 0x89504e47) throw new Error('Invalid generated PNG signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (width !== expectedSize || height !== expectedSize) throw new Error('Unexpected generated PNG dimensions');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = expectedSize * 3;
  const pixels = Buffer.alloc(expectedSize * expectedSize * 3);
  let sourceOffset = 0;
  for (let y = 0; y < expectedSize; y += 1) {
    const filter = raw[sourceOffset];
    if (filter !== 0) throw new Error(`Unexpected generated PNG filter ${filter}`);
    sourceOffset += 1;
    raw.copy(pixels, y * stride, sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
  }
  return pixels;
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
  const png = await readFile(path.join(outputDir, name));
  const pixels = decodeGeneratedRgbPng(png, size);
  console.log(`${name} pixel sha256 ${createHash('sha256').update(pixels).digest('hex')}`);
}
