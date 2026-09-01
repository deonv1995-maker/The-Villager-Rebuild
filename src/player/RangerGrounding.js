const DEFAULT_FOOTPRINT_RADIUS = 0.34;

const FOOTPRINT_DIRECTIONS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2]
]);

export function rangerGroundHeightAt(terrain, x, z, radius = DEFAULT_FOOTPRINT_RADIUS) {
  let ground = terrain.heightAt(x, z);
  for (const [directionX, directionZ] of FOOTPRINT_DIRECTIONS) {
    ground = Math.max(
      ground,
      terrain.heightAt(x + directionX * radius, z + directionZ * radius)
    );
  }
  return ground;
}
