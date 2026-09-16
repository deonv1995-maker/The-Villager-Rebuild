import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync, gunzipSync } from 'node:zlib';

const HERO_M_PARTS = Object.freeze([
  '../public/assets/player/hero_m.glb.gz.part0.b64',
  '../public/assets/player/hero_m.glb.gz.part1.b64',
  '../public/assets/player/hero_m.glb.gz.part2.b64'
]);

const TYPE_COMPONENTS = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
});

const COMPONENT_BYTES = Object.freeze({
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CAMERA_YAW = -0.48;
const LIGHT_DIRECTION = normalize3([-0.38, 0.72, 0.58]);

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodeRgbPng(size, pixels) {
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
    pixels.copy(raw, row + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function parseGlb(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Hero M launcher source must be a GLB');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('Hero M launcher source must use glTF 2.0');

  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) throw new Error('Hero M GLB contains a truncated chunk');
    if (type === 0x4e4f534a) {
      json = JSON.parse(bytes.toString('utf8', start, end).replace(/\u0000+$/g, '').trim());
    } else if (type === 0x004e4942) {
      binary = bytes.subarray(start, end);
    }
    offset = end;
  }

  if (!json || !binary) throw new Error('Hero M GLB must contain JSON and BIN chunks');
  return { json, binary };
}

function readComponent(buffer, offset, type) {
  switch (type) {
    case 5120: return buffer.readInt8(offset);
    case 5121: return buffer.readUInt8(offset);
    case 5122: return buffer.readInt16LE(offset);
    case 5123: return buffer.readUInt16LE(offset);
    case 5125: return buffer.readUInt32LE(offset);
    case 5126: return buffer.readFloatLE(offset);
    default: throw new Error(`Unsupported glTF component type ${type}`);
  }
}

function normalizeComponent(value, type) {
  switch (type) {
    case 5120: return Math.max(value / 127, -1);
    case 5121: return value / 255;
    case 5122: return Math.max(value / 32767, -1);
    case 5123: return value / 65535;
    case 5125: return value / 4294967295;
    default: return value;
  }
}

function readAccessor(json, binary, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing glTF accessor ${accessorIndex}`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`Accessor ${accessorIndex} has no buffer view`);
  const itemSize = TYPE_COMPONENTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  if (!itemSize || !componentBytes) throw new Error(`Unsupported accessor ${accessorIndex}`);

  const stride = view.byteStride ?? itemSize * componentBytes;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = new Float64Array(accessor.count * itemSize);
  for (let item = 0; item < accessor.count; item += 1) {
    const itemOffset = base + item * stride;
    for (let component = 0; component < itemSize; component += 1) {
      let value = readComponent(binary, itemOffset + component * componentBytes, accessor.componentType);
      if (accessor.normalized) value = normalizeComponent(value, accessor.componentType);
      values[item * itemSize + component] = value;
    }
  }
  return { values, itemSize, count: accessor.count };
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiplyMatrices(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return [...node.matrix];

  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1
  ];
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function accessorVector(accessor, index, length = accessor.itemSize) {
  const start = index * accessor.itemSize;
  return Array.from(accessor.values.subarray(start, start + length));
}

function materialColor(json, primitive) {
  const factor = json.materials?.[primitive.material]?.pbrMetallicRoughness?.baseColorFactor ?? [0.68, 0.72, 0.64, 1];
  return [factor[0] * 255, factor[1] * 255, factor[2] * 255];
}

function collectTriangles(json, binary) {
  const triangles = [];
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? [];

  const visit = (nodeIndex, parentMatrix) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const world = multiplyMatrices(parentMatrix, nodeMatrix(node));

    if (Number.isInteger(node.mesh)) {
      const mesh = json.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        if ((primitive.mode ?? 4) !== 4 || primitive.attributes?.POSITION === undefined) continue;
        const positions = readAccessor(json, binary, primitive.attributes.POSITION);
        const colors = primitive.attributes.COLOR_0 === undefined
          ? null
          : readAccessor(json, binary, primitive.attributes.COLOR_0);
        const indices = primitive.indices === undefined
          ? null
          : readAccessor(json, binary, primitive.indices);
        const baseColor = materialColor(json, primitive);
        const triangleCount = Math.floor((indices?.count ?? positions.count) / 3);

        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
          const vertexIndices = [0, 1, 2].map(corner => {
            const sequential = triangleIndex * 3 + corner;
            return indices ? Math.round(indices.values[sequential * indices.itemSize]) : sequential;
          });
          const points = vertexIndices.map(index => transformPoint(world, accessorVector(positions, index, 3)));
          let color = baseColor;
          if (colors) {
            const averaged = [0, 0, 0];
            for (const index of vertexIndices) {
              const vertexColor = accessorVector(colors, index, Math.min(3, colors.itemSize));
              averaged[0] += vertexColor[0] ?? 1;
              averaged[1] += vertexColor[1] ?? vertexColor[0] ?? 1;
              averaged[2] += vertexColor[2] ?? vertexColor[0] ?? 1;
            }
            color = averaged.map((value, channel) => baseColor[channel] * (value / 3));
          }
          triangles.push({ points, color });
        }
      }
    }

    for (const child of node.children ?? []) visit(child, world);
  };

  for (const root of roots) visit(root, identityMatrix());
  if (triangles.length < 12) throw new Error(`Hero M icon renderer found only ${triangles.length} triangles`);
  return triangles;
}

function rotateForCamera(point) {
  const cos = Math.cos(CAMERA_YAW);
  const sin = Math.sin(CAMERA_YAW);
  return [
    point[0] * cos + point[2] * sin,
    point[1],
    -point[0] * sin + point[2] * cos
  ];
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 3;
  pixels[offset] = clamp(Math.round(color[0]));
  pixels[offset + 1] = clamp(Math.round(color[1]));
  pixels[offset + 2] = clamp(Math.round(color[2]));
}

function fillBackground(pixels, size) {
  for (let y = 0; y < size; y += 1) {
    const t = y / Math.max(1, size - 1);
    const top = [33, 116, 139];
    const bottom = [17, 53, 37];
    const horizonGlow = Math.max(0, 1 - Math.abs(t - 0.42) * 3.1) * 18;
    const color = [
      top[0] * (1 - t) + bottom[0] * t + horizonGlow * 0.32,
      top[1] * (1 - t) + bottom[1] * t + horizonGlow * 0.58,
      top[2] * (1 - t) + bottom[2] * t + horizonGlow * 0.42
    ];
    for (let x = 0; x < size; x += 1) setPixel(pixels, size, x, y, color);
  }
}

function fillEllipse(pixels, size, cx, cy, rx, ry, color) {
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(size - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(size - 1, Math.ceil(cy + ry));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(pixels, size, x, y, color);
    }
  }
}

function edge(a, b, point) {
  return (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
}

function fillTriangle(pixels, size, a, b, c, color) {
  const area = edge(a, b, c);
  if (Math.abs(area) < 1e-8) return;
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const sign = area < 0 ? -1 : 1;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = [x + 0.5, y + 0.5];
      const w0 = edge(b, c, point) * sign;
      const w1 = edge(c, a, point) * sign;
      const w2 = edge(a, b, point) * sign;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPixel(pixels, size, x, y, color);
    }
  }
}

function triangleShade(points) {
  const ab = [
    points[1][0] - points[0][0],
    points[1][1] - points[0][1],
    points[1][2] - points[0][2]
  ];
  const ac = [
    points[2][0] - points[0][0],
    points[2][1] - points[0][1],
    points[2][2] - points[0][2]
  ];
  const normal = normalize3([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ]);
  const light = Math.abs(
    normal[0] * LIGHT_DIRECTION[0]
    + normal[1] * LIGHT_DIRECTION[1]
    + normal[2] * LIGHT_DIRECTION[2]
  );
  return 0.7 + light * 0.38;
}

function renderHeroM(size, triangles, maskable = false) {
  const pixels = Buffer.alloc(size * size * 3);
  fillBackground(pixels, size);

  const rotated = triangles.map(triangle => ({
    color: triangle.color,
    points: triangle.points.map(rotateForCamera)
  }));
  const allPoints = rotated.flatMap(triangle => triangle.points);
  const minX = Math.min(...allPoints.map(point => point[0]));
  const maxX = Math.max(...allPoints.map(point => point[0]));
  const minY = Math.min(...allPoints.map(point => point[1]));
  const maxY = Math.max(...allPoints.map(point => point[1]));
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const safeScale = maskable ? 0.76 : 0.9;
  const scale = Math.min(
    (size * 0.68 * safeScale) / spanX,
    (size * 0.78 * safeScale) / spanY
  );
  const centerX = (minX + maxX) * 0.5;
  const baseY = size * (maskable ? 0.82 : 0.89);

  const project = point => [
    size * 0.5 + (point[0] - centerX) * scale,
    baseY - (point[1] - minY) * scale + point[2] * scale * 0.035
  ];

  fillEllipse(
    pixels,
    size,
    size * 0.5,
    baseY + size * 0.012,
    size * (maskable ? 0.19 : 0.23),
    size * 0.035,
    [12, 34, 27]
  );

  rotated
    .map(triangle => ({
      ...triangle,
      depth: (triangle.points[0][2] + triangle.points[1][2] + triangle.points[2][2]) / 3
    }))
    .sort((left, right) => left.depth - right.depth)
    .forEach(triangle => {
      const shade = triangleShade(triangle.points);
      const color = triangle.color.map(value => clamp(value * shade));
      fillTriangle(
        pixels,
        size,
        project(triangle.points[0]),
        project(triangle.points[1]),
        project(triangle.points[2]),
        color
      );
    });

  return pixels;
}

async function loadHeroMTriangles() {
  const compressedParts = await Promise.all(HERO_M_PARTS.map(async relativePath => {
    const encoded = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return Buffer.from(encoded.trim(), 'base64');
  }));
  const glb = gunzipSync(Buffer.concat(compressedParts));
  const { json, binary } = parseGlb(glb);
  return collectTriangles(json, binary);
}

export async function generatePwaIcons(outputDir = 'public/icons') {
  const triangles = await loadHeroMTriangles();
  await mkdir(outputDir, { recursive: true });

  const outputs = [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true]
  ];
  for (const [name, size, maskable] of outputs) {
    const pixels = renderHeroM(size, triangles, maskable);
    await writeFile(path.join(outputDir, name), encodeRgbPng(size, pixels));
  }

  return { triangleCount: triangles.length };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const outputDir = process.argv[2] ?? 'public/icons';
  const result = await generatePwaIcons(outputDir);
  console.log(`Generated Hero M launcher icons from ${result.triangleCount} source triangles`);
}
