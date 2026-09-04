const LEGACY_TUTORIAL_STATUS_MESSAGES = Object.freeze(new Set([
  'DAY 1 · GATHER A STICK + STONE',
  'DAY 1 · GATHER + CRAFT',
  'STICKS + STONES READY · CAMPFIRE',
  'DAY 1 · CAMPFIRE BUILT'
]));

export function isLegacyTutorialStatus(message) {
  return LEGACY_TUTORIAL_STATUS_MESSAGES.has(String(message ?? ''));
}

/**
 * Temporary milestone boundary while the core gameplay loop is being redesigned.
 *
 * Gameplay systems may continue emitting immediate action/result feedback through the
 * normal status channel, but the old Day-1 progression prompts are suppressed. The
 * future tutorial should observe the finished gameplay loop instead of becoming an
 * authority for gameplay state or progression.
 */
export function createGameplayStatusSink(setStatus) {
  return (message, error = false) => {
    if (!error && isLegacyTutorialStatus(message)) return false;
    setStatus?.(message, error);
    return true;
  };
}
