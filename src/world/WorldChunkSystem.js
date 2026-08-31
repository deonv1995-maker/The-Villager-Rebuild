import * as THREE from 'three';

const TREE_BATCH_PATTERN = /^forest-tree-batch-(\d+)-(\d+)$/;

export class WorldChunkSystem {
  constructor({ group, chunkSize = 72, renderDistance = 210, frustumPadding = 34 }) {
    this.group = group;
    this.chunkSize = chunkSize;
    this.renderDistance = renderDistance;
    this.frustumPadding = frustumPadding;
    this.chunks = new Map();
    this.treeRenderHandles = new Map();
    this.treeTemplates = new Map();
    this.frustum = new THREE.Frustum();
    this.projectionView = new THREE.Matrix4();
    this.cameraPosition = new THREE.Vector3();
    this.playerChunk = { ix: 0, iz: 0 };
  }

  keyForPosition(x, z) {
    const { ix, iz } = this.coordinatesForPosition(x, z);
    return this.keyForCoordinates(ix, iz);
  }

  keyForCoordinates(ix, iz) {
    return `${ix}:${iz}`;
  }

  coordinatesForPosition(x, z) {
    return {
      ix: Math.floor(x / this.chunkSize),
      iz: Math.floor(z / this.chunkSize)
    };
  }

  getChunk(keyOrX, z = null) {
    const key = typeof keyOrX === 'string' ? keyOrX : this.keyForPosition(keyOrX, z);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;

    const [ixText, izText] = key.split(':');
    const ix = Number(ixText);
    const iz = Number(izText);
    const root = new THREE.Group();
    root.name = `world-chunk-${ix}-${iz}`;
    root.userData.worldChunk = true;
    root.userData.chunkKey = key;
    this.group.add(root);

    chunk = {
      key,
      ix,
      iz,
      root,
      centerX: (ix + 0.5) * this.chunkSize,
      centerZ: (iz + 0.5) * this.chunkSize,
      radius: Math.SQRT2 * this.chunkSize * 0.5 + this.frustumPadding
    };
    this.chunks.set(key, chunk);
    return chunk;
  }

  addObjectAt(object, x, z) {
    const chunk = this.getChunk(x, z);
    chunk.root.add(object);
    return chunk.key;
  }

  addObjectToKey(object, key) {
    const chunk = this.getChunk(key);
    chunk.root.add(object);
    return chunk.key;
  }

  adoptObject(object, x = object.position.x, z = object.position.z) {
    const chunk = this.getChunk(x, z);
    chunk.root.attach(object);
    return chunk.key;
  }

  adoptNamedObjects(sourceGroup, predicate) {
    const objects = [];
    sourceGroup.traverse(object => {
      if (object === sourceGroup || object.userData?.worldChunk) return;
      if (predicate(object)) objects.push(object);
    });

    for (const object of objects) {
      object.updateWorldMatrix(true, false);
      const position = new THREE.Vector3();
      object.getWorldPosition(position);
      this.adoptObject(object, position.x, position.z);
    }
    return objects.length;
  }

  splitTreeBatches(sourceGroup) {
    const batches = [];
    sourceGroup.traverse(object => {
      if (!object.isInstancedMesh || object.userData?.chunkedTreeBatch) return;
      const match = TREE_BATCH_PATTERN.exec(object.name);
      if (!match) return;
      batches.push({
        object,
        variantIndex: Number(match[1]),
        meshIndex: Number(match[2])
      });
    });
    if (!batches.length) return 0;

    const variantCount = Math.max(...batches.map(entry => entry.variantIndex)) + 1;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    for (const { object, variantIndex, meshIndex } of batches) {
      const templateKey = `${variantIndex}:${meshIndex}`;
      this.treeTemplates.set(templateKey, {
        key: templateKey,
        variantIndex,
        meshIndex,
        geometry: object.geometry,
        material: object.material
      });

      const indicesByChunk = new Map();
      for (let sourceIndex = 0; sourceIndex < object.count; sourceIndex += 1) {
        object.getMatrixAt(sourceIndex, matrix);
        position.setFromMatrixPosition(matrix);
        const key = this.keyForPosition(position.x, position.z);
        const list = indicesByChunk.get(key) ?? [];
        list.push(sourceIndex);
        indicesByChunk.set(key, list);
      }

      for (const [key, sourceIndices] of indicesByChunk) {
        const chunkBatch = new THREE.InstancedMesh(object.geometry, object.material, sourceIndices.length);
        chunkBatch.name = `forest-tree-chunk-${variantIndex}-${meshIndex}-${key.replace(':', '-')}`;
        chunkBatch.userData.chunkedTreeBatch = true;
        chunkBatch.castShadow = false;
        chunkBatch.receiveShadow = true;
        chunkBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        sourceIndices.forEach((sourceIndex, localIndex) => {
          object.getMatrixAt(sourceIndex, matrix);
          chunkBatch.setMatrixAt(localIndex, matrix);
          const treeId = sourceIndex * variantCount + variantIndex;
          const handles = this.treeRenderHandles.get(treeId) ?? [];
          handles[meshIndex] = {
            mesh: chunkBatch,
            index: localIndex,
            templateKey
          };
          this.treeRenderHandles.set(treeId, handles);
        });

        chunkBatch.instanceMatrix.needsUpdate = true;
        chunkBatch.computeBoundingSphere();
        this.addObjectToKey(chunkBatch, key);
      }

      object.parent?.remove(object);
    }

    return this.treeRenderHandles.size;
  }

  getTreeRenderHandles(treeId) {
    return (this.treeRenderHandles.get(treeId) ?? []).filter(Boolean);
  }

  getTreeTemplates() {
    return this.treeTemplates;
  }

  getTreeTemplateCount() {
    return this.treeTemplates.size;
  }

  update(camera, playerPosition) {
    if (!camera || !playerPosition) return;

    camera.updateMatrixWorld();
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView);
    camera.getWorldPosition(this.cameraPosition);
    this.playerChunk = this.coordinatesForPosition(playerPosition.x, playerPosition.z);

    const renderDistanceSq = this.renderDistance * this.renderDistance;
    for (const chunk of this.chunks.values()) {
      const dx = chunk.centerX - playerPosition.x;
      const dz = chunk.centerZ - playerPosition.z;
      const distanceSq = dx * dx + dz * dz;
      const local = Math.abs(chunk.ix - this.playerChunk.ix) <= 1 && Math.abs(chunk.iz - this.playerChunk.iz) <= 1;
      let visible = local;

      if (!visible && distanceSq <= renderDistanceSq) {
        const sphere = new THREE.Sphere(
          new THREE.Vector3(chunk.centerX, 2.5, chunk.centerZ),
          chunk.radius
        );
        visible = this.frustum.intersectsSphere(sphere);
      }

      chunk.root.visible = visible;
    }
  }

  getStats() {
    let visible = 0;
    for (const chunk of this.chunks.values()) if (chunk.root.visible) visible += 1;
    return {
      chunkSize: this.chunkSize,
      total: this.chunks.size,
      visible
    };
  }
}
