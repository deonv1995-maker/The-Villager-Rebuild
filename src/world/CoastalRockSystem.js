import * as THREE from 'three';
import {
  COASTAL_ROCK_FORMATIONS,
  COASTAL_ROCK_PRESENTATION
} from '../data/CoastalRockDefinitions.js';

const WATER_SEARCH_STEP = 5;
const WATER_SEARCH_STEPS = 14;
const MAX_EMERGED_TERRAIN = 0.08;

const prepareTemplate = template => {
  template.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
    if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
  });
};

const resolveWaterPoint = (terrain, definition, coastOffsetScale) => {
  const angle = definition.angle;
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  const coastRadius = terrain.coastRadiusAt(angle);
  let radius = coastRadius + definition.coastOffset * coastOffsetScale;
  let x = directionX * radius;
  let z = terrain.centerZ + directionZ * radius;

  for (let step = 0; step < WATER_SEARCH_STEPS; step += 1) {
    if (terrain.heightAt(x, z) <= terrain.waterLevel + MAX_EMERGED_TERRAIN) break;
    radius += WATER_SEARCH_STEP;
    x = directionX * radius;
    z = terrain.centerZ + directionZ * radius;
  }

  return { x, z };
};

/**
 * Adds the authored offshore formations using the same rock asset and coast-relative
 * placement for gameplay and the title/shipwreck island. Scene-space placement and
 * rock silhouette scales are intentionally separable so a compressed backdrop can
 * preserve the same rock identity/proportions without changing authored formations.
 * These objects do not register harvest or locomotion collision, preserving the
 * Day-1 shallow-water arrival route.
 */
export function addCoastalRockFormations({
  group,
  terrain,
  template,
  horizontalScale = 1,
  verticalScale = 1,
  silhouetteHorizontalScale = horizontalScale,
  silhouetteVerticalScale = verticalScale,
  coastOffsetScale = 1,
  footprintScale = COASTAL_ROCK_PRESENTATION.footprintScale,
  localizeTerrainCenterZ = false,
  namePrefix = 'coastal-rock'
}) {
  if (!group || !terrain || !template) return 0;
  if (typeof terrain.coastRadiusAt !== 'function') return 0;

  prepareTemplate(template);
  let count = 0;
  const zOrigin = localizeTerrainCenterZ ? terrain.centerZ : 0;

  for (const definition of COASTAL_ROCK_FORMATIONS) {
    const point = resolveWaterPoint(terrain, definition, coastOffsetScale);
    const rock = template.clone(true);
    rock.name = `${namePrefix}-${definition.id}`;
    rock.position.set(
      point.x * horizontalScale,
      (terrain.waterLevel - definition.sink) * verticalScale,
      (point.z - zOrigin) * horizontalScale
    );
    rock.scale.set(
      definition.scaleX * silhouetteHorizontalScale * footprintScale,
      definition.scaleY * silhouetteVerticalScale,
      definition.scaleZ * silhouetteHorizontalScale * footprintScale
    );
    rock.rotation.set(definition.pitch, definition.yaw, definition.roll);
    rock.userData.coastalRockFormationId = definition.id;
    group.add(rock);
    count += 1;
  }

  return count;
}
