// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// Hero M is the selected playful player-facing presentation. KayKit remains the sole gameplay
// and animation authority. Hero M owns presentation-local grounding, rendering-only foot contacts,
// and a final one-bone-arm locomotion adaptation that preserves the base geometry-calibrated rest
// pose, keeps each deform joint at its authored pivot, and adds a source-driven swing/bounce for
// walking/running without moving the gameplay/collision root. The proven Prisma body remains the
// immediate visual fallback. Previous Quaternius comparison assets stay available through an
// explicit rollback/audit alias.
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
