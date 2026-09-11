import * as THREE from 'three';

export const GROUND_SURFACE_COLORS = Object.freeze({
  sand: 0xdfc38a,
  sandLight: 0xedd6a0,
  sandDamp: 0xc5a86f,
  rockSteep: 0x746b5c,
  rockSlope: 0x81755f,
  grassLow: 0x79b85c,
  grassMid: 0x5fa14d,
  grassHigh: 0x508b44,
  ridge: 0x72745a,
  meadowLight: 0x9acb6b,
  meadowLush: 0x438f43,
  meadowDry: 0xa8ad64,
  forest: 0x386d40,
  trailSoil: 0x6f4d2f
});

const COLORS = Object.freeze(
  Object.fromEntries(
    Object.entries(GROUND_SURFACE_COLORS).map(([name, value]) => [name, new THREE.Color(value)])
  )
);

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const stepped = (value, steps) => Math.round(clamp01(value) * steps) / steps;

const hash01 = (x, z, salt = 0) => {
  let value = Math.imul((x | 0) ^ (salt * 374761393), 668265263);
  value = Math.imul(value ^ ((z | 0) * 2246822519), 1274126177);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
};

/**
 * Broad fields describe climate/biome colour. Patch fields describe the visible hand-built
 * low-poly surface breakup seen at gameplay distance. Keeping these separate means terrain
 * height, collision, ecology and placement stay untouched while the rendered ground gains a
 * much clearer lawn/soil mosaic instead of one softly interpolated green sheet.
 */
export function terrainSurfacePatchFieldsAt(x, z) {
  const broadCellSize = 6.4;
  const detailCellSize = 2.8;
  const broadX = Math.floor((x + 1.7) / broadCellSize);
  const broadZ = Math.floor((z - 2.3) / broadCellSize);
  const detailX = Math.floor((x - 0.9) / detailCellSize);
  const detailZ = Math.floor((z + 1.1) / detailCellSize);

  const lawnPatch = stepped(
    hash01(broadX, broadZ, 11) * 0.62 + hash01(detailX, detailZ, 23) * 0.38,
    5
  );
  const dryPatch = stepped(
    hash01(broadX - 7, broadZ + 13, 31) * 0.7 + hash01(detailX + 5, detailZ - 3, 47) * 0.3,
    4
  );
  const fleck = stepped(hash01(detailX, detailZ, 71), 6);
  return { lawnPatch, dryPatch, fleck };
}

export function terrainSurfaceToneFieldsAt(x, z) {
  const broad = clamp01(0.5 + (
    Math.sin(x * 0.021 + z * 0.012 + 0.6) +
    Math.cos(z * 0.026 - x * 0.008 - 1.1) +
    Math.sin((x - z) * 0.017 + 1.7)
  ) / 6);

  const detail = clamp01(0.5
    + Math.sin(x * 0.083 + z * 0.057 + 0.4) * 0.18
    + Math.cos(z * 0.071 - x * 0.044 - 2.0) * 0.13
    + Math.sin((x + z) * 0.041 + 1.3) * 0.09);

  const dryRaw = clamp01(0.5 + (
    Math.sin(x * 0.035 - z * 0.029 + 2.1) +
    Math.cos(z * 0.044 + x * 0.018 - 0.5)
  ) / 4);
  const dry = THREE.MathUtils.smoothstep(dryRaw, 0.5, 0.8);

  return { broad, detail, dry };
}

export function terrainSurfaceColorAt({
  x,
  z,
  y,
  slope,
  sand,
  forestCover = 0,
  grassPatchStrength = 0
}, target = new THREE.Color()) {
  const { broad, detail, dry } = terrainSurfaceToneFieldsAt(x, z);
  const { lawnPatch, dryPatch, fleck } = terrainSurfacePatchFieldsAt(x, z);

  if (sand) {
    target.copy(COLORS.sand);
    target.lerp(COLORS.sandLight, broad * 0.25 + lawnPatch * 0.08);
    target.lerp(COLORS.sandDamp, (1 - detail) * 0.12);
    target.offsetHSL(0, 0, (fleck - 0.5) * 0.035);
    return target;
  }

  if (slope > 0.82) {
    target.copy(COLORS.rockSteep);
    target.offsetHSL(0, 0, (fleck - 0.5) * 0.055);
    return target;
  }

  if (slope > 0.56) {
    target.copy(COLORS.rockSlope);
    target.lerp(COLORS.meadowDry, broad * 0.055 + dryPatch * 0.03);
    target.offsetHSL(0, 0, (detail - 0.5) * 0.045);
    return target;
  }

  if (y < 0.9) target.copy(COLORS.grassLow);
  else if (y < 3.1) target.copy(COLORS.grassMid);
  else if (y < 5.6) target.copy(COLORS.grassHigh);
  else target.copy(COLORS.ridge);

  const patch = clamp01(grassPatchStrength);
  const forest = clamp01(forestCover);
  const lushStrength = clamp01(patch * 0.34 + lawnPatch * 0.2 + broad * 0.09);
  const dryStrength = clamp01(dry * 0.16 + dryPatch * (0.08 - patch * 0.035));

  target.lerp(COLORS.meadowLight, broad * 0.16 + lawnPatch * 0.08);
  target.lerp(COLORS.meadowDry, dryStrength);
  target.lerp(COLORS.meadowLush, lushStrength);
  target.lerp(COLORS.forest, forest * 0.24);
  target.offsetHSL(0, 0, (stepped(detail, 5) - 0.5) * 0.065 + (fleck - 0.5) * 0.025);
  return target;
}
