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

const supportHeightAt = (terrain, x, z, options) => (
  typeof terrain.walkableHeightAt === 'function'
    ? terrain.walkableHeightAt(x, z, options)
    : terrain.heightAt(x, z)
);

export function rangerGroundHeightAt(
  terrain,
  x,
  z,
  radius = DEFAULT_FOOTPRINT_RADIUS,
  options = {}
) {
  let ground = supportHeightAt(terrain, x, z, options);
  for (const [directionX, directionZ] of FOOTPRINT_DIRECTIONS) {
    ground = Math.max(
      ground,
      supportHeightAt(terrain, x + directionX * radius, z + directionZ * radius, options)
    );
  }
  return ground;
}
