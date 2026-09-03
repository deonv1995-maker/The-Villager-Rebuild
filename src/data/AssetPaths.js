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
      hand: asset('ui/survival/icon-hand.webp'),
      axe: asset('ui/survival/icon-axe.webp'),
      hammer: asset('ui/survival/icon-hammer.webp'),
      pickaxe: asset('ui/survival/icon-pickaxe.webp'),
      shovel: asset('ui/survival/icon-shovel.webp'),
      sword: asset('ui/survival/icon-sword.webp'),
      campfire: asset('ui/survival/icon-campfire.webp'),
      jump: asset('ui/survival/icon-jump.webp'),
      spear: asset('ui/survival/icon-spear.webp'),
      resources: Object.freeze({
        stick: asset('ui/survival/icon-resource-stick.webp'),
        stone: asset('ui/survival/icon-resource-stone.webp'),
        grass: asset('ui/survival/icon-resource-grass.webp'),
        meat: asset('ui/survival/icon-resource-meat.webp')
      }),
      build: Object.freeze({
        raw: asset('ui/survival/icon-build-raw.webp'),
        floor: asset('ui/survival/icon-build-floor.webp'),
        frame: asset('ui/survival/icon-build-frame.webp'),
        wall: asset('ui/survival/icon-build-wall.webp'),
        angle: asset('ui/mobile/icon-build-angle.svg'),
        stairs: asset('ui/survival/icon-build-stairs.webp'),
        roof: asset('ui/survival/icon-build-roof.webp'),
        drop: asset('ui/survival/icon-build-drop.webp')
      })
    })
  })
});
