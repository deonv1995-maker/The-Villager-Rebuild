import { PHYSICAL_LOG } from '../data/PhysicalLogDefinitions.js';
import {
  roofMemberCandidates,
  roofMemberOccupied,
  roofRegionComplete
} from './RoofMemberRules.js';
import { roofPanelDescriptors } from './StructureRoofQuery.js';

const PLAN_QUANTIZATION = 20;
const LEVEL_TOLERANCE = 0.12;
const MEMBER_PLAN_TOLERANCE = 0.16;

const quantize = value => Math.round(value * PLAN_QUANTIZATION) / PLAN_QUANTIZATION;

const planPointKey = point => `${quantize(point.x)},${quantize(point.z)}`;

export const roofPlanKey = region => [region?.a, region?.b, region?.c, region?.d]
  .filter(Boolean)
  .map(planPointKey)
  .sort()
  .join('|');

const axisYawDelta = (a, b) => {
  const delta = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(delta, Math.abs(Math.PI - delta));
};

const memberPlansMatch = (source, target) => (
  source?.roofRole === target?.roofRole &&
  Math.hypot(source.x - target.x, source.z - target.z) <= MEMBER_PLAN_TOLERANCE &&
  axisYawDelta(source.yaw ?? 0, target.yaw ?? 0) <= 0.12 &&
  Math.abs((source.roofLength ?? 0) - (target.roofLength ?? 0)) <= 0.22
);

const supportingFloorForFrame = (frame, floors) => {
  let best = null;
  let bestDistance = Infinity;
  for (const floor of floors) {
    if (Math.abs((floor.topY ?? 0) - (frame.baseY ?? 0)) > LEVEL_TOLERANCE) continue;
    const dx = frame.x - floor.x;
    const dz = frame.z - floor.z;
    const distance = Math.hypot(dx, dz);
    const cornerReach = Math.hypot(PHYSICAL_LOG.halfLength, PHYSICAL_LOG.floorWidth * 0.5) + 0.28;
    if (distance > cornerReach || distance >= bestDistance) continue;
    bestDistance = distance;
    best = floor;
  }
  return best;
};

const parseBeamAnchorIds = rawKey => {
  const match = /^beam:(\d+)-(\d+)$/.exec(rawKey ?? '');
  return match ? [Number(match[1]), Number(match[2])] : [];
};

const regionStorey = (region, floors) => {
  const matching = floors
    .filter(floor => Math.abs((floor.topY ?? 0) - (region.frameBaseY ?? 0)) <= LEVEL_TOLERANCE)
    .map(floor => floor.storey ?? 0);
  return matching.length ? Math.max(...matching) : 0;
};

export function collectStackedRoofRelocationPlans(regions, members) {
  const groups = new Map();
  for (const region of regions ?? []) {
    const key = roofPlanKey(region);
    if (!key) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(region);
    groups.set(key, bucket);
  }

  const plans = [];
  for (const [planKey, group] of groups) {
    const levels = [...group]
      .sort((left, right) => (left.frameTopY ?? 0) - (right.frameTopY ?? 0));
    if (levels.length < 2) continue;

    let sourceIndex = -1;
    for (let index = levels.length - 1; index >= 0; index -= 1) {
      if (!roofRegionComplete(levels[index], members)) continue;
      sourceIndex = index;
      break;
    }
    if (sourceIndex < 0 || sourceIndex === levels.length - 1) continue;

    const source = levels[sourceIndex];
    const target = levels[levels.length - 1];
    if ((target.frameTopY ?? 0) <= (source.frameTopY ?? 0) + LEVEL_TOLERANCE) continue;
    if (roofRegionComplete(target, members)) continue;

    const sourceMembers = roofMemberCandidates(source);
    const targetMembers = roofMemberCandidates(target);
    if (
      sourceMembers.length !== targetMembers.length ||
      sourceMembers.some((candidate, index) => !memberPlansMatch(candidate, targetMembers[index]))
    ) continue;

    plans.push({
      planKey,
      source,
      target,
      verticalDelta: (target.eaveY ?? 0) - (source.eaveY ?? 0)
    });
  }
  return plans;
}

export class StackedRoofReflowSystem {
  constructor({ physicalLogs, roofQuery, roofThatchSystem = null }) {
    if (!physicalLogs || !roofQuery) {
      throw new Error('StackedRoofReflowSystem requires physicalLogs and roofQuery');
    }
    this.physicalLogs = physicalLogs;
    this.roofQuery = roofQuery;
    this.roofThatchSystem = roofThatchSystem;
    this.lastStructureRevision = -1;
  }

  setRoofThatchSystem(system) {
    this.roofThatchSystem = system ?? null;
  }

  sync() {
    const revision = this.physicalLogs.structureRevision ?? this.physicalLogs.builtLogs.length;
    if (revision === this.lastStructureRevision) {
      return { moved: false, members: 0, panels: 0 };
    }
    this.lastStructureRevision = revision;

    const active = this.physicalLogs.builtLogs.filter(entry => entry.active);
    const floors = active.filter(entry => entry.mode === 'floor');
    const frames = active.filter(entry => entry.mode === 'frame');
    this.#inheritStoreyMetadata(active, floors, frames);

    const regions = this.#collectRegions(frames);
    const plans = collectStackedRoofRelocationPlans(regions, active);
    if (!plans.length) return { moved: false, members: 0, panels: 0 };

    const moves = new Map();
    for (const plan of plans) {
      const sourceCandidates = roofMemberCandidates(plan.source);
      const targetCandidates = roofMemberCandidates(plan.target);
      const targetStorey = regionStorey(plan.target, floors);

      for (let index = 0; index < sourceCandidates.length; index += 1) {
        const sourceCandidate = sourceCandidates[index];
        const targetCandidate = targetCandidates[index];
        const member = active.find(entry => roofMemberOccupied(sourceCandidate, [entry]));
        if (!member) continue;

        const existing = moves.get(member.id);
        if (existing) {
          const sameTarget = (
            Math.hypot(existing.target.x - targetCandidate.x, existing.target.z - targetCandidate.z) <= MEMBER_PLAN_TOLERANCE &&
            Math.abs(existing.target.y - targetCandidate.y) <= LEVEL_TOLERANCE
          );
          if (!sameTarget) continue;
        }
        moves.set(member.id, {
          member,
          source: sourceCandidate,
          target: targetCandidate,
          storey: targetStorey
        });
      }
    }

    let movedMembers = 0;
    for (const move of moves.values()) {
      const { member, target, storey } = move;
      member.root.position.set(target.x, target.y, target.z);
      member.x = target.x;
      member.z = target.z;
      member.yaw = target.yaw;
      member.baseY = Math.min(target.start.y, target.end.y);
      member.centerY = target.y;
      member.topY = Math.max(target.start.y, target.end.y) + PHYSICAL_LOG.radius;
      member.roofKey = target.roofKey;
      member.roofRegionKey = target.roofRegionKey;
      member.roofRole = target.roofRole;
      member.roofLength = target.roofLength;
      member.snapKind = target.snapKind;
      member.storey = storey;
      movedMembers += 1;
    }

    let movedPanels = 0;
    if (movedMembers > 0 && this.roofThatchSystem?.thatched instanceof Map) {
      for (const plan of plans) movedPanels += this.#moveThatch(plan);
    }

    if (movedMembers > 0) {
      this.physicalLogs.structureRevision += 1;
      this.physicalLogs.framePairCacheRevision = -1;
      this.physicalLogs.floorCornerCacheRevision = -1;
      this.physicalLogs.roofQueryCacheRevision = -1;
      this.physicalLogs.roofQueryCacheKey = '';
      this.physicalLogs.roofQueryCache = [];
      this.lastStructureRevision = this.physicalLogs.structureRevision;
      this.roofQuery.cacheRevision = -1;
      this.roofQuery.regionCache?.clear?.();
    }

    return {
      moved: movedMembers > 0,
      members: movedMembers,
      panels: movedPanels
    };
  }

  #collectRegions(frames) {
    const regions = new Map();
    for (const frame of frames) {
      for (const region of this.roofQuery.getRegions(frame)) {
        regions.set(region.key, region);
      }
    }
    return [...regions.values()];
  }

  #inheritStoreyMetadata(active, floors, frames) {
    const frameById = new Map(frames.map(frame => [frame.id, frame]));
    for (const frame of frames) {
      const support = supportingFloorForFrame(frame, floors);
      if (support) frame.storey = support.storey ?? 0;
    }

    for (const entry of active) {
      if (entry.mode !== 'raw' || entry.snapKind !== 'frame-pair-top') continue;
      const anchors = parseBeamAnchorIds(entry.rawKey)
        .map(id => frameById.get(id))
        .filter(Boolean);
      if (!anchors.length) continue;
      entry.storey = Math.max(...anchors.map(frame => frame.storey ?? 0));
    }
  }

  #moveThatch(plan) {
    const sourcePanels = roofPanelDescriptors(plan.source);
    const targetPanels = roofPanelDescriptors(plan.target);
    const targetBySide = new Map(targetPanels.map(panel => [panel.side, panel]));
    let moved = 0;

    for (const sourcePanel of sourcePanels) {
      const targetPanel = targetBySide.get(sourcePanel.side);
      if (!targetPanel) continue;

      let currentKey = sourcePanel.id;
      let state = this.roofThatchSystem.thatched.get(currentKey);
      if (!state) {
        const existing = [...this.roofThatchSystem.thatched.entries()].find(([, candidate]) =>
          candidate?.panel?.regionKey === plan.source.key && candidate?.panel?.side === sourcePanel.side
        );
        if (!existing) continue;
        [currentKey, state] = existing;
      }

      if (this.roofThatchSystem.thatched.has(targetPanel.id) && currentKey !== targetPanel.id) continue;
      const previousCenter = state.panel?.center ?? sourcePanel.center;
      if (state.root?.position) {
        state.root.position.x += targetPanel.center.x - previousCenter.x;
        state.root.position.y += targetPanel.center.y - previousCenter.y;
        state.root.position.z += targetPanel.center.z - previousCenter.z;
        state.root.name = `roof-thatch-${targetPanel.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
        state.root.userData ??= {};
        state.root.userData.thatchPanelId = targetPanel.id;
      }
      state.panel = targetPanel;
      this.roofThatchSystem.thatched.delete(currentKey);
      this.roofThatchSystem.thatched.set(targetPanel.id, state);
      moved += 1;
    }
    return moved;
  }
}
