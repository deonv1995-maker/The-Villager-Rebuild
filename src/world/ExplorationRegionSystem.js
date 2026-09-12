const rotateIntoRegion = (x, z, region) => {
  const dx = x - region.center.x;
  const dz = z - region.center.z;
  const c = Math.cos(region.yaw);
  const s = Math.sin(region.yaw);
  return {
    u: dx * c + dz * s,
    v: -dx * s + dz * c
  };
};

const influenceAt = (x, z, region) => {
  const { u, v } = rotateIntoRegion(x, z, region);
  return Math.exp(-(
    (u * u) / (2 * region.radii.x * region.radii.x)
    + (v * v) / (2 * region.radii.z * region.radii.z)
  ));
};

export class ExplorationRegionSystem {
  constructor({ regions, activationWeight = 0.18 }) {
    this.regions = regions;
    this.activationWeight = activationWeight;
  }

  regionAt(x, z) {
    let bestRegion = null;
    let bestWeight = 0;

    for (const region of this.regions) {
      const weight = influenceAt(x, z, region);
      if (weight <= bestWeight) continue;
      bestRegion = region;
      bestWeight = weight;
    }

    if (!bestRegion || bestWeight < this.activationWeight) return null;
    return {
      name: bestRegion.id,
      weight: bestWeight,
      biome: bestRegion.biome,
      vegetationMultiplier: bestRegion.vegetationMultiplier,
      forestMultiplier: bestRegion.forestMultiplier,
      poiTypes: bestRegion.poiTypes
    };
  }

  terrainOffsetAt(x, z) {
    let offset = 0;
    for (const region of this.regions) {
      const weight = influenceAt(x, z, region);
      if (weight < 0.025) continue;
      const ruggedField = (
        Math.sin(x * 0.035 + z * 0.026 + region.phase)
        + Math.cos(z * 0.041 - x * 0.018 - region.phase * 0.7)
      ) * 0.5;
      offset += weight * (region.heightBias + ruggedField * region.ruggedness);
    }
    return offset;
  }

  getDefinitions() {
    return this.regions.map(region => ({
      id: region.id,
      biome: region.biome,
      center: { ...region.center },
      radii: { ...region.radii },
      yaw: region.yaw,
      poiTypes: [...region.poiTypes]
    }));
  }
}
