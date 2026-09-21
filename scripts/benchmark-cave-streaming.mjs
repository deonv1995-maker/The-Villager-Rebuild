// Diagnostic only: node scripts/benchmark-cave-streaming.mjs [checkout-path]
// Runs CPU meshing without WebGL. Timings are not device FPS or a CI threshold.
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? '.');
const { Group } = await import(`${root}/node_modules/three/build/three.module.js`);
const { ExpandedIslandTerrainSystem } = await import(`${root}/src/world/ExpandedIslandTerrainSystem.js`);
const { UndergroundTunnelingSystem } = await import(`${root}/src/world/UndergroundTunnelingSystem.js`);
const terrain = new ExpandedIslandTerrainSystem(new Group());
const system = new UndergroundTunnelingSystem({group: new Group(),terrain});
system.create();
const entrance = system.getNaturalCaveNetwork().entrances[0];
const player = {x:entrance.x,y:terrain.heightAt(entrance.x,entrance.z),z:entrance.z};
const times=[];let total=0;
for(let i=0;i<3000;i++) {
 const start=performance.now();system.update(player);const elapsed=performance.now()-start;times.push(elapsed);total+=elapsed;
 if(system.getDebugState().builtNaturalChunkCount>=30)break;
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({root,updates:times.length,totalMs:total,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),state:system.getDebugState()}));
