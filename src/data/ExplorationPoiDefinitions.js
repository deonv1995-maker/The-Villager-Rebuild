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
    // The entrance is intentionally human-scale. The previous oversized portal
    // stood taller than the foothill itself and forced presentation rocks to fake
    // the missing mountain volume around it.
    mouthWidth: 6.2,
    mouthHeight: 3.4,
    depth: 8.5,
    // The authoritative terrain owns the descending floor. A deeper threshold and
    // longer approach place the walkable tunnel below the untouched shoulders while
    // keeping the descent traversable; the rear presentation overburden then bridges
    // the cut back to the original hillside surface above the tunnel.
    terrainCut: Object.freeze({
      approachLength: 6.8,
      backFadeLength: 2.8,
      mouthDrop: 2.65,
      depthDrop: 6.3,
      innerWidthRatio: 0.36,
      outerWidthRatio: 0.82
    })
  })
]);
