import {
  PANEL_DIRECTIONS,
  PANEL_GRID
} from '../data/PanelConstructionDefinitions.js';
import {
  panelCellKey,
  panelEdgeDescriptor,
  parsePanelCellKey
} from './PanelConstructionGrid.js';

export const SEMANTIC_UPPER_STOREY_MAX = 1;

const directionEntries = Object.values(PANEL_DIRECTIONS);
const xzKey = (x, z) => `${x}:${z}`;

const componentForSeed = (floorsByCell, seed) => {
  const seedKey = xzKey(seed.x, seed.z);
  if (!floorsByCell.has(seedKey)) return [];
  const pending = [floorsByCell.get(seedKey)];
  const visited = new Set([seedKey]);
  const component = [];

  for (let index = 0; index < pending.length; index += 1) {
    const floor = pending[index];
    component.push(floor);
    for (const direction of directionEntries) {
      const key = xzKey(floor.x + direction.dx, floor.z + direction.dz);
      if (visited.has(key) || !floorsByCell.has(key)) continue;
      visited.add(key);
      pending.push(floorsByCell.get(key));
    }
  }
  return component;
};

const connectedFloorComponents = floors => {
  const byCell = new Map(floors.map(floor => [xzKey(floor.x, floor.z), floor]));
  const consumed = new Set();
  const components = [];
  for (const floor of floors) {
    const key = xzKey(floor.x, floor.z);
    if (consumed.has(key)) continue;
    const component = componentForSeed(byCell, floor);
    component.forEach(item => consumed.add(xzKey(item.x, item.z)));
    if (component.length) components.push(component);
  }
  return components;
};

const componentCellKeys = component => new Set(component.map(floor => xzKey(floor.x, floor.z)));

export function semanticComponentPerimeterEdges(grid, component, storey = 0) {
  const cells = componentCellKeys(component);
  const edges = new Set();
  for (const floor of component) {
    for (const direction of directionEntries) {
      if (cells.has(xzKey(floor.x + direction.dx, floor.z + direction.dz))) continue;
      edges.add(panelEdgeDescriptor({
        x: floor.x,
        z: floor.z,
        storey,
        direction: direction.id
      }).key);
    }
  }
  return edges;
}

export function semanticLowerShellIsClosed(grid, component, storey = 0) {
  if (!grid || !component?.length) return false;
  for (const edgeKey of semanticComponentPerimeterEdges(grid, component, storey)) {
    if (!grid.walls.has(edgeKey)) return false;
  }
  return true;
}

const componentHasRoof = (grid, component, storey) => {
  const cellKeys = new Set(component.map(floor => panelCellKey({
    x: floor.x,
    z: floor.z,
    storey
  })));
  return [...grid.roofZones.values()].some(zone => (
    zone.storey === storey && zone.cellKeys.some(key => cellKeys.has(key))
  ));
};

const stairOpeningsForComponent = (grid, component, storey) => {
  const cells = componentCellKeys(component);
  return [...grid.stairs.values()]
    .filter(stair => (
      stair.storey === storey && cells.has(xzKey(stair.targetX, stair.targetZ))
    ))
    .map(stair => ({
      stairKey: stair.key,
      x: stair.targetX,
      z: stair.targetZ,
      storey: storey + 1,
      baseY: stair.topY
    }));
};

const adjacentToAny = (x, z, anchors) => directionEntries.some(direction => (
  anchors.has(xzKey(x + direction.dx, z + direction.dz))
));

/**
 * The first semantic upper-storey slice activates one additional level only.
 *
 * A lower floor component can carry the second storey when:
 * - its exposed perimeter is completely supported by semantic Wall/Door/Window records;
 * - the lower component has no Roof yet (the Roof must be removed before extending up);
 * - a semantic Stair reaches the upper level and reserves its target cell as the stairwell;
 * - new upper Floor cells grow from that stairwell or an already-built upper Floor cell.
 *
 * The full 2.9 x 2.9 Stair target remains an opening. It is never returned as a Floor
 * candidate, so the player cannot accidentally seal the top of the working flight.
 */
export function collectSemanticUpperStoreyFloorCandidates(grid, {
  maxStorey = SEMANTIC_UPPER_STOREY_MAX
} = {}) {
  if (!grid) return [];
  const candidates = [];

  for (let lowerStorey = 0; lowerStorey < maxStorey; lowerStorey += 1) {
    const lowerFloors = [...grid.floors.values()].filter(floor => floor.storey === lowerStorey);
    for (const component of connectedFloorComponents(lowerFloors)) {
      if (!semanticLowerShellIsClosed(grid, component, lowerStorey)) continue;
      if (componentHasRoof(grid, component, lowerStorey)) continue;

      const openings = stairOpeningsForComponent(grid, component, lowerStorey);
      if (!openings.length) continue;
      const openingCells = new Set(openings.map(opening => xzKey(opening.x, opening.z)));
      const upperStorey = lowerStorey + 1;
      const existingUpper = component.filter(floor => grid.floors.has(panelCellKey({
        x: floor.x,
        z: floor.z,
        storey: upperStorey
      })));
      const frontier = new Set([
        ...openings.map(opening => xzKey(opening.x, opening.z)),
        ...existingUpper.map(floor => xzKey(floor.x, floor.z))
      ]);

      for (const lowerFloor of component) {
        const key = panelCellKey({
          x: lowerFloor.x,
          z: lowerFloor.z,
          storey: upperStorey
        });
        if (grid.floors.has(key)) continue;
        if (openingCells.has(xzKey(lowerFloor.x, lowerFloor.z))) continue;
        if (!adjacentToAny(lowerFloor.x, lowerFloor.z, frontier)) continue;

        candidates.push({
          key,
          x: lowerFloor.x,
          z: lowerFloor.z,
          storey: upperStorey,
          baseY: lowerFloor.levelY + PANEL_GRID.storeyHeight,
          lowerFloorKey: lowerFloor.key,
          supportStorey: lowerStorey,
          stairOpeningKeys: openings.map(opening => opening.stairKey).sort(),
          snapKind: 'semantic-upper-floor'
        });
      }
    }
  }

  return candidates.sort((left, right) => (
    left.storey - right.storey || left.z - right.z || left.x - right.x
  ));
}

export function semanticUpperStoreyOpeningCells(grid, storey = 1) {
  if (!grid || !Number.isInteger(storey) || storey <= 0) return [];
  return [...grid.stairs.values()]
    .filter(stair => stair.storey === storey - 1)
    .map(stair => ({
      x: stair.targetX,
      z: stair.targetZ,
      storey,
      stairKey: stair.key,
      key: panelCellKey({ x: stair.targetX, z: stair.targetZ, storey })
    }))
    .sort((left, right) => left.z - right.z || left.x - right.x);
}

export function semanticUpperStoreyDependsOnStair(grid, stair) {
  if (!grid || !stair) return false;
  const upperStorey = stair.storey + 1;
  return [...grid.floors.values()].some(floor => floor.storey === upperStorey);
}

export function semanticUpperStoreyDependsOnWall(grid, edgeKey) {
  const wall = grid?.walls?.get(edgeKey);
  if (!wall) return false;
  const owner = parsePanelCellKey(wall.ownerCellKey);
  if (!owner) return false;
  const floors = [...grid.floors.values()].filter(floor => floor.storey === owner.storey);
  const byCell = new Map(floors.map(floor => [xzKey(floor.x, floor.z), floor]));
  const component = componentForSeed(byCell, owner);
  if (!component.length) return false;
  if (!semanticComponentPerimeterEdges(grid, component, owner.storey).has(edgeKey)) return false;
  const componentCells = componentCellKeys(component);
  return [...grid.floors.values()].some(floor => (
    floor.storey === owner.storey + 1 && componentCells.has(xzKey(floor.x, floor.z))
  ));
}
