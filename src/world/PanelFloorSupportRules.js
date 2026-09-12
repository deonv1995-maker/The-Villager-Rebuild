import { PANEL_GRID } from '../data/PanelConstructionDefinitions.js';
import { collectPanelUpperStoreySupports } from './PanelUpperStoreyRules.js';

const CARDINAL_OFFSETS = Object.freeze([
  Object.freeze({ dx: -1, dz: 0 }),
  Object.freeze({ dx: 1, dz: 0 }),
  Object.freeze({ dx: 0, dz: -1 }),
  Object.freeze({ dx: 0, dz: 1 })
]);

const coordinateKey = ({ x, z, storey }) => `${storey}:${x}:${z}`;

const validUpperFloor = floor => (
  Number.isInteger(floor?.x) &&
  Number.isInteger(floor?.z) &&
  Number.isInteger(floor?.storey) &&
  floor.storey > 0 &&
  Number.isFinite(floor?.levelY)
);

/**
 * Upper Floor panels form a support graph on each semantic storey. Closed wall-family
 * enclosures remain the structural roots, while same-level cardinally adjacent Floor
 * panels may extend away from those roots as an overhang/balcony.
 *
 * This keeps the wall enclosure as the source of vertical support without forcing every
 * cantilevered cell to have a Wall directly below it. A Floor is considered supported
 * only when it can reach at least one wall-supported root through an unbroken chain of
 * same-storey, same-level Floor panels.
 */
export function collectPanelSupportedUpperFloors(walls, floors, {
  levelTolerance = PANEL_GRID.snapTolerance + 0.001
} = {}) {
  const tolerance = Math.max(0.000001, levelTolerance);
  const upperFloors = (floors ?? [])
    .filter(validUpperFloor)
    .sort((left, right) => (
      left.storey - right.storey ||
      left.x - right.x ||
      left.z - right.z ||
      String(left.key ?? '').localeCompare(String(right.key ?? ''))
    ));
  if (!upperFloors.length) return [];

  const floorByCoordinate = new Map(
    upperFloors.map(floor => [coordinateKey(floor), floor])
  );
  const supported = new Map();
  const pending = [];

  for (const support of collectPanelUpperStoreySupports(walls, {
    levelTolerance: tolerance
  })) {
    const floor = floorByCoordinate.get(coordinateKey(support));
    if (!floor || Math.abs(floor.levelY - support.levelY) > tolerance) continue;
    if (supported.has(floor.key)) continue;
    supported.set(floor.key, floor);
    pending.push(floor);
  }

  for (let index = 0; index < pending.length; index += 1) {
    const floor = pending[index];
    for (const offset of CARDINAL_OFFSETS) {
      const neighbour = floorByCoordinate.get(coordinateKey({
        x: floor.x + offset.dx,
        z: floor.z + offset.dz,
        storey: floor.storey
      }));
      if (!neighbour || supported.has(neighbour.key)) continue;
      if (Math.abs(neighbour.levelY - floor.levelY) > tolerance) continue;
      supported.set(neighbour.key, neighbour);
      pending.push(neighbour);
    }
  }

  return upperFloors.filter(floor => supported.has(floor.key));
}

/**
 * Exposes empty same-level cardinal neighbours of the currently supported upper-floor
 * graph. These are the legal Floor snap targets for balconies and cantilevered upper
 * storeys. Repeated placement may extend the graph because every newly built panel must
 * remain connected back to a wall-supported root.
 */
export function collectPanelUpperFloorExpansionSupports(walls, floors, {
  levelTolerance = PANEL_GRID.snapTolerance + 0.001
} = {}) {
  const tolerance = Math.max(0.000001, levelTolerance);
  const allFloors = (floors ?? []).filter(floor => (
    Number.isInteger(floor?.x) &&
    Number.isInteger(floor?.z) &&
    Number.isInteger(floor?.storey) &&
    Number.isFinite(floor?.levelY)
  ));
  const occupied = new Set(allFloors.map(coordinateKey));
  const supported = collectPanelSupportedUpperFloors(walls, allFloors, {
    levelTolerance: tolerance
  });
  const candidates = new Map();
  const ambiguous = new Set();

  for (const floor of supported) {
    for (const offset of CARDINAL_OFFSETS) {
      const candidate = {
        x: floor.x + offset.dx,
        z: floor.z + offset.dz,
        storey: floor.storey,
        levelY: floor.levelY,
        supportingFloorKey: floor.key,
        snapKind: 'floor-supported-overhang'
      };
      const key = coordinateKey(candidate);
      if (occupied.has(key) || ambiguous.has(key)) continue;

      const existing = candidates.get(key);
      if (!existing) {
        candidates.set(key, candidate);
        continue;
      }
      if (Math.abs(existing.levelY - candidate.levelY) > tolerance) {
        candidates.delete(key);
        ambiguous.add(key);
      }
    }
  }

  return [...candidates.values()].sort((left, right) => (
    left.storey - right.storey ||
    left.x - right.x ||
    left.z - right.z
  ));
}

export function panelUpperFloorsRemainSupported(walls, floors, options = {}) {
  const upperFloors = (floors ?? []).filter(validUpperFloor);
  if (!upperFloors.length) return true;
  return collectPanelSupportedUpperFloors(walls, floors, options).length === upperFloors.length;
}
