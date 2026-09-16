// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// Hero M is the selected player-facing presentation. KayKit remains the sole gameplay and
// animation authority. Hero M owns presentation-local grounding, rendering-only foot contacts,
// a final torso-blended arm adaptation and a forward body-cleared visible-hand tool grip. The
// compact rig's DEF_hand_L/R joints are movable outer-arm/hand endpoints parented to the spine,
// so the arm layer maps the live KayKit hand trajectories into those endpoint positions and
// orientations. The final tool layer preserves the geometry-derived Hero M hand location, maps
// the normalized tool axis into the character-forward carry frame and adds a small presentation-
// only outward/forward clearance so long props do not rest through the thigh or torso. The proven
// Prisma body remains the immediate visual fallback. Previous Quaternius comparison assets stay
// available through an explicit rollback/audit alias.
export {
  HeroMToolGripPresentation as RangerAppearancePresentation
} from './HeroMToolGripPresentation.js';

export {
  HeroMArmMotionPresentation as RangerAppearancePresentationHeroMArmBase
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
