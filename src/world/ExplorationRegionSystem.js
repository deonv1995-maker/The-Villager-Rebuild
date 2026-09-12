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

const smoothstep01 = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export class ExplorationRegionSystem {
  constructor({ regions, activationWeight = 0.18 }) {
    this.regions = regions;
    this.activationWeight = activationWeight;
  }

  #activeStrength(weight) {
    if (weight <= this.activationWeight) return 0;
    const activationRange = Math.max(0.0001, 1 - this.activationWeight);
    return smoothstep01((weight - this.activationWeight) / activationRange);
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
      strength: this.#activeStrength(bestWeight),
      biome: bestRegion.biome,
      vegetationMultiplier: bestRegion.vegetationMultiplier,
      forestMultiplier: bestRegion.forestMultiplier,
      vegetationFloor: bestRegion.vegetationFloor ?? 0,
      forestFloor: bestRegion.forestFloor ?? 0,
      scatter: bestRegion.scatter ?? null,
      poiTypes: bestRegion.poiTypes
    };
  }

  terrainOffsetAt(x, z) {
    let offset = 0;
    for (const region of this.regions) {
      const weight = influenceAt(x, z, region);
      const activeBlend = this.#activeStrength(weight);
      if (activeBlend <= 0) continue;

      const ruggedField = (
        Math.sin(x * 0.035 + z * 0.026 + region.phase)
        + Math.cos(z * 0.041 - x * 0.018 - region.phase * 0.7)
      ) * 0.5;
      const ridgeField = Math.abs(
        Math.sin(x * 0.019 - z * 0.014 + region.phase * 0.8)
        * Math.cos(z * 0.023 + x * 0.011 - region.phase)
      );
      offset += weight * activeBlend * (
        region.heightBias
        + ruggedField * region.ruggedness
        + ridgeField * (region.ridgeStrength ?? 0)
      );
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
      heightBias: region.heightBias,
      ruggedness: region.ruggedness,
      ridgeStrength: region.ridgeStrength ?? 0,
      vegetationFloor: region.vegetationFloor ?? 0,
      forestFloor: region.forestFloor ?? 0,
      scatter: region.scatter ? { ...region.scatter } : null,
      poiTypes: [...region.poiTypes]
    }));
  }
}
