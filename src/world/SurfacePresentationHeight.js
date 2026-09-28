export function surfacePresentationHeightAt(terrain, constructionTerrain, x, z) {
  const constructionRendered = constructionTerrain?.renderedHeightAt?.(x, z);
  if (Number.isFinite(constructionRendered)) return constructionRendered;

  const terrainRendered = terrain?.renderedSurfaceHeightAt?.(x, z);
  if (Number.isFinite(terrainRendered)) return terrainRendered;

  const constructionHeight = constructionTerrain?.heightAt?.(x, z);
  if (Number.isFinite(constructionHeight)) return constructionHeight;

  const terrainHeight = terrain?.heightAt?.(x, z);
  return Number.isFinite(terrainHeight) ? terrainHeight : 0;
}
