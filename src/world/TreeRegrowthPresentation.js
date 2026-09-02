import * as THREE from 'three';

const SPROUT_BARK_COLOR = 0x6f472a;
const SPROUT_LEAF_COLOR = 0x4f8c49;
const SPROUT_LEAF_TIP_COLOR = 0x6ba957;
const FINAL_TREE_START_SCALE = 0.18;

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
    this.leafGeometry = new THREE.IcosahedronGeometry(0.24, 0);
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
  }

  begin(tree) {
    if (!tree.regrowthVisual) tree.regrowthVisual = this.#createSprout(tree);
    this.hideTree(tree);
    this.update(tree, 0);
  }

  update(tree, ageSeconds) {
    if (!tree.regrowthVisual) tree.regrowthVisual = this.#createSprout(tree);

    const timing = this.timing;
    const sproutAt = timing.sproutDelaySeconds;
    const stemEnd = sproutAt + timing.stemGrowthSeconds;
    const holdEnd = stemEnd + timing.youngHoldSeconds;
    const thickenEnd = holdEnd + timing.thickeningSeconds;
    const finalEnd = thickenEnd + timing.finalGrowthSeconds;
    const age = THREE.MathUtils.clamp(ageSeconds, 0, finalEnd);

    if (age < sproutAt) {
      tree.regrowthVisual.root.visible = false;
      this.hideTree(tree);
      return;
    }

    if (age < stemEnd) {
      const progress = (age - sproutAt) / Math.max(0.001, timing.stemGrowthSeconds);
      this.#setSprout(tree, progress, 0);
      this.hideTree(tree);
      return;
    }

    if (age < holdEnd) {
      this.#setSprout(tree, 1, 0);
      this.hideTree(tree);
      return;
    }

    if (age < thickenEnd) {
      const progress = (age - holdEnd) / Math.max(0.001, timing.thickeningSeconds);
      this.#setSprout(tree, 1, progress);
      this.hideTree(tree);
      return;
    }

    const finalProgress = smooth01(
      (age - thickenEnd) / Math.max(0.001, timing.finalGrowthSeconds)
    );
    this.#setSprout(tree, 1, 1);
    tree.regrowthVisual.root.visible = finalProgress < 0.42;
    if (tree.regrowthVisual.root.visible) {
      const settleScale = THREE.MathUtils.lerp(1.34, 0.96, clamp01(finalProgress / 0.42));
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

  #createSprout(tree) {
    const x = tree.collisionTemplate?.x ?? tree.obstacle?.x ?? 0;
    const z = tree.collisionTemplate?.z ?? tree.obstacle?.z ?? 0;
    const stumpTopY = this.terrain.heightAt(x, z) + 0.34;

    const root = new THREE.Group();
    root.name = `tree-regrowth-sprout-${tree.treeId}`;
    root.position.set(x, stumpTopY, z);
    root.visible = false;

    const stem = new THREE.Mesh(this.stemGeometry, this.stemMaterial);
    stem.name = `tree-regrowth-stem-${tree.treeId}`;
    stem.castShadow = true;
    stem.receiveShadow = true;
    root.add(stem);

    const leaves = new THREE.Group();
    leaves.name = `tree-regrowth-leaves-${tree.treeId}`;
    const leafOffsets = [
      [0, 0.02, 0, 1, 0.72, 0.82],
      [0.18, 0, 0.03, 0.72, 0.5, 0.58],
      [-0.16, -0.01, 0.05, 0.7, 0.48, 0.6],
      [0.02, 0.03, 0.17, 0.62, 0.46, 0.72],
      [0.04, 0.05, -0.16, 0.6, 0.44, 0.68]
    ];
    leafOffsets.forEach((values, index) => {
      const [lx, ly, lz, sx, sy, sz] = values;
      const leaf = new THREE.Mesh(
        this.leafGeometry,
        index === 0 ? this.leafTipMaterial : this.leafMaterial
      );
      leaf.position.set(lx, ly, lz);
      leaf.scale.set(sx, sy, sz);
      leaf.rotation.set(index * 0.17, index * 1.23, -index * 0.11);
      leaf.castShadow = true;
      leaves.add(leaf);
    });
    root.add(leaves);

    if (this.treeRenderRegistry?.addObjectAt) {
      this.treeRenderRegistry.addObjectAt(root, x, z);
    } else {
      this.group.add(root);
    }

    return { root, stem, leaves };
  }

  #setSprout(tree, stemProgress, thickeningProgress) {
    const visual = tree.regrowthVisual;
    if (!visual) return;

    visual.root.visible = true;
    visual.root.scale.setScalar(1);
    const stemT = smooth01(stemProgress);
    const thickenT = smooth01(thickeningProgress);
    const sourceRadius = Math.max(0.34, tree.collisionTemplate?.radius ?? 0.5);
    const finalStemHeight = 0.92 + sourceRadius * 0.72;
    const height = THREE.MathUtils.lerp(0.055, finalStemHeight, stemT)
      * THREE.MathUtils.lerp(1, 1.12, thickenT);
    const stemRadius = THREE.MathUtils.lerp(0.022, Math.max(0.075, sourceRadius * 0.17), stemT)
      * THREE.MathUtils.lerp(1, 1.38, thickenT);

    visual.stem.scale.set(stemRadius, height, stemRadius);
    visual.stem.position.set(0, height * 0.5, 0);

    const leafScale = THREE.MathUtils.lerp(0.2, 0.95, stemT)
      * THREE.MathUtils.lerp(1, 1.42, thickenT);
    visual.leaves.position.set(0, height + 0.025, 0);
    visual.leaves.scale.setScalar(leafScale);
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
