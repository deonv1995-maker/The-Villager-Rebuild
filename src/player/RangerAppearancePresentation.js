// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// Hero M is the selected playful player-facing presentation. KayKit remains the sole gameplay
// and animation authority, while the proven Prisma body remains the immediate visual fallback.
// Previous Quaternius comparison assets stay available through an explicit rollback/audit alias.
export {
  HeroMPresentation as RangerAppearancePresentation
} from './HeroMPresentation.js';

export {
  MasculinePrismaHumanoidPresentation as RangerAppearancePresentationFallback
} from './MasculinePrismaHumanoidPresentation.js';

export {
  QuaterniusPeasantPresentation as RangerAppearancePresentationLegacyComparison
} from './QuaterniusPeasantPresentation.js';
