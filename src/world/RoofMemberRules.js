import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';

const ROOF_CENTER_TOLERANCE = 0.18;
const ROOF_HEIGHT_TOLERANCE = 0.18;
const ROOF_AXIS_TOLERANCE = 0.12;
const ROOF_LENGTH_TOLERANCE = 0.22;
const RAFTERS_PER_REGION = 4;

const axisYawDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

const descriptor = (region, suffix, start, end, roofRole, snapKind) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const roofLength = Math.max(0.1, Math.hypot(dx, dy, dz));
  return {
    x: (start.x + end.x) * 0.5,
    y: (start.y + end.y) * 0.5,
    z: (start.z + end.z) * 0.5,
    yaw: Math.atan2(-dz, dx),
    roofLength,
    roofKey: `${region.key}:${suffix}`,
    roofRegionKey: region.key,
    roofRole,
    snapKind,
    supportFrameTopY: region.frameTopY,
    supportTopology: region.topology ?? null,
    start: { ...start },
    end: { ...end }
  };
};

const topologyPriority = topology => {
  if (topology === 'closed-loop') return 0;
  if (topology === 'frame-bounds') return 1;
  if (topology === 'frame-cell') return 2;
  return 3;
};

const structuralTieOrder = candidates => [...candidates].sort((left, right) => (
  topologyPriority(left?.supportTopology) - topologyPriority(right?.supportTopology) ||
  (left?.supportFrameTopY ?? 0) - (right?.supportFrameTopY ?? 0) ||
  String(left?.roofRegionKey ?? '').localeCompare(String(right?.roofRegionKey ?? '')) ||
  String(left?.roofKey ?? '').localeCompare(String(right?.roofKey ?? ''))
));

const runtimeRegionProgress = candidates => {
  const remainingRafters = new Map();
  for (const candidate of candidates ?? []) {
    const key = String(candidate?.roofRegionKey ?? '');
    if (!key) continue;
    if (!remainingRafters.has(key)) remainingRafters.set(key, 0);
    if (candidate.roofRole === 'rafter') {
      remainingRafters.set(key, remainingRafters.get(key) + 1);
    }
  }
  return new Map(
    [...remainingRafters.entries()].map(([key, remaining]) => [
      key,
      Math.max(0, RAFTERS_PER_REGION - remaining)
    ])
  );
};

const runtimeStructuralTieOrder = (candidates, progressByRegion) => [...candidates].sort((left, right) => (
  (progressByRegion.get(String(right?.roofRegionKey ?? '')) ?? 0) -
    (progressByRegion.get(String(left?.roofRegionKey ?? '')) ?? 0) ||
  (right?.supportFrameTopY ?? 0) - (left?.supportFrameTopY ?? 0) ||
  topologyPriority(left?.supportTopology) - topologyPriority(right?.supportTopology) ||
  String(left?.roofRegionKey ?? '').localeCompare(String(right?.roofRegionKey ?? '')) ||
  String(left?.roofKey ?? '').localeCompare(String(right?.roofKey ?? ''))
));

/**
 * One shared five-member gable definition used by placement, thatch completion,
 * interior detection and regression checks. Adjacent roof bays may geometrically
 * share rafter descriptors; geometry-based occupancy lets one physical angled Log
 * satisfy both neighbouring bay descriptors.
 */
export function roofMemberCandidates(region) {
  const ridgeA = {
    x: (region.a.x + region.c.x) * 0.5,
    y: region.ridgeY,
    z: (region.a.z + region.c.z) * 0.5
  };
  const ridgeB = {
    x: (region.b.x + region.d.x) * 0.5,
    y: region.ridgeY,
    z: (region.b.z + region.d.z) * 0.5
  };
  const eaveA = { x: region.a.x, y: region.eaveY, z: region.a.z };
  const eaveB = { x: region.b.x, y: region.eaveY, z: region.b.z };
  const eaveC = { x: region.c.x, y: region.eaveY, z: region.c.z };
  const eaveD = { x: region.d.x, y: region.eaveY, z: region.d.z };

  return [
    descriptor(region, 'rafter:a', eaveA, ridgeA, 'rafter', 'roof-rafter'),
    descriptor(region, 'rafter:b', eaveB, ridgeB, 'rafter', 'roof-rafter'),
    descriptor(region, 'rafter:c', eaveC, ridgeA, 'rafter', 'roof-rafter'),
    descriptor(region, 'rafter:d', eaveD, ridgeB, 'rafter', 'roof-rafter'),
    descriptor(region, 'ridge', ridgeA, ridgeB, 'ridge', 'roof-ridge')
  ];
}

/**
 * Static topology callers receive the original unified two-stage contract: any
 * available rafter keeps all ridges hidden until the rafter stage is complete.
 * Runtime placement sees only unoccupied candidates, so the number of missing rafters
 * is also the progress signal for that support region. Runtime priority therefore keeps
 * an in-progress roof on its active support first; when no coincident roof has progress,
 * it starts on the highest completed FRAME + RAW ring regardless of which valid topology
 * shape recognized that ring. Topology priority is only the tie-break inside an otherwise
 * equivalent runtime support choice.
 */
export function orderedRoofBuildCandidates(candidates) {
  const available = (candidates ?? []).filter(Boolean);
  const hasRuntimeRegionState = available.some(candidate => typeof candidate.raftersComplete === 'boolean');

  if (!hasRuntimeRegionState) {
    const rafters = available.filter(candidate => candidate.roofRole === 'rafter');
    if (rafters.length) return structuralTieOrder(rafters);
    return structuralTieOrder(available.filter(candidate => candidate.roofRole === 'ridge'));
  }

  const progressByRegion = runtimeRegionProgress(available);
  const eligible = available.filter(candidate => (
    candidate.roofRole === 'rafter' ||
    (candidate.roofRole === 'ridge' && candidate.raftersComplete === true)
  ));
  return runtimeStructuralTieOrder(eligible, progressByRegion);
}

export function roofMemberModeMatches(candidate, member) {
  if (!candidate || !member) return false;
  if (member.mode === 'roof') return true;
  if (candidate.roofRole === 'rafter') return member.mode === 'angle';
  if (candidate.roofRole === 'ridge') return member.mode === 'raw';
  return false;
}

/**
 * Occupancy is geometry-first so topology-key churn and shared multi-bay rafters do
 * not create duplicate physical members. Role matching allows the intuitive build
 * sequence (ANGLE rafters + RAW ridge) while retaining legacy ROOF-mode members.
 */
export function roofMemberOccupied(candidate, members) {
  for (const member of members ?? []) {
    if (!member?.active || !roofMemberModeMatches(candidate, member)) continue;
    if (Math.hypot(member.x - candidate.x, member.z - candidate.z) > ROOF_CENTER_TOLERANCE) continue;
    if (Math.abs(member.centerY - candidate.y) > ROOF_HEIGHT_TOLERANCE) continue;
    if (axisYawDelta(member.yaw ?? 0, candidate.yaw ?? 0) > ROOF_AXIS_TOLERANCE) continue;
    const memberLength = member.roofLength ?? PHYSICAL_LOG.length;
    if (Math.abs(memberLength - candidate.roofLength) > ROOF_LENGTH_TOLERANCE) continue;
    return true;
  }
  return false;
}

export function roofRegionHasMembers(region, members) {
  return roofMemberCandidates(region).some(candidate => roofMemberOccupied(candidate, members));
}

export function roofRaftersComplete(region, members) {
  return roofMemberCandidates(region)
    .filter(candidate => candidate.roofRole === 'rafter')
    .every(candidate => roofMemberOccupied(candidate, members));
}

export function roofRegionComplete(region, members) {
  return roofMemberCandidates(region).every(candidate => roofMemberOccupied(candidate, members));
}
