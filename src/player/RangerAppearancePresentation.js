// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// The pre-native seam was `SimpleHumanoidPresentation as RangerAppearancePresentation`; that
// foundation remains the fallback lineage under Prisma, while the masculine profile now owns
// presentation-only device tuning without becoming a second gameplay or animation system.
export {
  MasculinePrismaHumanoidPresentation as RangerAppearancePresentation
} from './MasculinePrismaHumanoidPresentation.js';

export {
  SimpleHumanoidPresentation as RangerAppearancePresentationFallback
} from './SimpleHumanoidPresentation.js';
