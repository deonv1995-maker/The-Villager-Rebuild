import * as THREE from 'three';
import {
  CONSTRUCTION_DIMENSIONS,
  PHYSICAL_LOG
} from '../data/PhysicalLogDefinitions.js';
import { PANEL_GRID } from '../data/PanelConstructionDefinitions.js';

const THATCH_COURSE_COUNT = 5;
const THATCH_COURSE_OVERLAP = 0.1;
const THATCH_COURSE_DEPTH = 0.115;
const THATCH_EAVE_OVERHANG = 0.34;
const THATCH_GABLE_OVERHANG = 0.16;
const THATCH_UNDERLAY_COLOR = 0x8f7038;
const THATCH_COURSE_COLORS = [0xc99d4d, 0xd8b260, 0xc89a48, 0xe0bd69, 0xcfa653];
const THATCH_FRINGE_COLOR = 0xe0c071;
const THATCH_WOOD_COLOR = 0x50351f;
const THATCH_GABLE_COLOR = 0x6f472c;
const THATCH_ROPE_COLOR = 0x74502d;

const finishedMaterial = (color, { flatShading = true } = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.96,
  metalness: 0,
  side: THREE.DoubleSide,
  flatShading
});

const underlayMaterial = finishedMaterial(THATCH_UNDERLAY_COLOR);
const courseMaterials = THATCH_COURSE_COLORS.map(color => finishedMaterial(color));
const fringeMaterial = finishedMaterial(THATCH_FRINGE_COLOR);
const woodMaterial = finishedMaterial(THATCH_WOOD_COLOR);
const gableMaterial = finishedMaterial(THATCH_GABLE_COLOR);
const ropeMaterial = finishedMaterial(THATCH_ROPE_COLOR, { flatShading: false });

const clampRise = span => Math.min(
  PHYSICAL_LOG.roofMaxRise,
  Math.max(PHYSICAL_LOG.roofMinRise, span * 0.5 * Math.tan(PHYSICAL_LOG.roofPitch))
);

const shadowMesh = (geometry, material, name) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const slopeNormal = (side, pitch) => new THREE.Vector3(
  0,
  Math.cos(pitch),
  side * Math.sin(pitch)
);

const slopePoint = (side, amount, eaveY, rise, halfSpan) => new THREE.Vector3(
  0,
  eaveY + rise * amount,
  side * halfSpan * (1 - amount)
);

const slopeBox = ({
  length,
  gableOverhang,
  slopeLength,
  pitch,
  side,
  lower,
  upper,
  eaveY,
  rise,
  halfSpan,
  lift,
  depth,
  material,
  name
}) => {
  const boundedLower = Math.min(lower, upper);
  const boundedUpper = Math.max(lower, upper);
  const centerAmount = (boundedLower + boundedUpper) * 0.5;
  const segmentLength = Math.max(0.08, slopeLength * (boundedUpper - boundedLower));
  const center = slopePoint(side, centerAmount, eaveY, rise, halfSpan)
    .addScaledVector(slopeNormal(side, pitch), lift);
  const mesh = shadowMesh(
    new THREE.BoxGeometry(length + gableOverhang * 2, depth, segmentLength),
    material,
    name
  );
  mesh.position.copy(center);
  mesh.rotation.x = side * pitch;
  return mesh;
};

const fringeGeometry = ({
  length,
  gableOverhang,
  side,
  amount,
  eaveY,
  rise,
  halfSpan,
  pitch,
  lift,
  seed
}) => {
  const width = length + gableOverhang * 2;
  const tuftCount = Math.max(10, Math.round(width / 0.24));
  const xMin = -width * 0.5;
  const base = slopePoint(side, amount, eaveY, rise, halfSpan)
    .addScaledVector(slopeNormal(side, pitch), lift);
  const slopeLength = Math.hypot(halfSpan, rise);
  const downslope = new THREE.Vector3(
    0,
    -rise / slopeLength,
    side * halfSpan / slopeLength
  );
  const positions = [];

  for (let index = 0; index < tuftCount; index += 1) {
    const x0 = xMin + width * index / tuftCount;
    const x1 = xMin + width * (index + 1) / tuftCount;
    const xm = (x0 + x1) * 0.5;
    const variation = ((seed * 13 + index * 11) % 7) * 0.014;
    const tip = new THREE.Vector3(xm, base.y, base.z)
      .addScaledVector(downslope, 0.15 + variation)
      .addScaledVector(slopeNormal(side, pitch), 0.015 + (index % 3) * 0.006);
    positions.push(
      x0, base.y, base.z,
      x1, base.y, base.z,
      tip.x, tip.y, tip.z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const cylinderBetween = (start, end, radius, material, name, radialSegments = 8) => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 0.05) return null;
  const mesh = shadowMesh(
    new THREE.CylinderGeometry(radius * 0.92, radius, length, radialSegments, 1, false),
    material,
    name
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
};

const gableGeometry = (x, eaveY, ridgeY, halfSpan) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    x, eaveY, -halfSpan,
    x, eaveY, halfSpan,
    x, ridgeY, 0
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
};

const addGableClosure = (group, {
  x,
  endSign,
  eaveY,
  ridgeY,
  halfSpan,
  gableOverhang,
  label
}) => {
  const gable = shadowMesh(
    gableGeometry(x, eaveY, ridgeY, halfSpan),
    gableMaterial,
    `SemanticRoofGable${label}`
  );
  gable.userData.semanticRoofGable = true;
  group.add(gable);

  const rise = ridgeY - eaveY;
  for (const [index, amount] of [0.2, 0.45, 0.7].entries()) {
    const halfWidth = halfSpan * (1 - amount);
    const rowLength = Math.max(0.12, halfWidth * 2 - 0.06);
    const row = shadowMesh(
      new THREE.CylinderGeometry(0.09, 0.105, rowLength, 7, 1, false),
      woodMaterial,
      `SemanticRoofGable${label}Log${index + 1}`
    );
    row.rotation.x = Math.PI / 2;
    row.position.set(
      x + endSign * 0.055,
      eaveY + rise * amount,
      0
    );
    group.add(row);
  }

  const rakeX = x + endSign * gableOverhang * 0.48;
  const ridge = new THREE.Vector3(rakeX, ridgeY + 0.035, 0);
  for (const side of [-1, 1]) {
    const eave = new THREE.Vector3(rakeX, eaveY - 0.025, side * halfSpan);
    const trim = cylinderBetween(
      eave,
      ridge,
      0.09,
      woodMaterial,
      `SemanticRoofGable${label}Rake${side < 0 ? 'North' : 'South'}`,
      7
    );
    if (trim) group.add(trim);
  }
};

const addRidgeFinish = (group, {
  length,
  gableOverhang,
  ridgeY
}) => {
  const ridgeLength = length + gableOverhang * 2.25;
  const ridge = shadowMesh(
    new THREE.CylinderGeometry(0.22, 0.26, ridgeLength, 10, 1, false),
    courseMaterials[2],
    'SemanticRoofThatchRidge'
  );
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(0, ridgeY + 0.17, 0);
  group.add(ridge);

  for (const [index, amount] of [0.22, 0.5, 0.78].entries()) {
    const tie = shadowMesh(
      new THREE.TorusGeometry(0.265, 0.02, 6, 12),
      ropeMaterial,
      `SemanticRoofRidgeTie${index + 1}`
    );
    tie.rotation.y = Math.PI / 2;
    tie.position.set((amount - 0.5) * ridgeLength, ridgeY + 0.17, 0);
    group.add(tie);
  }
};

export function semanticRoofWallSeatDrop() {
  const visualWallTop = (
    CONSTRUCTION_DIMENSIONS.wallRowRadius +
    CONSTRUCTION_DIMENSIONS.wallSectionStep * 2 +
    CONSTRUCTION_DIMENSIONS.wallSectionTopOffset
  );
  return Math.max(
    0,
    PANEL_GRID.storeyHeight - visualWallTop + CONSTRUCTION_DIMENSIONS.wallTopTuck
  );
}

const buildAlongX = (group, length, span, requestedOverhang) => {
  const rise = clampRise(span);
  const halfSpan = span * 0.5;
  const slopeLength = Math.hypot(halfSpan, rise);
  const pitch = Math.atan2(rise, halfSpan);
  const wallSeatDrop = semanticRoofWallSeatDrop();
  const eaveY = -wallSeatDrop;
  const ridgeY = rise - wallSeatDrop;
  const eaveOverhang = Math.max(requestedOverhang, THATCH_EAVE_OVERHANG);
  const gableOverhang = Math.max(requestedOverhang * 0.48, THATCH_GABLE_OVERHANG);
  const eaveExtension = eaveOverhang / slopeLength;
  const overlapExtension = THATCH_COURSE_OVERLAP / slopeLength;

  for (const side of [-1, 1]) {
    const sideLabel = side < 0 ? 'North' : 'South';
    const underlay = slopeBox({
      length,
      gableOverhang,
      slopeLength,
      pitch,
      side,
      lower: -eaveExtension * 0.82,
      upper: 1.015,
      eaveY,
      rise,
      halfSpan,
      lift: -0.012,
      depth: 0.085,
      material: underlayMaterial,
      name: `SemanticRoofSlope${sideLabel}`
    });
    underlay.userData.semanticRoofUnderlay = true;
    group.add(underlay);

    for (let index = 0; index < THATCH_COURSE_COUNT; index += 1) {
      const lower = index === 0
        ? -eaveExtension
        : index / THATCH_COURSE_COUNT - overlapExtension;
      const upper = Math.min(
        1.035,
        (index + 1) / THATCH_COURSE_COUNT + overlapExtension * 0.36
      );
      const layerLift = 0.055 + index * 0.014;
      const course = slopeBox({
        length,
        gableOverhang,
        slopeLength,
        pitch,
        side,
        lower,
        upper,
        eaveY,
        rise,
        halfSpan,
        lift: layerLift,
        depth: THATCH_COURSE_DEPTH + (index === 0 ? 0.04 : 0),
        material: courseMaterials[index % courseMaterials.length],
        name: `SemanticRoofThatchCourse${sideLabel}${index + 1}`
      });
      course.userData.semanticRoofThatch = true;
      group.add(course);

      const fringeAmount = index === 0 ? -eaveExtension * 0.72 : Math.max(0, index / THATCH_COURSE_COUNT - 0.018);
      const fringe = shadowMesh(
        fringeGeometry({
          length,
          gableOverhang,
          side,
          amount: fringeAmount,
          eaveY,
          rise,
          halfSpan,
          pitch,
          lift: layerLift + THATCH_COURSE_DEPTH * 0.52,
          seed: index + (side < 0 ? 0 : 17)
        }),
        fringeMaterial,
        `SemanticRoofThatchFringe${sideLabel}${index + 1}`
      );
      fringe.userData.semanticRoofThatchFringe = true;
      group.add(fringe);
    }

    const downslope = new THREE.Vector3(
      0,
      -rise / slopeLength,
      side * halfSpan / slopeLength
    );
    const fasciaPosition = new THREE.Vector3(0, eaveY, side * halfSpan)
      .addScaledVector(downslope, eaveOverhang * 0.88);
    const fascia = shadowMesh(
      new THREE.BoxGeometry(length + gableOverhang * 2.35, 0.18, 0.19),
      woodMaterial,
      `SemanticRoofEaveFascia${sideLabel}`
    );
    fascia.position.copy(fasciaPosition).add(new THREE.Vector3(0, -0.045, 0));
    group.add(fascia);
  }

  addGableClosure(group, {
    x: -length * 0.5,
    endSign: -1,
    eaveY,
    ridgeY,
    halfSpan,
    gableOverhang,
    label: 'A'
  });
  addGableClosure(group, {
    x: length * 0.5,
    endSign: 1,
    eaveY,
    ridgeY,
    halfSpan,
    gableOverhang,
    label: 'B'
  });
  addRidgeFinish(group, { length, gableOverhang, ridgeY });

  return rise;
};

export function semanticRoofRise({ width, depth, ridgeAxis = 'x' }) {
  const span = ridgeAxis === 'z' ? width : depth;
  return clampRise(span);
}

export function createSemanticRoofZoneVisual(name = 'SemanticRoof', {
  width,
  depth,
  ridgeAxis = 'x',
  overhang = PHYSICAL_LOG.radius * 1.2
} = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    throw new Error('Semantic roof geometry requires positive width and depth');
  }

  const root = new THREE.Group();
  root.name = name;
  root.userData.semanticRoof = true;
  root.userData.ridgeAxis = ridgeAxis;
  root.userData.thatchFinished = true;
  root.userData.closedGables = true;
  root.userData.wallSeatDrop = semanticRoofWallSeatDrop();

  if (ridgeAxis === 'z') {
    const rotated = new THREE.Group();
    rotated.name = 'SemanticRoofRotatedZAxis';
    rotated.rotation.y = Math.PI / 2;
    root.add(rotated);
    buildAlongX(rotated, depth, width, overhang);
  } else {
    buildAlongX(root, width, depth, overhang);
  }

  return root;
}
