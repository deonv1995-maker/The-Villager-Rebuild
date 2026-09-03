export const WORLD_LAYOUT = Object.freeze({
  spawn: Object.freeze({ x: 0, z: 91 }),
  huntAnimal: Object.freeze({ x: 8.5, z: 54 }),
  dayOneResources: Object.freeze([
    Object.freeze(['stick', 1.6, 78.5]),
    Object.freeze(['stone', -1.8, 78.1]),
    Object.freeze(['grass', -3.1, 76.2]),
    Object.freeze(['stick', 4.6, 73.8]),
    Object.freeze(['stone', -5.2, 73.2]),
    Object.freeze(['grass', 5.7, 71.4]),
    Object.freeze(['stick', -3.5, 69.3]),
    Object.freeze(['stone', 6.2, 68.1]),
    Object.freeze(['grass', -6.4, 66.9]),
    Object.freeze(['stick', 6.9, 66.1]),
    Object.freeze(['stone', 3.2, 63.4]),
    Object.freeze(['grass', 1.2, 62.1]),
    Object.freeze(['stick', -7.4, 61.4]),
    Object.freeze(['stone', 8.4, 58.8]),
    Object.freeze(['grass', -8.1, 57.8]),
    Object.freeze(['stick', -1.6, 56.9]),
    Object.freeze(['stone', 5.8, 52.7]),
    Object.freeze(['stick', -5.9, 51.4]),
    Object.freeze(['grass', 1.5, 49.8]),
    Object.freeze(['stone', -2.8, 47.1]),
    Object.freeze(['stick', 9.8, 46.2]),
    Object.freeze(['stone', -9.5, 45.3]),
    Object.freeze(['stick', 6.4, 43.5]),
    Object.freeze(['stone', 2.0, 41.8]),
    Object.freeze(['stick', -6.8, 40.2]),
    Object.freeze(['stone', 8.5, 38.7]),
    Object.freeze(['stone', -3.4, 37.3]),
    Object.freeze(['stone', 5.1, 34.9])
  ])
});

export function dayOnePathCenterX(z) {
  return Math.sin((z - 8) * 0.061) * 5.2 + Math.sin((z + 24) * 0.027) * 1.7;
}
