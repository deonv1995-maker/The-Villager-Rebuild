import { PANEL_GRID } from '../data/PanelConstructionDefinitions.js';

const keyFor = cell => `${cell.x}:${cell.z}`;
const sortedCells = cells => [...cells].sort((left, right) => (
  left.z - right.z || left.x - right.x
));

const normalizeCells = cells => {
  const unique = new Map();
  for (const cell of cells ?? []) {
    if (!Number.isInteger(cell?.x) || !Number.isInteger(cell?.z)) continue;
    unique.set(keyFor(cell), { x: cell.x, z: cell.z });
  }
  return sortedCells(unique.values());
};

const contiguousRuns = values => {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const runs = [];
  let start = null;
  let end = null;
  for (const value of sorted) {
    if (start === null) {
      start = value;
      end = value;
      continue;
    }
    if (value === end + 1) {
      end = value;
      continue;
    }
    runs.push({ start, end });
    start = value;
    end = value;
  }
  if (start !== null) runs.push({ start, end });
  return runs;
};

const localSegmentsForRuns = (values, centerCoordinate, cellSize) => contiguousRuns(values).map(run => ({
  start: (run.start - centerCoordinate - 0.5) * cellSize,
  end: (run.end - centerCoordinate + 0.5) * cellSize
}));

const partitionAlongX = cells => {
  const rows = new Map();
  for (const cell of cells) {
    if (!rows.has(cell.z)) rows.set(cell.z, []);
    rows.get(cell.z).push(cell.x);
  }

  const rectangles = [];
  let active = new Map();
  for (const z of [...rows.keys()].sort((a, b) => a - b)) {
    const next = new Map();
    for (const run of contiguousRuns(rows.get(z))) {
      const signature = `${run.start}:${run.end}`;
      const previous = active.get(signature);
      if (previous && previous.maxZ === z - 1) {
        previous.maxZ = z;
        next.set(signature, previous);
      } else {
        const rectangle = {
          minX: run.start,
          maxX: run.end,
          minZ: z,
          maxZ: z
        };
        rectangles.push(rectangle);
        next.set(signature, rectangle);
      }
    }
    active = next;
  }
  return rectangles;
};

const partitionAlongZ = cells => partitionAlongX(
  cells.map(cell => ({ x: cell.z, z: cell.x }))
).map(rectangle => ({
  minX: rectangle.minZ,
  maxX: rectangle.maxZ,
  minZ: rectangle.minX,
  maxZ: rectangle.maxX
}));

const rectangleCells = rectangle => {
  const cells = [];
  for (let z = rectangle.minZ; z <= rectangle.maxZ; z += 1) {
    for (let x = rectangle.minX; x <= rectangle.maxX; x += 1) {
      cells.push({ x, z });
    }
  }
  return cells;
};

const partitionSignature = rectangles => rectangles
  .map(rectangle => `${rectangle.minX},${rectangle.minZ},${rectangle.maxX},${rectangle.maxZ}`)
  .sort()
  .join('|');

const partitionScore = (rectangles, preferredAxis) => {
  let dominantSpan = 0;
  let squarePenalty = 0;
  let preferredSpan = 0;
  for (const rectangle of rectangles) {
    const width = rectangle.maxX - rectangle.minX + 1;
    const depth = rectangle.maxZ - rectangle.minZ + 1;
    dominantSpan += Math.max(width, depth);
    squarePenalty += Math.min(width, depth);
    preferredSpan += preferredAxis === 'x' ? width : depth;
  }
  return {
    wingCount: rectangles.length,
    dominantSpan,
    squarePenalty,
    preferredSpan,
    signature: partitionSignature(rectangles)
  };
};

const choosePartition = (cells, preferredAxis) => {
  const candidates = [
    { axis: 'x', rectangles: partitionAlongX(cells) },
    { axis: 'z', rectangles: partitionAlongZ(cells) }
  ];
  candidates.sort((left, right) => {
    const a = partitionScore(left.rectangles, preferredAxis);
    const b = partitionScore(right.rectangles, preferredAxis);
    return (
      a.wingCount - b.wingCount ||
      b.dominantSpan - a.dominantSpan ||
      a.squarePenalty - b.squarePenalty ||
      b.preferredSpan - a.preferredSpan ||
      (left.axis === preferredAxis ? -1 : right.axis === preferredAxis ? 1 : 0) ||
      a.signature.localeCompare(b.signature)
    );
  });
  return candidates[0];
};

const SIDE_DEFINITIONS = Object.freeze({
  west: Object.freeze({ dx: -1, dz: 0, axis: 'x', sign: 'negative' }),
  east: Object.freeze({ dx: 1, dz: 0, axis: 'x', sign: 'positive' }),
  north: Object.freeze({ dx: 0, dz: -1, axis: 'z', sign: 'negative' }),
  south: Object.freeze({ dx: 0, dz: 1, axis: 'z', sign: 'positive' })
});

const wingBoundaryCells = (wing, side) => {
  if (side === 'west') return wing.cells.filter(cell => cell.x === wing.minX);
  if (side === 'east') return wing.cells.filter(cell => cell.x === wing.maxX);
  if (side === 'north') return wing.cells.filter(cell => cell.z === wing.minZ);
  return wing.cells.filter(cell => cell.z === wing.maxZ);
};

const fullSideAttachment = (wing, side, wingByCell) => {
  const definition = SIDE_DEFINITIONS[side];
  const boundary = wingBoundaryCells(wing, side);
  if (!definition || !boundary.length) return null;

  const attachedWingIndices = new Set();
  for (const cell of boundary) {
    const neighbourWingIndex = wingByCell.get(`${cell.x + definition.dx}:${cell.z + definition.dz}`);
    if (!Number.isInteger(neighbourWingIndex) || neighbourWingIndex === wing.index) return null;
    attachedWingIndices.add(neighbourWingIndex);
  }
  if (attachedWingIndices.size !== 1) return null;

  return {
    side,
    axis: definition.axis,
    sign: definition.sign,
    wingIndex: [...attachedWingIndices][0],
    cellCount: boundary.length
  };
};

const fullSideAttachments = (wing, wingByCell) => Object.keys(SIDE_DEFINITIONS)
  .map(side => fullSideAttachment(wing, side, wingByCell))
  .filter(Boolean);

const attachmentRidgeAxis = attachment => (
  attachment?.axis === 'z' ? 'z' : 'x'
);

export function connectedSemanticRoofCells(cells, seed) {
  const normalized = normalizeCells(cells);
  if (!normalized.length) return [];
  const byKey = new Map(normalized.map(cell => [keyFor(cell), cell]));
  const resolvedSeed = byKey.get(keyFor(seed ?? normalized[0]));
  if (!resolvedSeed) return [];

  const queue = [resolvedSeed];
  const visited = new Set([keyFor(resolvedSeed)]);
  const connected = [];
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    connected.push(cell);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbourKey = `${cell.x + dx}:${cell.z + dz}`;
      if (visited.has(neighbourKey) || !byKey.has(neighbourKey)) continue;
      visited.add(neighbourKey);
      queue.push(byKey.get(neighbourKey));
    }
  }
  return sortedCells(connected);
}

export function planSemanticRoofFootprint(cells, {
  cellSize = PANEL_GRID.cellSize,
  preferredAxis = null
} = {}) {
  const normalized = normalizeCells(cells);
  if (!normalized.length) return null;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error('Semantic roof footprint planner requires a positive cell size');
  }

  const minX = Math.min(...normalized.map(cell => cell.x));
  const maxX = Math.max(...normalized.map(cell => cell.x));
  const minZ = Math.min(...normalized.map(cell => cell.z));
  const maxZ = Math.max(...normalized.map(cell => cell.z));
  const widthCells = maxX - minX + 1;
  const depthCells = maxZ - minZ + 1;
  const resolvedPreferredAxis = preferredAxis === 'x' || preferredAxis === 'z'
    ? preferredAxis
    : widthCells >= depthCells ? 'x' : 'z';

  const partition = choosePartition(normalized, resolvedPreferredAxis);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const occupied = new Set(normalized.map(keyFor));
  const wingByCell = new Map();

  const wings = partition.rectangles.map((rectangle, index) => {
    const cells = rectangleCells(rectangle);
    const wingWidthCells = rectangle.maxX - rectangle.minX + 1;
    const wingDepthCells = rectangle.maxZ - rectangle.minZ + 1;
    const ridgeAxis = wingWidthCells > wingDepthCells
      ? 'x'
      : wingDepthCells > wingWidthCells
        ? 'z'
        : partition.axis;
    for (const cell of cells) wingByCell.set(keyFor(cell), index);

    return {
      id: `wing-${index + 1}`,
      index,
      minX: rectangle.minX,
      maxX: rectangle.maxX,
      minZ: rectangle.minZ,
      maxZ: rectangle.maxZ,
      widthCells: wingWidthCells,
      depthCells: wingDepthCells,
      cellCount: cells.length,
      cells,
      ridgeAxis,
      width: wingWidthCells * cellSize,
      depth: wingDepthCells * cellSize,
      offsetX: ((rectangle.minX + rectangle.maxX) * 0.5 - centerX) * cellSize,
      offsetZ: ((rectangle.minZ + rectangle.maxZ) * 0.5 - centerZ) * cellSize
    };
  });

  // Small full-edge appendages read as attached cross-gables rather than isolated
  // caps. Point their ridge into the single larger wing they project from. Ambiguous
  // or equal-size junctions retain the established dimension/partition-axis rule.
  for (const wing of wings) {
    const largerAttachments = fullSideAttachments(wing, wingByCell).filter(attachment => (
      wings[attachment.wingIndex]?.cellCount > wing.cellCount
    ));
    if (largerAttachments.length !== 1) continue;
    const attachment = largerAttachments[0];
    wing.ridgeAxis = attachmentRidgeAxis(attachment);
    wing.joinedToWing = attachment.wingIndex;
    wing.joinSide = attachment.side;
  }

  for (const wing of wings) {
    const attachments = fullSideAttachments(wing, wingByCell);
    const attachmentBySide = new Map(attachments.map(attachment => [attachment.side, attachment]));

    let negativeEaveCoordinates;
    let positiveEaveCoordinates;
    let eaveCenterCoordinate;
    if (wing.ridgeAxis === 'x') {
      negativeEaveCoordinates = wing.cells
        .filter(cell => cell.z === wing.minZ && !occupied.has(`${cell.x}:${cell.z - 1}`))
        .map(cell => cell.x);
      positiveEaveCoordinates = wing.cells
        .filter(cell => cell.z === wing.maxZ && !occupied.has(`${cell.x}:${cell.z + 1}`))
        .map(cell => cell.x);
      eaveCenterCoordinate = (wing.minX + wing.maxX) * 0.5;
      wing.gableEnds = {
        negative: !attachmentBySide.has('west'),
        positive: !attachmentBySide.has('east')
      };
    } else {
      negativeEaveCoordinates = wing.cells
        .filter(cell => cell.x === wing.minX && !occupied.has(`${cell.x - 1}:${cell.z}`))
        .map(cell => cell.z);
      positiveEaveCoordinates = wing.cells
        .filter(cell => cell.x === wing.maxX && !occupied.has(`${cell.x + 1}:${cell.z}`))
        .map(cell => cell.z);
      eaveCenterCoordinate = (wing.minZ + wing.maxZ) * 0.5;
      wing.gableEnds = {
        negative: !attachmentBySide.has('north'),
        positive: !attachmentBySide.has('south')
      };
    }

    wing.eaveSegments = {
      negative: localSegmentsForRuns(negativeEaveCoordinates, eaveCenterCoordinate, cellSize),
      positive: localSegmentsForRuns(positiveEaveCoordinates, eaveCenterCoordinate, cellSize)
    };
  }

  const junctions = [];
  for (const cell of normalized) {
    const wingIndex = wingByCell.get(keyFor(cell));
    for (const [dx, dz, axis] of [[1, 0, 'z'], [0, 1, 'x']]) {
      const neighbour = { x: cell.x + dx, z: cell.z + dz };
      const neighbourWing = wingByCell.get(keyFor(neighbour));
      if (!Number.isInteger(neighbourWing) || neighbourWing === wingIndex) continue;
      junctions.push({
        axis,
        wingA: Math.min(wingIndex, neighbourWing),
        wingB: Math.max(wingIndex, neighbourWing),
        x: (cell.x + dx * 0.5 - centerX) * cellSize,
        z: (cell.z + dz * 0.5 - centerZ) * cellSize,
        length: cellSize
      });
    }
  }

  const cellSignature = normalized.map(cell => `${cell.x},${cell.z}`).join(';');
  const wingSignature = wings.map(wing => (
    `${wing.minX},${wing.minZ},${wing.maxX},${wing.maxZ},${wing.ridgeAxis},${wing.gableEnds.negative ? 'c' : 'o'}${wing.gableEnds.positive ? 'c' : 'o'}`
  )).join(';');

  return {
    cells: normalized,
    cellCount: normalized.length,
    minX,
    maxX,
    minZ,
    maxZ,
    widthCells,
    depthCells,
    width: widthCells * cellSize,
    depth: depthCells * cellSize,
    centerX,
    centerZ,
    primaryAxis: partition.axis,
    wings,
    junctions,
    shapeKey: `footprint:${cellSignature}|wings:${wingSignature}`
  };
}
