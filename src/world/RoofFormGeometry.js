export const isMonoPitchRoof = region => region?.roofForm === 'mono-pitch';

/**
 * Resolve the shared low/high edge geometry for an attached one-pitch roof bay.
 * Placement, completion and thatch must all consume these exact points so the visible
 * roof can never disagree with the physical snap targets.
 */
export function monoPitchRoofGeometry(region) {
  if (!isMonoPitchRoof(region)) return null;
  const highOnAb = region.highEdge !== 'cd';
  const highStart = highOnAb ? region.a : region.c;
  const highEnd = highOnAb ? region.b : region.d;
  const lowStart = highOnAb ? region.c : region.a;
  const lowEnd = highOnAb ? region.d : region.b;

  return {
    lowA: { x: lowStart.x, y: region.eaveY, z: lowStart.z },
    lowB: { x: lowEnd.x, y: region.eaveY, z: lowEnd.z },
    highA: { x: highStart.x, y: region.ridgeY, z: highStart.z },
    highB: { x: highEnd.x, y: region.ridgeY, z: highEnd.z }
  };
}
