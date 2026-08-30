import { readFile } from 'node:fs/promises';
import { deflateSync, inflateRawSync } from 'node:zlib';

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
const paletteBytes = 128 * 3;
const expectedPackedLength = paletteBytes + (160 * 160);
let repairedPacked = packed;

if (packed.length === expectedPackedLength - 2) {
  const terminalEdge = packed.subarray(packed.length - 18);
  const edgeIndex = terminalEdge[0];
  if (edgeIndex !== 127 || !terminalEdge.every((value) => value === edgeIndex)) {
    throw new Error('Truncated Ranger icon source does not end in the expected uniform edge palette index');
  }

  repairedPacked = Buffer.concat([packed, Buffer.from([edgeIndex, edgeIndex])]);
} else if (packed.length !== expectedPackedLength) {
  throw new Error(`Approved Ranger icon payload decoded to ${packed.length} bytes; expected ${expectedPackedLength}`);
}

if (repairedPacked.length !== expectedPackedLength) {
  throw new Error('Approved Ranger icon source repair did not restore the declared 160x160 payload');
}

// The branch handoff truncated the final two uniform edge indices and left a
// stale zlib trailer. Recompress only the recovered compact source; the
// canonical generator remains the sole renderer, and verify-pwa.mjs locks
// all three decoded launcher-image pixel hashes.
const repairedCompressed = deflateSync(repairedPacked, { level: 9 });
const repairedSource = generatorSource.replace(sourceMatch[1], repairedCompressed.toString('base64'));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(repairedSource).toString('base64')}`;

await import(moduleUrl);
