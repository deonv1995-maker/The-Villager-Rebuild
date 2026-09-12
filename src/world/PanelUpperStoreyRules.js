const cellKey = (x, z) => `${x}:${z}`;

const crossingKey = (ax, az, bx, bz) => {
  const a = cellKey(ax, az);
  const b = cellKey(bx, bz);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

const validWall = wall => (
  Number.isInteger(wall?.storey) &&
  (wall?.axis === 'x' || wall?.axis === 'z') &&
  Number.isInteger(wall?.edgeX) &&
  Number.isInteger(wall?.edgeZ) &&
  Number.isFinite(wall?.topY)
);

const wallGroups = (walls, levelTolerance) => {
  const groups = [];
  const ordered = (walls ?? [])
    .filter(validWall)
    .sort((left, right) => (
      left.storey - right.storey ||
      left.topY - right.topY ||
      String(left.key ?? '').localeCompare(String(right.key ?? ''))
    ));

  for (const wall of ordered) {
    let group = groups.find(candidate => (
      candidate.storey === wall.storey &&
      Math.abs(candidate.levelY - wall.topY) <= levelTolerance
    ));
    if (!group) {
      group = { storey: wall.storey, levelY: wall.topY, walls: [] };
      groups.push(group);
    }
    group.walls.push(wall);
    group.levelY = group.walls.reduce((sum, entry) => sum + entry.topY, 0) / group.walls.length;
  }
  return groups;
};

const enclosedCellsForGroup = group => {
  if (!group?.walls?.length) return [];

  const blocked = new Set();
  let minVertexX = Infinity;
  let maxVertexX = -Infinity;
  let minVertexZ = Infinity;
  let maxVertexZ = -Infinity;

  for (const wall of group.walls) {
    if (wall.axis === 'x') {
      minVertexX = Math.min(minVertexX, wall.edgeX);
      maxVertexX = Math.max(maxVertexX, wall.edgeX + 1);
      minVertexZ = Math.min(minVertexZ, wall.edgeZ);
      maxVertexZ = Math.max(maxVertexZ, wall.edgeZ);
      blocked.add(crossingKey(
        wall.edgeX,
        wall.edgeZ - 1,
        wall.edgeX,
        wall.edgeZ
      ));
    } else {
      minVertexX = Math.min(minVertexX, wall.edgeX);
      maxVertexX = Math.max(maxVertexX, wall.edgeX);
      minVertexZ = Math.min(minVertexZ, wall.edgeZ);
      maxVertexZ = Math.max(maxVertexZ, wall.edgeZ + 1);
      blocked.add(crossingKey(
        wall.edgeX - 1,
        wall.edgeZ,
        wall.edgeX,
        wall.edgeZ
      ));
    }
  }

  if (
    !Number.isFinite(minVertexX) || !Number.isFinite(maxVertexX) ||
    !Number.isFinite(minVertexZ) || !Number.isFinite(maxVertexZ) ||
    maxVertexX <= minVertexX || maxVertexZ <= minVertexZ
  ) return [];

  const minX = minVertexX - 1;
  const maxX = maxVertexX;
  const minZ = minVertexZ - 1;
  const maxZ = maxVertexZ;
  const exterior = new Set();
  const pending = [[minX, minZ]];

  for (let index = 0; index < pending.length; index += 1) {
    const [x, z] = pending[index];
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const key = cellKey(x, z);
    if (exterior.has(key)) continue;
    exterior.add(key);

    const neighbours = [
      [x - 1, z],
      [x + 1, z],
      [x, z - 1],
      [x, z + 1]
    ];
    for (const [nextX, nextZ] of neighbours) {
      if (nextX < minX || nextX > maxX || nextZ < minZ || nextZ > maxZ) continue;
      if (blocked.has(crossingKey(x, z, nextX, nextZ))) continue;
      if (exterior.has(cellKey(nextX, nextZ))) continue;
      pending.push([nextX, nextZ]);
    }
  }

  const enclosed = [];
  for (let x = minVertexX; x < maxVertexX; x += 1) {
    for (let z = minVertexZ; z < maxVertexZ; z += 1) {
      if (!exterior.has(cellKey(x, z))) enclosed.push({ x, z });
    }
  }
  return enclosed;
};

const ownerForWallEdge = (wall, enclosedKeys) => {
  if (wall.axis === 'x') {
    if (enclosedKeys.has(cellKey(wall.edgeX, wall.edgeZ))) {
      return { x: wall.edgeX, z: wall.edgeZ, direction: 'north' };
    }
    if (enclosedKeys.has(cellKey(wall.edgeX, wall.edgeZ - 1))) {
      return { x: wall.edgeX, z: wall.edgeZ - 1, direction: 'south' };
    }
    return null;
  }

  if (enclosedKeys.has(cellKey(wall.edgeX, wall.edgeZ))) {
    return { x: wall.edgeX, z: wall.edgeZ, direction: 'west' };
  }
  if (enclosedKeys.has(cellKey(wall.edgeX - 1, wall.edgeZ))) {
    return { x: wall.edgeX - 1, z: wall.edgeZ, direction: 'east' };
  }
  return null;
};

/**
 * Returns canonical cells enclosed by closed semantic Wall/Door/Window groups.
 * The returned storey is the wall storey and levelY is the exact wall-top support
 * elevation. Floor, stacked-wall and Roof rules all derive from this same enclosure
 * authority so those systems cannot disagree about whether a section is complete.
 */
export function collectPanelWallEnclosureCells(walls, {
  levelTolerance = 0.001
} = {}) {
  const supports = [];
  const seen = new Set();

  for (const group of wallGroups(walls, Math.max(0.000001, levelTolerance))) {
    for (const cell of enclosedCellsForGroup(group)) {
      const key = `${group.storey}:${cell.x}:${cell.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      supports.push({
        x: cell.x,
        z: cell.z,
        storey: group.storey,
        levelY: group.levelY,
        snapKind: 'wall-enclosed-cell'
      });
    }
  }

  return supports.sort((left, right) => (
    left.storey - right.storey ||
    left.x - right.x ||
    left.z - right.z
  ));
}

/**
 * Semantic upper floors are supported by a physically closed wall-family perimeter on
 * the storey below. Wall, Door and Window records all share the same canonical edge
 * identity, so this query deliberately reads semantic wall state rather than rendered
 * meshes or the legacy physical-log FRAME/RAW topology.
 *
 * Flood filling exterior grid cells means a large rectangle, stepped/L-shaped footprint,
 * or several disconnected closed rooms all use the same rule without requiring interior
 * divider walls. The player still chooses which supported upper-floor cells to build.
 */
export function collectPanelUpperStoreySupports(walls, {
  levelTolerance = 0.001
} = {}) {
  return collectPanelWallEnclosureCells(walls, { levelTolerance }).map(support => ({
    x: support.x,
    z: support.z,
    storey: support.storey + 1,
    supportingStorey: support.storey,
    levelY: support.levelY,
    snapKind: 'wall-supported-upper-floor'
  }));
}

/**
 * Once a wall-family storey encloses an interior section, every wall-family edge that
 * participates in that completed section may carry the same edge one storey higher.
 * This allows Solid Wall, Door and Window panels to stack without requiring an upper
 * Floor, while still preventing free-floating or cantilevered wall placement.
 */
export function collectPanelUpperWallSupports(walls, {
  levelTolerance = 0.001
} = {}) {
  const supports = [];
  const seen = new Set();

  for (const group of wallGroups(walls, Math.max(0.000001, levelTolerance))) {
    const enclosed = enclosedCellsForGroup(group);
    if (!enclosed.length) continue;
    const enclosedKeys = new Set(enclosed.map(cell => cellKey(cell.x, cell.z)));

    for (const wall of group.walls) {
      const owner = ownerForWallEdge(wall, enclosedKeys);
      if (!owner) continue;
      const storey = wall.storey + 1;
      const key = `edge:${storey}:${wall.axis}:${wall.edgeX}:${wall.edgeZ}`;
      if (seen.has(key)) continue;
      seen.add(key);
      supports.push({
        key,
        x: owner.x,
        z: owner.z,
        storey,
        direction: owner.direction,
        axis: wall.axis,
        edgeX: wall.edgeX,
        edgeZ: wall.edgeZ,
        supportingStorey: wall.storey,
        supportingWallKey: wall.key,
        levelY: wall.topY,
        snapKind: 'wall-supported-upper-wall'
      });
    }
  }

  return supports.sort((left, right) => (
    left.storey - right.storey ||
    left.axis.localeCompare(right.axis) ||
    left.edgeX - right.edgeX ||
    left.edgeZ - right.edgeZ
  ));
}

export function findPanelUpperStoreySupport(walls, {
  x,
  z,
  storey,
  levelTolerance = 0.001
}) {
  return collectPanelUpperStoreySupports(walls, { levelTolerance })
    .find(support => support.x === x && support.z === z && support.storey === storey) ?? null;
}

/**
 * Confirms that every connected upper-floor component still reaches at least one cell
 * carried by a completed wall-family enclosure below. Floors may cantilever outward by
 * snapping to their same-level neighbours, but the resulting balcony/overhang may never
 * become a disconnected floating island after demolition.
 */
export function panelUpperFloorComponentsSupported(floors, walls, {
  storey,
  levelTolerance = 0.001
} = {}) {
  const candidates = (floors ?? []).filter(floor => (
    Number.isInteger(floor?.x) &&
    Number.isInteger(floor?.z) &&
    Number.isInteger(floor?.storey) &&
    floor.storey > 0 &&
    (storey === undefined || floor.storey === storey) &&
    Number.isFinite(floor.levelY)
  ));
  if (!candidates.length) return true;

  const supports = collectPanelUpperStoreySupports(walls, { levelTolerance });
  const supportsByLevel = new Set(supports.map(support => (
    `${support.storey}:${support.x}:${support.z}:${support.levelY.toFixed(4)}`
  )));
  const remaining = new Map(candidates.map(floor => [
    `${floor.storey}:${floor.x}:${floor.z}`,
    floor
  ]));

  while (remaining.size) {
    const [seedKey, seed] = remaining.entries().next().value;
    remaining.delete(seedKey);
    const pending = [seed];
    let anchored = false;

    for (let index = 0; index < pending.length; index += 1) {
      const floor = pending[index];
      if (supportsByLevel.has(
        `${floor.storey}:${floor.x}:${floor.z}:${floor.levelY.toFixed(4)}`
      )) anchored = true;

      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const neighbourKey = `${floor.storey}:${floor.x + dx}:${floor.z + dz}`;
        const neighbour = remaining.get(neighbourKey);
        if (!neighbour || Math.abs(neighbour.levelY - floor.levelY) > levelTolerance) continue;
        remaining.delete(neighbourKey);
        pending.push(neighbour);
      }
    }

    if (!anchored) return false;
  }
  return true;
}
