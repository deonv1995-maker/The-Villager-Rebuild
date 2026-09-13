import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ScoutCharacterPresentation } from '../src/player/ScoutCharacterPresentation.js';
import { RangerAppearancePresentation } from '../src/player/RangerAppearancePresentation.js';
import { PLAYER_TRAVERSAL_TUNING, gravityForVerticalSpeed } from '../src/data/PlayerTraversalTuning.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function readGlbJson(path) { const bytes=readFileSync(new URL(`../${path}`,import.meta.url)); assert.equal(bytes.toString('utf8',0,4),'glTF'); const len=bytes.readUInt32LE(12); assert.equal(bytes.readUInt32LE(16),0x4e4f534a); return JSON.parse(bytes.toString('utf8',20,20+len).replace(/\u0000+$/g,'').trim()); }
const rangerGlb=readGlbJson('public/assets/kaykit/adventurers/Ranger.glb');
const jointIndices=new Set((rangerGlb.skins??[]).flatMap(s=>s.joints??[]));
const productionJointNames=[...jointIndices].map(i=>rangerGlb.nodes?.[i]?.name).filter(Boolean);
assert.ok(productionJointNames.length>0);
const productionRoot=new THREE.Group(),productionModel=new THREE.Group(); productionRoot.add(productionModel);
for(const name of productionJointNames){const j=new THREE.Bone();j.name=name;productionModel.add(j);}
const productionPlayer={model:productionModel,root:productionRoot,getPosition:t=>t.copy(productionRoot.position),isFirstPerson:()=>false};
assert.equal(new ScoutCharacterPresentation({player:productionPlayer}).mode,'scout-rigged');
const root=new THREE.Group(),model=new THREE.Group();root.add(model);
const sourceMesh=new THREE.Mesh(new THREE.BoxGeometry(.5,1.5,.35),new THREE.MeshStandardMaterial());sourceMesh.name='Ranger_Source_Mesh';model.add(sourceMesh);
const quiver=new THREE.Object3D();quiver.name='Ranger_Quiver';model.add(quiver);
function bone(name,x,y,z){const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);model.add(b);}
bone('Pelvis',0,.95,0);bone('Spine_03',0,1.48,0);bone('Head',0,1.83,0);bone('UpperArm_L',-.34,1.5,0);bone('LowerArm_L',-.58,1.25,0);bone('Hand_L',-.7,1.03,0);bone('UpperArm_R',.34,1.5,0);bone('LowerArm_R',.58,1.25,0);bone('Hand_R',.7,1.03,0);bone('Thigh_L',-.17,.9,0);bone('Calf_L',-.17,.48,0);bone('Foot_L',-.17,.08,.08);bone('Thigh_R',.17,.9,0);bone('Calf_R',.17,.48,0);bone('Foot_R',.17,.08,.08);
let firstPerson=false,cameraModeListener=null;
const player={model,root,getPosition:t=>t.copy(root.position),isFirstPerson:()=>firstPerson,onCameraModeChange(listener){cameraModeListener=listener;listener(firstPerson?'first-person':'third-person');return()=>{if(cameraModeListener===listener)cameraModeListener=null;};}};
root.updateMatrixWorld(true);
const presentation=new RangerAppearancePresentation({player});
assert.equal(presentation.mode,'scout-rigged');assert.equal(model.getObjectByName('Ranger_Quiver'),undefined);assert.equal(sourceMesh.visible,false);assert.equal(presentation.visualRoot.parent,root);assert.equal(presentation.visualRoot.userData.characterIdentity,'scout');
assert.equal(presentation.visualRoot.userData.visualRevision,'scout-polish-v3','runtime Scout should use the mockup-fidelity revision');
assert.equal(presentation.visualRoot.userData.visualMeshBudget,72);
const silhouette=presentation.visualRoot.userData.mockupSilhouette;
assert.ok(silhouette.headRadius>=0.36,'Scout head should retain the larger heroic mockup proportion');
assert.ok(silhouette.scarfOuterRadius>=0.5,'Scout cowl should retain the broad mockup silhouette');
assert.ok(silhouette.bootDepth>=0.55,'Scout traversal boots should retain the oversized mockup silhouette');
for(const name of ['scout-tunic','scout-scarf','scout-satchel','scout-left-boot','scout-left-pupil','scout-nose','scout-belt-buckle','scout-left-tunic-sleeve','scout-left-forearm-wrap','scout-left-boot-sole','scout-cape-center-seam']) assert.ok(presentation.visualRoot.getObjectByName(name),`Scout should include ${name}`);
let scoutMeshCount=0;presentation.visualRoot.traverse(o=>{if(!o.isMesh)return;scoutMeshCount++;assert.equal(o.material.flatShading,true,`${o.name} should retain low-poly flat shading`);});assert.ok(scoutMeshCount>=60);assert.ok(scoutMeshCount<=72);
presentation.update(1/60);root.position.z+=.12;root.position.y+=.08;root.updateMatrixWorld(true);presentation.update(1/60);assert.ok(presentation.capeTrail>0);assert.ok(Number.isFinite(presentation.headGroup.position.y));
firstPerson=true;cameraModeListener?.('first-person');assert.equal(presentation.visualRoot.visible,false);firstPerson=false;cameraModeListener?.('third-person');assert.equal(presentation.visualRoot.visible,true);
const compatibilityModule=read('src/player/RangerAppearancePresentation.js');assert.ok(compatibilityModule.includes('PolishedScoutCharacterPresentation as RangerAppearancePresentation'));
const polishModule=read('src/player/ScoutVisualPolish.js');assert.ok(polishModule.includes('extends ScoutCharacterPresentation')&&polishModule.includes('visualRevision=POLISH_REVISION'));
const controller=read('src/player/RangerController.js');assert.ok(controller.includes('PLAYER_TRAVERSAL_TUNING, gravityForVerticalSpeed'));assert.ok(controller.includes('this.airJumpsRemaining = PLAYER_TRAVERSAL_TUNING.jump.maxAirJumps;')&&controller.includes('this.jumpVelocity = doubleJumpSpeed;')&&controller.includes('this.jumpStage = 2;'));assert.ok(controller.includes('gravityForVerticalSpeed(this.jumpVelocity)')&&!controller.includes('this.jumpVelocity -= 13.5 * dt')&&!controller.includes('this.jumpVelocity = 5.4;'));assert.ok(controller.includes('if (!event.repeat) this.jump();'));
const {jump}=PLAYER_TRAVERSAL_TUNING;assert.equal(jump.maxAirJumps,1);assert.ok(jump.launchSpeed>5.4);assert.ok(jump.doubleJumpSpeed>0);assert.ok(gravityForVerticalSpeed(-1)>gravityForVerticalSpeed(1));
const apex=(v,g)=>(v*v)/(2*g);assert.ok(apex(jump.launchSpeed,jump.gravity)>1.4);assert.ok(apex(jump.launchSpeed,jump.gravity)+apex(jump.doubleJumpSpeed,jump.gravity)>2.6);
const packageJson=JSON.parse(read('package.json'));assert.ok(packageJson.scripts.check.includes('npm run verify:ranger-presentation'));
console.log('Scout presentation, mockup fidelity, and double-jump regression checks passed.');
