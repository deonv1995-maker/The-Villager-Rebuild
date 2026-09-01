import * as THREE from 'three';

const RAIL_STATIONS = Object.freeze([
  Object.freeze({ z: -4.65, halfWidth: 1.72, deckY: 1.28 }),
  Object.freeze({ z: -3.25, halfWidth: 2.12, deckY: 1.20 }),
  Object.freeze({ z: -1.55, halfWidth: 2.38, deckY: 1.18 }),
  Object.freeze({ z: 0.25, halfWidth: 2.43, deckY: 1.18 }),
  Object.freeze({ z: 2.15, halfWidth: 2.36, deckY: 1.22 }),
  Object.freeze({ z: 3.75, halfWidth: 2.22, deckY: 1.30 }),
  Object.freeze({ z: 4.65, halfWidth: 1.98, deckY: 1.48 })
]);

const POST_HEIGHT = 0.62;
const POST_RADIUS = 0.045;
const RAIL_RADIUS = 0.052;
const NET_BOTTOM_LIFT = 0.12;
const NET_TOP_DROP = 0.10;

const createBeamBetween = ({ name, start, end, radius, material, radialSegments = 6 }) => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments),
    material
  );
  beam.name = name;
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
};

const stationPoint = (station, side, heightOffset = 0) => new THREE.Vector3(
  side * station.halfWidth,
  station.deckY + heightOffset,
  station.z
);

const createSideNet = ({ side, stations, material }) => {
  const positions = [];

  for (let index = 0; index < stations.length - 1; index += 1) {
    const a = stations[index];
    const b = stations[index + 1];
    const bottomA = stationPoint(a, side, NET_BOTTOM_LIFT);
    const bottomB = stationPoint(b, side, NET_BOTTOM_LIFT);
    const topA = stationPoint(a, side, POST_HEIGHT - NET_TOP_DROP);
    const topB = stationPoint(b, side, POST_HEIGHT - NET_TOP_DROP);

    positions.push(
      bottomA.x, bottomA.y, bottomA.z,
      bottomB.x, bottomB.y, bottomB.z,
      topA.x, topA.y, topA.z,
      topB.x, topB.y, topB.z,
      bottomA.x, bottomA.y, bottomA.z,
      topB.x, topB.y, topB.z,
      topA.x, topA.y, topA.z,
      bottomB.x, bottomB.y, bottomB.z
    );

    const midBottom = bottomA.clone().lerp(bottomB, 0.5);
    const midTop = topA.clone().lerp(topB, 0.5);
    positions.push(
      midBottom.x, midBottom.y, midBottom.z,
      midTop.x, midTop.y, midTop.z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const net = new THREE.LineSegments(geometry, material);
  net.name = `title-ship-rope-net-${side < 0 ? 'port' : 'starboard'}`;
  return net;
};

export function addTitleShipDeckDetails(ship) {
  const details = new THREE.Group();
  details.name = 'title-ship-side-rails-and-netting';

  const railWood = new THREE.MeshStandardMaterial({
    color: 0x4a2f20,
    roughness: 0.96,
    flatShading: true
  });
  const rope = new THREE.LineBasicMaterial({
    color: 0x9a7a55,
    transparent: true,
    opacity: 0.82
  });

  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'port' : 'starboard';

    for (let index = 0; index < RAIL_STATIONS.length; index += 1) {
      const station = RAIL_STATIONS[index];
      const post = createBeamBetween({
        name: `title-ship-rail-post-${sideName}-${index}`,
        start: stationPoint(station, side, 0.04),
        end: stationPoint(station, side, POST_HEIGHT),
        radius: POST_RADIUS,
        material: railWood
      });
      details.add(post);
    }

    for (let index = 0; index < RAIL_STATIONS.length - 1; index += 1) {
      const startStation = RAIL_STATIONS[index];
      const endStation = RAIL_STATIONS[index + 1];
      const topRail = createBeamBetween({
        name: `title-ship-top-rail-${sideName}-${index}`,
        start: stationPoint(startStation, side, POST_HEIGHT),
        end: stationPoint(endStation, side, POST_HEIGHT),
        radius: RAIL_RADIUS,
        material: railWood
      });
      details.add(topRail);
    }

    const netStations = RAIL_STATIONS.slice(1, -1);
    details.add(createSideNet({ side, stations: netStations, material: rope }));
  }

  ship.add(details);
  return details;
}
