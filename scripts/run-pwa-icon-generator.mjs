import { createHash } from 'node:crypto';
import { copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { generatePwaIcons } from './generate-pwa-icons.mjs';

const outputDir = process.argv[2] ?? 'public/icons';
const installIconAliases = [
  ['icon-192.png', 'hero-m-install-192-v1.png'],
  ['icon-512.png', 'hero-m-install-512-v1.png'],
  ['icon-maskable-512.png', 'hero-m-install-maskable-512-v1.png']
];

const { triangleCount } = await generatePwaIcons(outputDir);
if (!Number.isInteger(triangleCount) || triangleCount < 12) {
  throw new Error(`Hero M launcher generator returned invalid triangle count ${triangleCount}`);
}
console.log(`Generated launcher artwork from ${triangleCount} Hero M source triangles`);

for (const [sourceName, aliasName] of installIconAliases) {
  await copyFile(path.join(outputDir, sourceName), path.join(outputDir, aliasName));
}

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
  console.log(`${name} Hero M pixel sha256 ${createHash('sha256').update(pixels).digest('hex')}`);
}
