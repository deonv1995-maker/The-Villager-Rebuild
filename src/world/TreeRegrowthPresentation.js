import * as THREE from 'three';

const SPROUT_BARK_COLOR = 0x6f472a;
const SPROUT_BUD_COLOR = 0x4f8c49;
const SPROUT_BUD_TIP_COLOR = 0x6ba957;
const FINAL_TREE_START_SCALE = 0.18;
const BRANCH_TAKEOVER_END = 0.44;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const BRANCH_PROFILES = Object.freeze([
  Object.freeze([
    Object.freeze({ start: 0, height: 0.42, direction: [0.9, 0.34, 0.22], length: 0.55, radius: 0.42 }),
    Object.freeze({ start: 0.18, height: 0.54, direction: [-0.72, 0.42, 0.58], length: 0.64, radius: 0.4 }),
    Object.freeze({ start: 0.36, height: 0.65, direction: [0.2, 0.38, -0.92], length: 0.57, radius: 0.36 }),
    Object.freeze({ start: 0.56, height: 0.76, direction: [-0.82, 0.5, -0.24], length: 0.47, radius: 0.32 })
  ]),
  Object.freeze([
    Object.freeze({ start: 0, height: 0.5, direction: [0.72, 0.5, 0.48], length: 0.45, radius: 0.38 }),
    Object.freeze({ start: 0.2, height: 0.62, direction: [-0.66, 0.58, 0.48], length: 0.48, radius: 0.36 }),
    Object.freeze({ start: 0.4, height: 0.73, direction: [0.26, 0.54, -0.8], length: 0.42, radius: 0.33 }),
    Object.freeze({ start: 0.6, height: 0.82, direction: [-0.78, 0.6, -0.18], length: 0.34, radius: 0.3 })
  ])
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

    this.stemGeometry = new THREE.CylinderGeometry(1, 1, 1, 7);
    this.branchGeometry = new THREE.CylinderGeometry(1, 0.82, 1, 6);
    this.budGeometry = new THREE.IcosahedronGeometry(0.17, 0);
    this.stemMaterial = new THREE.MeshStandardMaterial({
      color: SPROUT_BARK_COLOR,
      roughness: 1,
      flatShading: true
    });
    this.budMaterial = new THREE.MeshStandardMaterial({
      color: SPROUT_BUD_COLOR,
      roughness: 1,
      flatShading: true
    });
    this.budTipMaterial = new THREE.MeshStandardMaterial({
      color: SPROUT_BUD_TIP_COLOR,
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
    this.branchStart = new THREE.Vector3();
    this.branchEnd = new THREE.Vector3();
    this.branchDirection = new THREE.Vector3();
    this.branchMidpoint = new THREE.Vector3();
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
    const stemAt = timing.stumpOnlySeconds;
    const stemEnd = stemAt + timing.stemGrowthSeconds;
    const branchEnd = stemEnd + timing.branchGrowthSeconds;
    const expansionEnd = branchEnd + timing.branchExpansionSeconds;
    const finalEnd = expansionEnd + timing.authoredTreeGrowthSeconds;
    const age = THREE.MathUtils.clamp(ageSeconds, 0, finalEnd);

    if (age < stemAt) {
      tree.regrowthVisual.root.visible = false;
      this.hideTree(tree);
      return;
    }

    if (age < stemEnd) {
      const progress = (age - stemAt) / Math.max(0.001, timing.stemGrowthSeconds);
      this.#setYoungTree(tree, progress, 0, 0);
      this.hideTree(tree);
      return;
    }

    if (age < branchEnd) {
      const progress = (age - stemEnd) / Math.max(0.001, timing.branchGrowthSeconds);
      this.#setYoungTree(tree, 1, progress, 0);
      this.hideTree(tree);
      return;
    }

    if (age < expansionEnd) {
      const progress = (age - branchEnd) / Math.max(0.001, timing.branchExpansionSeconds);
      this.#setYoungTree(tree, 1, 1, progress);
      this.hideTree(tree);
      return;
    }

    const finalProgress = smooth01(
      (age - expansionEnd) / Math.max(0.001, timing.authoredTreeGrowthSeconds)
    );
    this.#setYoungTree(tree, 1, 1, 1);
    tree.regrowthVisual.root.visible = finalProgress < BRANCH_TAKEOVER_END;
    if (tree.regrowthVisual.root.visible) {
      const settleProgress = clamp01(finalProgress / BRANCH_TAKEOVER_END);
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

    const stem = new THREE.Mesh(this.stemGeometry, this.stemMaterial);
    stem.name = `tree-regrowth-stem-${tree.treeId}`;
    stem.castShadow = true;
    stem.receiveShadow = true;
    root.add(stem);

    const branchRoot = new THREE.Group();
    branchRoot.name = `tree-regrowth-branches-${tree.treeId}`;
    root.add(branchRoot);

    const budRoot = new THREE.Group();
    budRoot.name = `tree-regrowth-buds-${tree.treeId}`;
    root.add(budRoot);

    const profile = BRANCH_PROFILES[tree.variantIndex % BRANCH_PROFILES.length];
    const branches = profile.map((branchProfile, index) => {
      const mesh = new THREE.Mesh(this.branchGeometry, this.stemMaterial);
      mesh.name = `tree-regrowth-branch-${tree.treeId}-${index}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      branchRoot.add(mesh);

      const bud = new THREE.Mesh(
        this.budGeometry,
        index === profile.length - 1 ? this.budTipMaterial : this.budMaterial
      );
      bud.name = `tree-regrowth-bud-${tree.treeId}-${index}`;
      bud.castShadow = true;
      bud.visible = false;
      budRoot.add(bud);

      return { mesh, bud, profile: branchProfile };
    });

    if (this.treeRenderRegistry?.addObjectAt) {
      this.treeRenderRegistry.addObjectAt(root, x, z);
    } else {
      this.group.add(root);
    }

    return { root, stem, branchRoot, budRoot, branches };
  }

  #setYoungTree(tree, stemProgress, branchProgress, expansionProgress) {
    const visual = tree.regrowthVisual;
    if (!visual) return;

    visual.root.visible = true;
    visual.root.scale.setScalar(1);

    const stemT = smooth01(stemProgress);
    const branchT = smooth01(branchProgress);
    const expansionT = smooth01(expansionProgress);
    const sourceRadius = Math.max(0.34, tree.collisionTemplate?.radius ?? 0.5);
    const finalStemHeight = 0.92 + sourceRadius * 0.72;
    const height = THREE.MathUtils.lerp(0.055, finalStemHeight, stemT)
      * THREE.MathUtils.lerp(1, 1.1, expansionT);
    const stemRadius = THREE.MathUtils.lerp(0.022, Math.max(0.075, sourceRadius * 0.17), stemT)
      * THREE.MathUtils.lerp(1, 1.34, expansionT);

    visual.stem.scale.set(stemRadius, height, stemRadius);
    visual.stem.position.set(0, height * 0.5, 0);

    for (const branch of visual.branches) {
      const { profile, mesh, bud } = branch;
      const localProgress = smooth01(
        (branchT - profile.start) / Math.max(0.001, 1 - profile.start)
      );
      if (localProgress <= 0.001) {
        mesh.visible = false;
        bud.visible = false;
        continue;
      }

      const anchorHeight = height * profile.height;
      this.branchStart.set(0, anchorHeight, 0);
      this.branchDirection.set(...profile.direction).normalize();
      const branchLength = finalStemHeight * profile.length
        * THREE.MathUtils.lerp(0.78, 1.08, expansionT)
        * localProgress;
      this.branchEnd.copy(this.branchStart).addScaledVector(this.branchDirection, branchLength);

      const branchRadius = Math.max(0.018, stemRadius * profile.radius)
        * THREE.MathUtils.lerp(0.72, 1.12, expansionT)
        * THREE.MathUtils.lerp(0.62, 1, localProgress);
      this.#setCylinderBetween(mesh, this.branchStart, this.branchEnd, branchRadius);
      mesh.visible = true;

      const budProgress = smooth01((expansionT - 0.48 - profile.start * 0.08) / 0.42);
      bud.visible = budProgress > 0.001;
      if (bud.visible) {
        bud.position.copy(this.branchEnd);
        const budScale = (0.62 + sourceRadius * 0.22) * budProgress;
        bud.scale.set(budScale * 0.78, budScale * 0.62, budScale);
        bud.rotation.set(
          profile.height * 0.9,
          profile.start * Math.PI * 2 + tree.treeId * 0.13,
          -profile.height * 0.35
        );
      }
    }
  }

  #setCylinderBetween(mesh, start, end, radius) {
    this.branchDirection.copy(end).sub(start);
    const length = Math.max(0.001, this.branchDirection.length());
    this.branchDirection.multiplyScalar(1 / length);
    this.branchMidpoint.copy(start).add(end).multiplyScalar(0.5);
    mesh.position.copy(this.branchMidpoint);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, this.branchDirection);
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
