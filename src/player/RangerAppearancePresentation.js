// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// Hero M is the selected player-facing presentation. KayKit remains the sole gameplay and
// animation authority. Hero M owns presentation-local grounding, rendering-only foot contacts,
// and a final torso-blended arm adaptation: the compact rig's DEF_hand_L/R joints are movable
// outer-arm/hand endpoints parented to the spine, so the final layer maps the live KayKit hand
// trajectories into those endpoint positions and orientations. It does not treat them as shoulder
// pivots and never moves the gameplay/collision root. The proven Prisma body remains the immediate
// visual fallback. Previous Quaternius comparison assets stay available through an explicit
// rollback/audit alias.
export {
  HeroMArmMotionPresentation as RangerAppearancePresentation
} from './HeroMArmMotionPresentation.js';

export {
  HeroMPresentation as RangerAppearancePresentationHeroMBase
} from './HeroMPresentation.js';

export {
  MasculinePrismaHumanoidPresentation as RangerAppearancePresentationFallback
} from './MasculinePrismaHumanoidPresentation.js';

export {
  QuaterniusPeasantPresentation as RangerAppearancePresentationLegacyComparison
} from './QuaterniusPeasantPresentation.js';