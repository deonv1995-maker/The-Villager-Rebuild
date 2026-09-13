export const EXPLORATION_POIS = Object.freeze([
  Object.freeze({
    id: 'northern-cave-01',
    type: 'cave',
    region: 'northernHighlands',
    // Keep the first cave on the southern foothill rather than on the elevated
    // mountain core. The ground rises behind the entrance and falls toward the
    // approach, so the cave reads as being cut into the base of the mountain.
    x: -52,
    z: -113,
    // Cave-local -Z is the exterior/approach side and +Z is tunnel depth.
    // Face the mouth back toward the southern mainland route players arrive from.
    yaw: 3.32,
    mouthWidth: 7.4,
    mouthHeight: 5.4,
    depth: 8.5,
    // The cave owns one authored deformation profile consumed by the authoritative
    // terrain heightfield. The threshold is sunk deeply enough to sit inside the
    // foothill and the floor keeps descending beneath the surrounding ground.
    terrainCut: Object.freeze({
      approachLength: 4.8,
      backFadeLength: 2.5,
      mouthDrop: 1.25,
      depthDrop: 3.2,
      innerWidthRatio: 0.34,
      outerWidthRatio: 0.7
    })
  })
]);
