import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { deflateSync, inflateRawSync } from 'node:zlib';

const SOURCE_SIZE = 160;
const PALETTE_COLORS = 128;
const RECOVERY_SIZE = 192;

const generatorUrl = new URL('./generate-pwa-icons.mjs', import.meta.url);
const generatorSource = await readFile(generatorUrl, 'utf8');
const verificationSource = await readFile(new URL('./verify-pwa.mjs', import.meta.url), 'utf8');
const sourceMatch = generatorSource.match(/const RANGER_DATA_B64 = '([^']+)';/);
const approvedHashMatch = verificationSource.match(/'icons\/icon-192\.png': '([a-f0-9]{64})'/);

if (!sourceMatch) {
  throw new Error('Approved Ranger icon source payload is missing');
}
if (!approvedHashMatch) {
  throw new Error('Approved Ranger 192px pixel hash is missing');
}

const compressed = Buffer.from(sourceMatch[1], 'base64');
if (compressed.length < 6) {
  throw new Error('Approved Ranger icon source payload is too short');
}

const packed = inflateRawSync(compressed.subarray(2, -4));
const paletteBytes = PALETTE_COLORS * 3;
const expectedPackedLength = paletteBytes + (SOURCE_SIZE * SOURCE_SIZE);
let repairedPacked = packed;

function buildSource(palette, indices) {
  const source = Buffer.alloc(SOURCE_SIZE * SOURCE_SIZE * 3);
  for (let i = 0; i < indices.length; i += 1) {
    const paletteOffset = indices[i] * 3;
    const outputOffset = i * 3;
    source[outputOffset] = palette[paletteOffset];
    source[outputOffset + 1] = palette[paletteOffset + 1];
    source[outputOffset + 2] = palette[paletteOffset + 2];
  }
  return source;
}

function renderPixel(source, x, y, size) {
  const output = Buffer.allocUnsafe(3);
  const sy = ((y + 0.5) / size) * SOURCE_SIZE - 0.5;
  const y0 = Math.max(0, Math.min(SOURCE_SIZE - 1, Math.floor(sy)));
  const y1 = Math.max(0, Math.min(SOURCE_SIZE - 1, y0 + 1));
  const fy = Math.max(0, Math.min(1, sy - y0));
  const sx = ((x + 0.5) / size) * SOURCE_SIZE - 0.5;
  const x0 = Math.max(0, Math.min(SOURCE_SIZE - 1, Math.floor(sx)));
  const x1 = Math.max(0, Math.min(SOURCE_SIZE - 1, x0 + 1));
  const fx = Math.max(0, Math.min(1, sx - x0));

  for (let channel = 0; channel < 3; channel += 1) {
    const p00 = source[(y0 * SOURCE_SIZE + x0) * 3 + channel];
    const p10 = source[(y0 * SOURCE_SIZE + x1) * 3 + channel];
    const p01 = source[(y1 * SOURCE_SIZE + x0) * 3 + channel];
    const p11 = source[(y1 * SOURCE_SIZE + x1) * 3 + channel];
    const top = p00 + (p10 - p00) * fx;
    const bottom = p01 + (p11 - p01) * fx;
    output[channel] = Math.round(top + (bottom - top) * fy);
  }
  return output;
}

function resize192(source) {
  const output = Buffer.alloc(RECOVERY_SIZE * RECOVERY_SIZE * 3);
  for (let y = 0; y < RECOVERY_SIZE; y += 1) {
    for (let x = 0; x < RECOVERY_SIZE; x += 1) {
      renderPixel(source, x, y, RECOVERY_SIZE).copy(output, (y * RECOVERY_SIZE + x) * 3);
    }
  }
  return output;
}

function recoverMissingEdgeIndices(truncatedPacked) {
  const palette = truncatedPacked.subarray(0, paletteBytes);
  const indices = truncatedPacked.subarray(paletteBytes);
  const source = buildSource(palette, indices);
  const baseline = resize192(source);

  // Only the final two source pixels are missing. At 160 -> 192 bilinear
  // scaling they can affect only x=189..191 on rows 190 and 191.
  const firstSegmentStart = (190 * RECOVERY_SIZE + 189) * 3;
  const firstSegmentEnd = (190 * RECOVERY_SIZE + RECOVERY_SIZE) * 3;
  const secondSegmentStart = (191 * RECOVERY_SIZE + 189) * 3;
  const fixedPrefix = createHash('sha256').update(baseline.subarray(0, firstSegmentStart));
  const fixedMiddle = baseline.subarray(firstSegmentEnd, secondSegmentStart);
  const approvedHash = approvedHashMatch[1];
  const firstMissingOffset = (SOURCE_SIZE * SOURCE_SIZE - 2) * 3;
  const secondMissingOffset = (SOURCE_SIZE * SOURCE_SIZE - 1) * 3;

  for (let firstIndex = 0; firstIndex < PALETTE_COLORS; firstIndex += 1) {
    const firstPaletteOffset = firstIndex * 3;
    palette.copy(source, firstMissingOffset, firstPaletteOffset, firstPaletteOffset + 3);

    for (let secondIndex = 0; secondIndex < PALETTE_COLORS; secondIndex += 1) {
      const secondPaletteOffset = secondIndex * 3;
      palette.copy(source, secondMissingOffset, secondPaletteOffset, secondPaletteOffset + 3);

      const firstSegment = Buffer.concat([
        renderPixel(source, 189, 190, RECOVERY_SIZE),
        renderPixel(source, 190, 190, RECOVERY_SIZE),
        renderPixel(source, 191, 190, RECOVERY_SIZE)
      ]);
      const secondSegment = Buffer.concat([
        renderPixel(source, 189, 191, RECOVERY_SIZE),
        renderPixel(source, 190, 191, RECOVERY_SIZE),
        renderPixel(source, 191, 191, RECOVERY_SIZE)
      ]);
      const hash = fixedPrefix.copy()
        .update(firstSegment)
        .update(fixedMiddle)
        .update(secondSegment)
        .digest('hex');

      if (hash === approvedHash) {
        return Buffer.from([firstIndex, secondIndex]);
      }
    }
  }

  throw new Error('Unable to recover the two truncated Ranger edge indices from the approved pixel hash');
}

if (packed.length === expectedPackedLength - 2) {
  const recovered = recoverMissingEdgeIndices(packed);
  repairedPacked = Buffer.concat([packed, recovered]);
  console.log(`Recovered approved Ranger source edge indices: ${recovered[0]},${recovered[1]}`);
} else if (packed.length !== expectedPackedLength) {
  throw new Error(`Approved Ranger icon payload decoded to ${packed.length} bytes; expected ${expectedPackedLength}`);
}

// The branch handoff truncated the final two indexed pixels and left a stale
// zlib trailer. Recompress only the recovered compact source; the canonical
// generator remains the sole renderer, while verify-pwa.mjs remains the sole
// source of truth for the approved decoded launcher-image pixel hashes.
const repairedCompressed = deflateSync(repairedPacked, { level: 9 });
const repairedSource = generatorSource.replace(sourceMatch[1], repairedCompressed.toString('base64'));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(repairedSource).toString('base64')}`;

await import(moduleUrl);
