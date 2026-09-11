import * as THREE from 'three';

export const GROUND_SURFACE_COLORS = Object.freeze({
  sand: 0xdfc993,
  sandLight: 0xead6a4,
  sandDamp: 0xcab078,
  rockSteep: 0x776d5d,
  rockSlope: 0x827861,
  grassLow: 0x82ba61,
  grassMid: 0x639e51,
  grassHigh: 0x5a894a,
  ridge: 0x74765b,
  meadowLight: 0x98c96c,
  meadowLush: 0x4b9144,
  meadowDry: 0xa7b166,
  forest: 0x3d7044,
  trailSoil: 0x88704c
});

const COLORS = Object.freeze(
  Object.fromEntries(
    Object.entries(GROUND_SURFACE_COLORS).map(([name, value]) => [name, new THREE.Color(value)])
  )
);

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

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
  const dry = THREE.MathUtils.smoothstep(dryRaw, 0.55, 0.82);

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

  if (sand) {
    target.copy(COLORS.sand);
    target.lerp(COLORS.sandLight, broad * 0.2);
    target.lerp(COLORS.sandDamp, (1 - detail) * 0.08);
    target.offsetHSL(0, 0, (detail - 0.5) * 0.022);
    return target;
  }

  if (slope > 0.82) {
    target.copy(COLORS.rockSteep);
    target.offsetHSL(0, 0, (detail - 0.5) * 0.035);
    return target;
  }

  if (slope > 0.56) {
    target.copy(COLORS.rockSlope);
    target.lerp(COLORS.meadowDry, broad * 0.035);
    target.offsetHSL(0, 0, (detail - 0.5) * 0.03);
    return target;
  }

  if (y < 0.9) target.copy(COLORS.grassLow);
  else if (y < 3.1) target.copy(COLORS.grassMid);
  else if (y < 5.6) target.copy(COLORS.grassHigh);
  else target.copy(COLORS.ridge);

  const patch = clamp01(grassPatchStrength);
  const forest = clamp01(forestCover);
  target.lerp(COLORS.meadowLight, broad * 0.22);
  target.lerp(COLORS.meadowDry, dry * (0.15 - patch * 0.06));
  target.lerp(COLORS.meadowLush, patch * 0.24);
  target.lerp(COLORS.forest, forest * 0.2);
  target.offsetHSL(0, 0, (detail - 0.5) * 0.045);
  return target;
}
