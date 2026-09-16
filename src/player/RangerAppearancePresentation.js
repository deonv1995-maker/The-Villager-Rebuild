// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// Hero M is the selected playful player-facing presentation. KayKit remains the sole gameplay
// and animation authority. Hero M owns presentation-local grounding, rendering-only foot contacts,
// and a final one-bone-arm adaptation that places the visible hands beside the hips and adds a
// source-driven walk/run position arc without moving the gameplay/collision root. The proven Prisma
// body remains the immediate visual fallback. Previous Quaternius comparison assets stay available
// through an explicit rollback/audit alias.
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
