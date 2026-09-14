// Compatibility boundary: stable player/tool systems keep importing the historical Ranger name.
// The Prisma presentation owns the player-facing native mesh while retaining SimpleHumanoidPresentation
// internally as its safe rig-readable fallback.
export {
  PrismaRiggedHumanoidPresentation as RangerAppearancePresentation
} from './PrismaRiggedHumanoidPresentation.js';

export {
  SimpleHumanoidPresentation as RangerAppearancePresentationFallback
} from './SimpleHumanoidPresentation.js';
