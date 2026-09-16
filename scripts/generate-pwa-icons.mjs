import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deflateSync, gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { parseHeroMGlb } from '../src/player/HeroMAsset.js';

const HERO_M_PARTS = Object.freeze([
  '../public/assets/player/hero_m.glb.gz.part0.b64',
  '../public/assets/player/hero_m.glb.gz.part1.b64',
  '../public/assets/player/hero_m.glb.gz.part2.b64'
]);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CAMERA_YAW = -0.48;
const LIGHT_DIRECTION = new THREE.Vector3(-0.38, 0.72, 0.58).normalize();
const DEFAULT_COLOR = new THREE.Color(0xaeb8a3);

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
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

function materialRgb(material) {
  const source = Array.isArray(material) ? material[0] : material;
  const color = source?.color?.clone?.() ?? DEFAULT_COLOR.clone();
  color.convertLinearToSRGB();
  return [color.r * 255, color.g * 255, color.b * 255];
}

function vertexRgb(attribute, index, baseRgb) {
  if (!attribute) return baseRgb;
  const r = attribute.getX(index);
  const g = attribute.itemSize > 1 ? attribute.getY(index) : r;
  const b = attribute.itemSize > 2 ? attribute.getZ(index) : r;
  return [baseRgb[0] * r, baseRgb[1] * g, baseRgb[2] * b];
}

function averageRgb(colors) {
  return [0, 1, 2].map(channel => colors.reduce((sum, color) => sum + color[channel], 0) / colors.length);
}

function collectTriangles(scene) {
  const triangles = [];
  const localVertex = new THREE.Vector3();
  scene.updateMatrixWorld(true);

  scene.traverse(object => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    object.skeleton?.update?.();
    const geometry = object.geometry;
    const index = geometry.index;
    const position = geometry.attributes.position;
    const vertexColor = geometry.attributes.color ?? null;
    const baseRgb = materialRgb(object.material);
    const elementCount = index?.count ?? position.count;

    const resolveIndex = element => index ? index.getX(element) : element;
    const resolvePoint = vertexIndex => {
      object.getVertexPosition(vertexIndex, localVertex);
      return localVertex.clone().applyMatrix4(object.matrixWorld);
    };

    for (let element = 0; element + 2 < elementCount; element += 3) {
      const vertexIndices = [resolveIndex(element), resolveIndex(element + 1), resolveIndex(element + 2)];
      const points = vertexIndices.map(resolvePoint);
      const color = averageRgb(vertexIndices.map(vertexIndex => vertexRgb(vertexColor, vertexIndex, baseRgb)));
      triangles.push({ points, color });
    }
  });

  if (triangles.length < 12) throw new Error(`Hero M icon renderer found only ${triangles.length} triangles`);
  return triangles;
}

function rotateForCamera(point) {
  const cos = Math.cos(CAMERA_YAW);
  const sin = Math.sin(CAMERA_YAW);
  return new THREE.Vector3(
    point.x * cos + point.z * sin,
    point.y,
    -point.x * sin + point.z * cos
  );
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
  const ab = points[1].clone().sub(points[0]);
  const ac = points[2].clone().sub(points[0]);
  const normal = ab.cross(ac).normalize();
  return 0.7 + Math.abs(normal.dot(LIGHT_DIRECTION)) * 0.38;
}

function renderHeroM(size, triangles, maskable = false) {
  const pixels = Buffer.alloc(size * size * 3);
  fillBackground(pixels, size);

  const rotated = triangles.map(triangle => ({
    color: triangle.color,
    points: triangle.points.map(rotateForCamera)
  }));
  const allPoints = rotated.flatMap(triangle => triangle.points);
  const minX = Math.min(...allPoints.map(point => point.x));
  const maxX = Math.max(...allPoints.map(point => point.x));
  const minY = Math.min(...allPoints.map(point => point.y));
  const maxY = Math.max(...allPoints.map(point => point.y));
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
    size * 0.5 + (point.x - centerX) * scale,
    baseY - (point.y - minY) * scale + point.z * scale * 0.035
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
      depth: (triangle.points[0].z + triangle.points[1].z + triangle.points[2].z) / 3
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

async function loadHeroMScene() {
  const compressedParts = await Promise.all(HERO_M_PARTS.map(async relativePath => {
    const encoded = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return Buffer.from(encoded.trim(), 'base64');
  }));
  const glb = gunzipSync(Buffer.concat(compressedParts));
  const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  return parseHeroMGlb(arrayBuffer);
}

export async function generatePwaIcons(outputDir = 'public/icons') {
  const scene = await loadHeroMScene();
  const triangles = collectTriangles(scene);
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

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && path.resolve(fileURLToPath(import.meta.url)) === invokedPath) {
  const outputDir = process.argv[2] ?? 'public/icons';
  const result = await generatePwaIcons(outputDir);
  console.log(`Generated Hero M launcher icons from ${result.triangleCount} source triangles`);
}
