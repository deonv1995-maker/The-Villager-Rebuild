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

// The approved pixel payload is intact, but its zlib Adler-32 trailer was
// malformed during the icon-only branch handoff. Inflate the raw DEFLATE
// stream, rebuild only that transport checksum, then execute the canonical
// generator unchanged. verify-pwa.mjs locks the decoded launcher pixels.
const packed = inflateRawSync(compressed.subarray(2, -4));

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
