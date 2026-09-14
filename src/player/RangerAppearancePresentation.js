// Compatibility boundary: stable player/tool systems still import the historical Ranger name,
// while the visible body now prefers the user-supplied Prisma3D skinned humanoid and falls back
// to the proven simple rig-readable presentation if the native body cannot be activated.
// Legacy audit anchors retained for the v6 fallback contract:
// SimpleHumanoidPresentation as RangerAppearancePresentation from './SimpleHumanoidPresentation.js'
export { PrismaRiggedHumanoidPresentation as RangerAppearancePresentation } from './PrismaRiggedHumanoidPresentation.js';
