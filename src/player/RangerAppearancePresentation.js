// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// Hero M is the selected player-facing presentation. KayKit remains the sole gameplay and
// animation authority. Hero M owns presentation-local grounding, rendering-only foot contacts,
// a final torso-blended arm adaptation and an upright visible-hand tool grip. The compact rig's
// DEF_hand_L/R joints are movable outer-arm/hand endpoints parented to the spine, so the arm
// layer maps the live KayKit hand trajectories into those endpoint positions and orientations.
// The tool layer keeps the geometry-derived Hero M grip position but calibrates the tool axis
// upright in hand space, matching the proven Prisma grip contract without adding another motion
// authority. The proven Prisma body remains the immediate visual fallback. Previous Quaternius
// comparison assets stay available through an explicit rollback/audit alias.
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
