const DIRECT_STATIC_SOURCE =
  import.meta.url.startsWith('http') && typeof import.meta.env === 'undefined';

export const ASSET_ROOT = DIRECT_STATIC_SOURCE ? './public/assets' : './assets';

const asset = path => `${ASSET_ROOT}/${path}`;

// Archived source references remain discoverable for regression/migration audits only.
// Player-facing runtime code must resolve icons exclusively through ASSET_PATHS below.
export const LEGACY_UI_ICON_SOURCE_AUDIT = Object.freeze({
  hammer: asset('ui/fantasy/icon-hammer.png'),
  pickaxe: asset('ui/fantasy/icon-pickaxe.png'),
  sword: asset('ui/fantasy/icon-sword.png'),
  shovel: asset('ui/mobile/icon-shovel.svg')
});

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
    quaterniusWolf: asset('animals/quaternius/Wolf.gltf'),
    cozyRabbit: asset('animals/custom/cozy-rabbit.gltf')
  }),
  ui: Object.freeze({
    mobile: Object.freeze({
      joystickPad: asset('ui/mobile/joystick-pad.svg'),
      joystickNub: asset('ui/mobile/joystick-nub.svg'),
      buttonCircle: asset('ui/mobile/button-circle.svg'),
      hand: asset('ui/cosy/icon-hand.webp'),
      axe: asset('ui/cosy/icon-axe.webp'),
      hammer: asset('ui/cosy/icon-hammer.webp'),
      pickaxe: asset('ui/cosy/icon-pickaxe.webp'),
      shovel: asset('ui/cosy/icon-shovel.webp'),
      sword: asset('ui/cosy/icon-sword.webp'),
      torch: asset('ui/cosy/icon-torch.webp'),
      campfire: asset('ui/cosy/icon-campfire.webp'),
      jump: asset('ui/cosy/icon-jump.webp'),
      spear: asset('ui/cosy/icon-spear.webp'),
      resources: Object.freeze({
        stick: asset('ui/cosy/icon-resource-stick.webp'),
        stone: asset('ui/cosy/icon-resource-stone.webp'),
        grass: asset('ui/cosy/icon-resource-grass.webp'),
        meat: asset('ui/cosy/icon-resource-meat.webp'),
        log: asset('ui/cosy/icon-build-raw.webp')
      }),
      build: Object.freeze({
        raw: asset('ui/cosy/icon-build-raw.webp'),
        floor: asset('ui/cosy/icon-build-floor.webp'),
        frame: asset('ui/cosy/icon-build-frame.webp'),
        wall: asset('ui/cosy/icon-build-wall.webp'),
        door: asset('ui/cosy/icon-build-door.webp'),
        window: asset('ui/cosy/icon-build-window.webp'),
        angle: asset('ui/mobile/icon-build-angle.svg'),
        stairs: asset('ui/cosy/icon-build-stairs.webp'),
        roof: asset('ui/cosy/icon-build-roof.webp'),
        drop: asset('ui/cosy/icon-build-drop.webp')
      })
    })
  })
});
