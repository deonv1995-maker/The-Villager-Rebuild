import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

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
if (packed.length !== expectedPackedLength) {
  const sourceTail = [...packed.subarray(Math.max(paletteBytes, packed.length - 32))].join(',');
  throw new Error(
    `Approved Ranger icon payload decoded to ${packed.length} bytes; expected ${expectedPackedLength}; ` +
    `source tail indices: [${sourceTail}]`
  );
}

function adler32(data) {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

const repaired = Buffer.from(compressed);
repaired.writeUInt32BE(adler32(packed), repaired.length - 4);
const repairedSource = generatorSource.replace(sourceMatch[1], repaired.toString('base64'));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(repairedSource).toString('base64')}`;

await import(moduleUrl);
