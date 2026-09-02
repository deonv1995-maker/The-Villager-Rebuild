const DIRECT_STATIC_SOURCE =
  import.meta.url.startsWith('http') && typeof import.meta.env === 'undefined';

export const ASSET_ROOT = DIRECT_STATIC_SOURCE ? './public/assets' : './assets';

const asset = path => `${ASSET_ROOT}/${path}`;

export const ASSET_PATHS = Object.freeze({
  ranger: Object.freeze({
    model: asset('kaykit/adventurers/Ranger.glb'),
    movementBasic: asset('kaykit/animations/Rig_Medium_MovementBasic.glb'),
    general: asset('kaykit/animations/Rig_Medium_General.glb'),
    combatMelee: asset('kaykit/animations/Rig_Medium_CombatMelee.glb')
  }),
  forest: Object.freeze({
    treeBroad: asset('kaykit/forest/Tree_1_A_Color1.gltf'),
    treeTall: asset('kaykit/forest/Tree_2_A_Color1.gltf'),
    rock: asset('kaykit/forest/Rock_1_A_Color1.gltf')
  }),
  cliffs: Object.freeze({
    large: asset('kenney/nature/cliff_large_rock.glb'),
    rock: asset('kenney/nature/rock_largeA.glb')
  }),
  animals: Object.freeze({
    qiwiiPig: asset('animals/qiwii/Pig.fbx'),
    qiwiiTexture: asset('animals/qiwii/Texture.png'),
    quaterniusDeer: asset('animals/quaternius/Deer.gltf'),
    quaterniusFox: asset('animals/quaternius/Fox.gltf'),
    quaterniusWolf: asset('animals/quaternius/Wolf.gltf')
  }),
  ui: Object.freeze({
    mobile: Object.freeze({
      joystickPad: asset('ui/mobile/joystick-pad.svg'),
      joystickNub: asset('ui/mobile/joystick-nub.svg'),
      buttonCircle: asset('ui/mobile/button-circle.svg'),
      hand: asset('ui/mobile/icon-hand.svg'),
      axe: asset('ui/fantasy/icon-axe.png'),
      hammer: asset('ui/fantasy/icon-hammer.png'),
      pickaxe: asset('ui/fantasy/icon-pickaxe.png'),
      sword: asset('ui/fantasy/icon-sword.png'),
      campfire: asset('ui/fantasy/icon-campfire.png'),
      jump: asset('ui/mobile/icon-jump.svg'),
      spear: asset('ui/mobile/icon-spear.svg'),
      resources: Object.freeze({
        stick: asset('ui/fantasy/icon-resource-stick.png'),
        stone: asset('ui/fantasy/icon-resource-stone.png'),
        grass: asset('ui/fantasy/icon-resource-grass.png'),
        meat: asset('ui/fantasy/icon-resource-meat.png')
      }),
      build: Object.freeze({
        raw: asset('ui/mobile/icon-build-raw.svg'),
        floor: asset('ui/mobile/icon-build-floor.svg'),
        frame: asset('ui/mobile/icon-build-frame.svg'),
        wall: asset('ui/mobile/icon-build-wall.svg'),
        angle: asset('ui/mobile/icon-build-angle.svg'),
        roof: asset('ui/mobile/icon-build-roof.svg'),
        drop: asset('ui/mobile/icon-build-drop.svg')
      })
    })
  })
});
