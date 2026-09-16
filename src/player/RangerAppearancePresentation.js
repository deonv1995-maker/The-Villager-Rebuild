// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// Hero M is the selected playful player-facing presentation. KayKit remains the sole gameplay
// and animation authority. Hero M owns presentation-local grounding, rendering-only foot contacts,
// and a final one-bone-arm adaptation that keeps each deform joint at its authored shoulder pivot,
// aims the visible hand toward a relaxed hip-level rest pose, and adds a source-driven shoulder
// swing for walking/running without moving the gameplay/collision root. The proven Prisma body
// remains the immediate visual fallback. Previous Quaternius comparison assets stay available
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
