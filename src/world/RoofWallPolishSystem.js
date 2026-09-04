export function upperWallKeyForRoofRegion(region) {
  const anchorIds = region?.upperWallAnchorIds;
  if (!Array.isArray(anchorIds) || anchorIds.length !== 2) return null;
  return `wall:${[...anchorIds].sort((left, right) => left - right).join('-')}`;
}

/**
 * A continuous lower roof run may terminate directly against the next storey's
 * structural wall line. When that roof becomes physically complete, any existing
 * DOOR/WINDOW customization on the exact supporting upper FRAME pair is reset once
 * to SOLID. The wall system remains the owner of wall presentation/collision and the
 * roof topology remains the owner of which structural pair the roof is backed by.
 */
export class RoofWallPolishSystem {
  constructor({ physicalLogs, roofQuery, wallPanelSystem }) {
    if (!physicalLogs || !roofQuery || !wallPanelSystem) {
      throw new Error('RoofWallPolishSystem requires physicalLogs, roofQuery and wallPanelSystem');
    }
    this.physicalLogs = physicalLogs;
    this.roofQuery = roofQuery;
    this.wallPanelSystem = wallPanelSystem;
    this.lastStructureRevision = -1;
    this.handledCoverage = new Set();
  }

  sync() {
    this.wallPanelSystem.sync?.();
    const revision = this.physicalLogs.structureRevision ?? this.physicalLogs.builtLogs.length;
    if (revision === this.lastStructureRevision) {
      return { changed: false, solidified: 0 };
    }
    this.lastStructureRevision = revision;

    const activeCoverage = new Set();
    let solidified = 0;

    for (const bay of this.wallPanelSystem.bays ?? []) {
      if (!bay?.complete) continue;
      const regions = this.roofQuery.getCompletedRegions({ x: bay.x, z: bay.z });
      for (const region of regions) {
        if (region?.topology !== 'frame-cell' || region.upperWallRun !== true) continue;
        const wallKey = upperWallKeyForRoofRegion(region);
        if (!wallKey || wallKey !== bay.key) continue;

        const coverageKey = `${region.key}|${bay.key}`;
        activeCoverage.add(coverageKey);
        if (this.handledCoverage.has(coverageKey)) continue;

        const state = this.wallPanelSystem.customizations?.get?.(bay.key) ?? null;
        if (state?.variant === 'door' || state?.variant === 'window') {
          const result = this.wallPanelSystem.customize?.(bay.key, 'solid');
          if (result) solidified += 1;
        }
        this.handledCoverage.add(coverageKey);
      }
    }

    for (const key of [...this.handledCoverage]) {
      if (!activeCoverage.has(key)) this.handledCoverage.delete(key);
    }

    return { changed: solidified > 0, solidified };
  }
}
