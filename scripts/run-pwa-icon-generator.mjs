import { readFile } from 'node:fs/promises';
import { deflateSync, inflateRawSync } from 'node:zlib';

const SOURCE_SIZE = 160;
const PALETTE_COLORS = 128;
const ADLER_MOD = 65521;

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

function adlerState(data) {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % ADLER_MOD;
    b = (b + a) % ADLER_MOD;
  }
  return { a, b };
}

function recoverTwoTrailingBytes(truncated, expectedAdler) {
  const { a, b } = adlerState(truncated);
  const matches = [];

  for (let first = 0; first <= 255; first += 1) {
    const a1 = (a + first) % ADLER_MOD;
    const b1 = (b + a1) % ADLER_MOD;

    for (let second = 0; second <= 255; second += 1) {
      const a2 = (a1 + second) % ADLER_MOD;
      const b2 = (b1 + a2) % ADLER_MOD;
      const candidate = (((b2 << 16) >>> 0) | a2) >>> 0;
      if (candidate === expectedAdler) matches.push([first, second]);
    }
  }

  if (matches.length !== 1) {
    throw new Error(`Ranger source checksum recovery found ${matches.length} candidate byte pairs`);
  }

  return Buffer.from(matches[0]);
}

if (packed.length === expectedPackedLength - 2) {
  const expectedAdler = compressed.readUInt32BE(compressed.length - 4);
  const recovered = recoverTwoTrailingBytes(packed, expectedAdler);
  if (recovered[0] >= PALETTE_COLORS || recovered[1] >= PALETTE_COLORS) {
    throw new Error(`Recovered Ranger source indices are outside the ${PALETTE_COLORS}-color palette`);
  }
  repairedPacked = Buffer.concat([packed, recovered]);
  console.log(`Recovered approved Ranger source checksum bytes: ${recovered[0]},${recovered[1]}`);
} else if (packed.length !== expectedPackedLength) {
  throw new Error(`Approved Ranger icon payload decoded to ${packed.length} bytes; expected ${expectedPackedLength}`);
}

const repairedCompressed = deflateSync(repairedPacked, { level: 9 });
const repairedSource = generatorSource.replace(sourceMatch[1], repairedCompressed.toString('base64'));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(repairedSource).toString('base64')}`;

await import(moduleUrl);
