export const WORLD_LAYOUT = Object.freeze({
  spawn: Object.freeze({ x: 0, z: 91 }),
  boar: Object.freeze({ x: 7.5, z: 55 }),
  dayOneResources: Object.freeze([
    Object.freeze(['stick', 1.6, 78.5]),
    Object.freeze(['stone', -1.8, 78.1]),
    Object.freeze(['stick', 4.6, 73.8]),
    Object.freeze(['stone', -5.2, 73.2]),
    Object.freeze(['stick', -3.5, 69.3]),
    Object.freeze(['stick', 6.9, 66.1]),
    Object.freeze(['stone', 3.2, 63.4]),
    Object.freeze(['stick', -7.4, 61.4]),
    Object.freeze(['stone', 8.4, 58.8]),
    Object.freeze(['stick', -1.6, 56.9])
  ])
});

export function dayOnePathCenterX(z) {
  return Math.sin((z - 8) * 0.061) * 5.2 + Math.sin((z + 24) * 0.027) * 1.7;
}
