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
  const supports = [];
  const seen = new Set();

  for (const group of wallGroups(walls, Math.max(0.000001, levelTolerance))) {
    const storey = group.storey + 1;
    for (const cell of enclosedCellsForGroup(group)) {
      const key = `${storey}:${cell.x}:${cell.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      supports.push({
        x: cell.x,
        z: cell.z,
        storey,
        supportingStorey: group.storey,
        levelY: group.levelY,
        snapKind: 'wall-supported-upper-floor'
      });
    }
  }

  return supports.sort((left, right) => (
    left.storey - right.storey ||
    left.x - right.x ||
    left.z - right.z
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
