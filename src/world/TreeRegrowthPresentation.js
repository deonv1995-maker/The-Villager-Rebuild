import * as THREE from 'three';

const SPROUT_BARK_COLOR = 0x6f472a;
const SPROUT_LEAF_COLOR = 0x4f8c49;
const SPROUT_LEAF_TIP_COLOR = 0x6ba957;
const FINAL_TREE_START_SCALE = 0.18;
const SCAFFOLD_TAKEOVER_END = 0.44;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Normalized lateral offsets sampled from the base to the shoot tip.  The
// points are intentionally irregular so the juvenile shoot reads as living
// growth rather than a straight construction pole.  Selection and mirroring
// are deterministic so save/Continue never needs extra random state.
const STEM_CURVE_PROFILES = Object.freeze([
  Object.freeze([
    Object.freeze([0, 0]),
    Object.freeze([0.12, -0.04]),
    Object.freeze([0.03, 0.08]),
    Object.freeze([-0.11, 0.12]),
    Object.freeze([-0.04, -0.05]),
    Object.freeze([0.07, 0.02])
  ]),
  Object.freeze([
    Object.freeze([0, 0]),
    Object.freeze([-0.08, 0.07]),
    Object.freeze([0.07, 0.12]),
    Object.freeze([0.14, -0.03]),
    Object.freeze([-0.03, -0.11]),
    Object.freeze([-0.09, 0.03])
  ]),
  Object.freeze([
    Object.freeze([0, 0]),
    Object.freeze([0.06, 0.1]),
    Object.freeze([0.13, -0.02]),
    Object.freeze([-0.02, -0.13]),
    Object.freeze([-0.12, -0.02]),
    Object.freeze([0.04, 0.08])
  ])
]);

const BRANCH_PROFILES = Object.freeze([
  Object.freeze([
    Object.freeze({ start: 0, height: 0.39, direction: [0.9, 0.36, 0.2], bend: [-0.08, 0.18, 0.16], length: 0.54, radius: 0.43 }),
    Object.freeze({ start: 0.2, height: 0.52, direction: [-0.7, 0.45, 0.56], bend: [-0.12, 0.16, -0.08], length: 0.61, radius: 0.4 }),
    Object.freeze({ start: 0.42, height: 0.66, direction: [0.18, 0.4, -0.9], bend: [0.16, 0.2, -0.02], length: 0.55, radius: 0.36 }),
    Object.freeze({ start: 0.64, height: 0.79, direction: [-0.8, 0.53, -0.2], bend: [0.06, 0.17, -0.16], length: 0.45, radius: 0.31 })
  ]),
  Object.freeze([
    Object.freeze({ start: 0, height: 0.44, direction: [0.7, 0.44, 0.56], bend: [0.14, 0.16, -0.08], length: 0.5, radius: 0.41 }),
    Object.freeze({ start: 0.23, height: 0.56, direction: [-0.86, 0.38, 0.28], bend: [-0.02, 0.21, 0.14], length: 0.58, radius: 0.39 }),
    Object.freeze({ start: 0.46, height: 0.7, direction: [0.28, 0.5, -0.78], bend: [-0.15, 0.16, -0.02], length: 0.5, radius: 0.34 }),
    Object.freeze({ start: 0.67, height: 0.82, direction: [-0.58, 0.6, -0.46], bend: [0.12, 0.19, 0.08], length: 0.41, radius: 0.3 })
  ]),
  Object.freeze([
    Object.freeze({ start: 0, height: 0.41, direction: [0.82, 0.4, -0.38], bend: [0.02, 0.2, -0.16], length: 0.56, radius: 0.42 }),
    Object.freeze({ start: 0.19, height: 0.55, direction: [-0.52, 0.46, 0.72], bend: [-0.16, 0.18, -0.02], length: 0.59, radius: 0.39 }),
    Object.freeze({ start: 0.43, height: 0.68, direction: [-0.24, 0.47, -0.82], bend: [0.15, 0.2, 0.03], length: 0.52, radius: 0.35 }),
    Object.freeze({ start: 0.66, height: 0.8, direction: [0.68, 0.57, 0.3], bend: [-0.08, 0.18, 0.15], length: 0.43, radius: 0.3 })
  ])
]);

const LEAF_SHAPES = Object.freeze([
  Object.freeze({ position: [-0.11, 0.02, 0], rotation: [0.2, -0.55, 0.45], scale: [1.08, 0.52, 0.72] }),
  Object.freeze({ position: [0.1, 0.035, 0.025], rotation: [-0.18, 0.62, -0.4], scale: [1, 0.5, 0.68] }),
  Object.freeze({ position: [0.015, 0.11, -0.035], rotation: [0.48, 0.12, 0.1], scale: [0.88, 0.48, 0.82] })
]);

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const smooth01 = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export class TreeRegrowthPresentation {
  constructor({ group, terrain, treeRenderRegistry = null, timing }) {
    this.group = group;
    this.terrain = terrain;
    this.treeRenderRegistry = treeRenderRegistry;
    this.timing = timing;

    this.stemGeometry = new THREE.CylinderGeometry(1, 0.82, 1, 7);
    this.branchGeometry = new THREE.CylinderGeometry(1, 0.76, 1, 6);
    this.leafGeometry = new THREE.IcosahedronGeometry(0.17, 0);
    this.stemMaterial = new THREE.MeshStandardMaterial({
      color: SPROUT_BARK_COLOR,
      roughness: 1,
      flatShading: true
    });
    this.leafMaterial = new THREE.MeshStandardMaterial({
      color: SPROUT_LEAF_COLOR,
      roughness: 1,
      flatShading: true
    });
    this.leafTipMaterial = new THREE.MeshStandardMaterial({
      color: SPROUT_LEAF_TIP_COLOR,
      roughness: 1,
      flatShading: true
    });

    this.anchorIn = new THREE.Matrix4();
    this.anchorOut = new THREE.Matrix4();
    this.scaleMatrix = new THREE.Matrix4();
    this.growthMatrix = new THREE.Matrix4();
    this.hiddenMatrix = new THREE.Matrix4();
    this.hiddenPosition = new THREE.Vector3();
    this.identityQuaternion = new THREE.Quaternion();
    this.hiddenScale = new THREE.Vector3(0.0001, 0.0001, 0.0001);
    this.segmentStart = new THREE.Vector3();
    this.segmentEnd = new THREE.Vector3();
    this.segmentCurrentEnd = new THREE.Vector3();
    this.segmentDirection = new THREE.Vector3();
    this.segmentMidpoint = new THREE.Vector3();
    this.shootTip = new THREE.Vector3();
    this.branchStart = new THREE.Vector3();
    this.branchMid = new THREE.Vector3();
    this.branchEnd = new THREE.Vector3();
    this.branchCurrentMid = new THREE.Vector3();
    this.branchCurrentEnd = new THREE.Vector3();
    this.branchDirection = new THREE.Vector3();
    this.branchBend = new THREE.Vector3();
    this.sourcePosition = new THREE.Vector3();
    this.sourceQuaternion = new THREE.Quaternion();
    this.sourceScale = new THREE.Vector3();
  }

  begin(tree) {
    if (!tree.regrowthVisual) tree.regrowthVisual = this.#createYoungTree(tree);
    this.hideTree(tree);
    this.update(tree, 0);
  }

  update(tree, ageSeconds) {
    if (!tree.regrowthVisual) tree.regrowthVisual = this.#createYoungTree(tree);

    const timing = this.timing;
    const leafAt = timing.stumpOnlySeconds;
    const leafEnd = leafAt + timing.firstLeafSeconds;
    const stemEnd = leafEnd + timing.stemGrowthSeconds;
    const branchSiteLeafEnd = stemEnd + timing.branchSiteLeafSeconds;
    const branchEnd = branchSiteLeafEnd + timing.branchGrowthSeconds;
    const finalEnd = branchEnd + timing.authoredTreeGrowthSeconds;
    const age = THREE.MathUtils.clamp(ageSeconds, 0, finalEnd);

    if (age < leafAt) {
      tree.regrowthVisual.root.visible = false;
      this.hideTree(tree);
      return;
    }

    if (age < leafEnd) {
      const progress = (age - leafAt) / Math.max(0.001, timing.firstLeafSeconds);
      this.#setYoungTree(tree, progress, 0, 0, 0);
      this.hideTree(tree);
      return;
    }

    if (age < stemEnd) {
      const progress = (age - leafEnd) / Math.max(0.001, timing.stemGrowthSeconds);
      this.#setYoungTree(tree, 1, progress, 0, 0);
      this.hideTree(tree);
      return;
    }

    if (age < branchSiteLeafEnd) {
      const progress = (age - stemEnd) / Math.max(0.001, timing.branchSiteLeafSeconds);
      this.#setYoungTree(tree, 1, 1, progress, 0);
      this.hideTree(tree);
      return;
    }

    if (age < branchEnd) {
      const progress = (age - branchSiteLeafEnd) / Math.max(0.001, timing.branchGrowthSeconds);
      this.#setYoungTree(tree, 1, 1, 1, progress);
      this.hideTree(tree);
      return;
    }

    const finalProgress = smooth01(
      (age - branchEnd) / Math.max(0.001, timing.authoredTreeGrowthSeconds)
    );
    this.#setYoungTree(tree, 1, 1, 1, 1);
    tree.regrowthVisual.root.visible = finalProgress < SCAFFOLD_TAKEOVER_END;
    if (tree.regrowthVisual.root.visible) {
      const settleProgress = clamp01(finalProgress / SCAFFOLD_TAKEOVER_END);
      const settleScale = THREE.MathUtils.lerp(1.08, 0.88, settleProgress);
      tree.regrowthVisual.root.scale.setScalar(settleScale);
    }
    this.#applyTreeGrowth(tree, finalProgress);
  }

  hideTree(tree) {
    const x = tree.collisionTemplate?.x ?? tree.obstacle?.x ?? 0;
    const z = tree.collisionTemplate?.z ?? tree.obstacle?.z ?? 0;
    this.hiddenPosition.set(x, -1000, z);
    this.hiddenMatrix.compose(this.hiddenPosition, this.identityQuaternion, this.hiddenScale);
    for (const entry of tree.renderState) {
      entry.mesh.setMatrixAt(entry.index, this.hiddenMatrix);
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  restoreFullTree(tree) {
    for (const entry of tree.renderState) {
      entry.mesh.setMatrixAt(entry.index, entry.matrix);
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  complete(tree) {
    this.restoreFullTree(tree);
    this.removeSprout(tree);
  }

  removeSprout(tree) {
    if (!tree.regrowthVisual) return;
    tree.regrowthVisual.root.parent?.remove(tree.regrowthVisual.root);
    tree.regrowthVisual = null;
  }

  #createYoungTree(tree) {
    const x = tree.collisionTemplate?.x ?? tree.obstacle?.x ?? 0;
    const z = tree.collisionTemplate?.z ?? tree.obstacle?.z ?? 0;
    const stumpTopY = this.terrain.heightAt(x, z) + 0.34;

    const root = new THREE.Group();
    root.name = `tree-regrowth-sprout-${tree.treeId}`;
    root.position.set(x, stumpTopY, z);
    const sourceEntry = tree.renderState?.[0];
    if (sourceEntry?.matrix) {
      sourceEntry.matrix.decompose(this.sourcePosition, this.sourceQuaternion, this.sourceScale);
      root.quaternion.copy(this.sourceQuaternion);
    }
    root.visible = false;

    const stemProfile = STEM_CURVE_PROFILES[tree.treeId % STEM_CURVE_PROFILES.length];
    const branchProfile = BRANCH_PROFILES[(tree.treeId + tree.variantIndex) % BRANCH_PROFILES.length];
    const mirror = tree.treeId % 2 === 0 ? 1 : -1;

    const stemRoot = new THREE.Group();
    stemRoot.name = `tree-regrowth-stems-${tree.treeId}`;
    root.add(stemRoot);
    const stemSegments = [];
    for (let index = 0; index < stemProfile.length - 1; index += 1) {
      const segment = new THREE.Mesh(this.stemGeometry, this.stemMaterial);
      segment.name = `tree-regrowth-stem-${tree.treeId}-${index}`;
      segment.castShadow = true;
      segment.receiveShadow = true;
      segment.visible = false;
      stemRoot.add(segment);
      stemSegments.push(segment);
    }

    const firstLeaves = this.#createLeafCluster(`tree-regrowth-first-leaves-${tree.treeId}`, true);
    firstLeaves.visible = false;
    root.add(firstLeaves);

    const branchRoot = new THREE.Group();
    branchRoot.name = `tree-regrowth-branches-${tree.treeId}`;
    root.add(branchRoot);

    const nodeLeafRoot = new THREE.Group();
    nodeLeafRoot.name = `tree-regrowth-node-leaves-${tree.treeId}`;
    root.add(nodeLeafRoot);

    const branches = branchProfile.map((profile, index) => {
      const branch = new THREE.Group();
      branch.name = `tree-regrowth-branch-${tree.treeId}-${index}`;
      branch.visible = false;
      branchRoot.add(branch);

      const segments = [0, 1].map(segmentIndex => {
        const mesh = new THREE.Mesh(this.branchGeometry, this.stemMaterial);
        mesh.name = `tree-regrowth-branch-segment-${tree.treeId}-${index}-${segmentIndex}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false;
        branch.add(mesh);
        return mesh;
      });

      const leaves = this.#createLeafCluster(`tree-regrowth-node-leaf-cluster-${tree.treeId}-${index}`, false);
      leaves.visible = false;
      nodeLeafRoot.add(leaves);
      return { branch, segments, leaves, profile };
    });

    if (this.treeRenderRegistry?.addObjectAt) {
      this.treeRenderRegistry.addObjectAt(root, x, z);
    } else {
      this.group.add(root);
    }

    return {
      root,
      stemRoot,
      stemSegments,
      stemProfile,
      mirror,
      firstLeaves,
      branchRoot,
      nodeLeafRoot,
      branches
    };
  }

  #createLeafCluster(name, terminal) {
    const cluster = new THREE.Group();
    cluster.name = name;
    for (let index = 0; index < LEAF_SHAPES.length; index += 1) {
      const descriptor = LEAF_SHAPES[index];
      const leaf = new THREE.Mesh(
        this.leafGeometry,
        terminal && index === LEAF_SHAPES.length - 1 ? this.leafTipMaterial : this.leafMaterial
      );
      leaf.name = `${name}-leaf-${index}`;
      leaf.position.set(...descriptor.position);
      leaf.rotation.set(...descriptor.rotation);
      leaf.scale.set(...descriptor.scale);
      leaf.castShadow = true;
      cluster.add(leaf);
    }
    return cluster;
  }

  #setYoungTree(tree, firstLeafProgress, stemProgress, branchSiteLeafProgress, branchProgress) {
    const visual = tree.regrowthVisual;
    if (!visual) return;

    visual.root.visible = true;
    visual.root.scale.setScalar(1);

    const firstLeafT = smooth01(firstLeafProgress);
    const stemT = smooth01(stemProgress);
    const branchSiteLeafT = smooth01(branchSiteLeafProgress);
    const branchT = smooth01(branchProgress);
    const sourceRadius = Math.max(0.34, tree.collisionTemplate?.radius ?? 0.5);
    const finalStemHeight = (0.92 + sourceRadius * 0.72) * THREE.MathUtils.lerp(1, 1.08, branchT);
    const baseStemRadius = Math.max(0.075, sourceRadius * 0.17) * THREE.MathUtils.lerp(1, 1.23, branchT);
    const lateralScale = sourceRadius * THREE.MathUtils.lerp(0.92, 1.08, branchT);

    this.shootTip.set(0, 0.065, 0);
    const segmentCount = visual.stemSegments.length;
    for (let index = 0; index < segmentCount; index += 1) {
      const segment = visual.stemSegments[index];
      const localProgress = smooth01(stemT * segmentCount - index);
      if (localProgress <= 0.001) {
        segment.visible = false;
        continue;
      }

      this.#stemPointAtIndex(visual, index, finalStemHeight, lateralScale, this.segmentStart);
      this.#stemPointAtIndex(visual, index + 1, finalStemHeight, lateralScale, this.segmentEnd);
      this.segmentCurrentEnd.copy(this.segmentStart).lerp(this.segmentEnd, localProgress);
      const taper = THREE.MathUtils.lerp(1, 0.52, index / Math.max(1, segmentCount));
      const radius = baseStemRadius * taper * THREE.MathUtils.lerp(0.58, 1, localProgress);
      this.#setCylinderBetween(segment, this.segmentStart, this.segmentCurrentEnd, radius);
      segment.visible = true;
      this.shootTip.copy(this.segmentCurrentEnd);
    }

    visual.firstLeaves.visible = firstLeafT > 0.001;
    if (visual.firstLeaves.visible) {
      visual.firstLeaves.position.copy(this.shootTip);
      const leafScale = (0.72 + sourceRadius * 0.34)
        * firstLeafT
        * THREE.MathUtils.lerp(1, 1.12, branchT);
      visual.firstLeaves.scale.setScalar(leafScale);
      visual.firstLeaves.rotation.y = (tree.treeId * 0.73) % (Math.PI * 2);
    }

    for (const branch of visual.branches) {
      const { profile, segments, leaves } = branch;
      this.#stemPointAtHeight(visual, profile.height, finalStemHeight, lateralScale, this.branchStart);

      const leafLocal = smooth01(
        (branchSiteLeafT - profile.start) / Math.max(0.001, 1 - profile.start)
      );
      leaves.visible = leafLocal > 0.001;
      if (leaves.visible) {
        leaves.position.copy(this.branchStart);
        const leafScale = (0.58 + sourceRadius * 0.3) * leafLocal;
        leaves.scale.setScalar(leafScale);
        leaves.rotation.y = profile.height * Math.PI * 1.7 + tree.treeId * 0.19;
      }

      const branchLocal = smooth01(
        (branchT - profile.start) / Math.max(0.001, 1 - profile.start)
      );
      if (branchLocal <= 0.001) {
        branch.branch.visible = false;
        for (const segment of segments) segment.visible = false;
        continue;
      }

      branch.branch.visible = true;
      this.branchDirection.set(
        profile.direction[0] * visual.mirror,
        profile.direction[1],
        profile.direction[2]
      ).normalize();
      this.branchBend.set(
        profile.bend[0] * visual.mirror,
        profile.bend[1],
        profile.bend[2]
      );
      const branchLength = finalStemHeight * profile.length;
      this.branchMid.copy(this.branchStart)
        .addScaledVector(this.branchDirection, branchLength * 0.54)
        .addScaledVector(this.branchBend, branchLength * 0.24);
      this.branchEnd.copy(this.branchStart)
        .addScaledVector(this.branchDirection, branchLength)
        .addScaledVector(this.branchBend, branchLength * 0.38);

      const firstSegmentT = smooth01(branchLocal * 2);
      const secondSegmentT = smooth01(branchLocal * 2 - 1);
      this.branchCurrentMid.copy(this.branchStart).lerp(this.branchMid, firstSegmentT);
      const baseRadius = Math.max(0.018, baseStemRadius * profile.radius);
      this.#setCylinderBetween(
        segments[0],
        this.branchStart,
        this.branchCurrentMid,
        baseRadius * THREE.MathUtils.lerp(0.62, 1, firstSegmentT)
      );
      segments[0].visible = firstSegmentT > 0.001;

      if (secondSegmentT > 0.001) {
        this.branchCurrentEnd.copy(this.branchMid).lerp(this.branchEnd, secondSegmentT);
        this.#setCylinderBetween(
          segments[1],
          this.branchMid,
          this.branchCurrentEnd,
          baseRadius * 0.72 * THREE.MathUtils.lerp(0.64, 1, secondSegmentT)
        );
        segments[1].visible = true;
      } else {
        this.branchCurrentEnd.copy(this.branchCurrentMid);
        segments[1].visible = false;
      }

      if (leaves.visible) {
        leaves.position.copy(this.branchCurrentEnd);
        const carriedLeafScale = (0.58 + sourceRadius * 0.3)
          * THREE.MathUtils.lerp(1, 1.12, branchLocal);
        leaves.scale.setScalar(carriedLeafScale);
      }
    }
  }

  #stemPointAtIndex(visual, index, height, lateralScale, target) {
    const profile = visual.stemProfile;
    const clampedIndex = THREE.MathUtils.clamp(index, 0, profile.length - 1);
    const offset = profile[clampedIndex];
    const t = clampedIndex / Math.max(1, profile.length - 1);
    target.set(
      offset[0] * lateralScale * visual.mirror,
      height * t,
      offset[1] * lateralScale
    );
    return target;
  }

  #stemPointAtHeight(visual, normalizedHeight, height, lateralScale, target) {
    const profile = visual.stemProfile;
    const scaled = clamp01(normalizedHeight) * (profile.length - 1);
    const lowerIndex = Math.floor(scaled);
    const upperIndex = Math.min(profile.length - 1, lowerIndex + 1);
    const localT = scaled - lowerIndex;
    const lower = profile[lowerIndex];
    const upper = profile[upperIndex];
    target.set(
      THREE.MathUtils.lerp(lower[0], upper[0], localT) * lateralScale * visual.mirror,
      height * clamp01(normalizedHeight),
      THREE.MathUtils.lerp(lower[1], upper[1], localT) * lateralScale
    );
    return target;
  }

  #setCylinderBetween(mesh, start, end, radius) {
    this.segmentDirection.copy(end).sub(start);
    const length = Math.max(0.001, this.segmentDirection.length());
    this.segmentDirection.multiplyScalar(1 / length);
    this.segmentMidpoint.copy(start).add(end).multiplyScalar(0.5);
    mesh.position.copy(this.segmentMidpoint);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, this.segmentDirection);
    mesh.scale.set(radius, length, radius);
  }

  #applyTreeGrowth(tree, progress) {
    const scale = THREE.MathUtils.lerp(FINAL_TREE_START_SCALE, 1, clamp01(progress));
    const x = tree.collisionTemplate.x;
    const z = tree.collisionTemplate.z;
    const y = this.terrain.heightAt(x, z);

    this.anchorIn.makeTranslation(x, y, z);
    this.anchorOut.makeTranslation(-x, -y, -z);
    this.scaleMatrix.makeScale(scale, scale, scale);

    for (const entry of tree.renderState) {
      this.growthMatrix
        .copy(this.anchorIn)
        .multiply(this.scaleMatrix)
        .multiply(this.anchorOut)
        .multiply(entry.matrix);
      entry.mesh.setMatrixAt(entry.index, this.growthMatrix);
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
