export const SPROUT_ARRIVAL_PHASE = Object.freeze({
  DORMANT: 'dormant',
  IMPACT_DELAY: 'impact-delay',
  IMPACTING: 'impacting',
  INVESTIGATE: 'investigate',
  RESCUE: 'rescue',
  DIALOGUE: 'dialogue',
  ALLIED: 'allied',
  LEGACY_SKIPPED: 'legacy-skipped'
});

export const SPROUT_ARRIVAL = Object.freeze({
  stateVersion: 1,
  impactDelaySeconds: 0.9,
  impactDurationSeconds: 2.15,
  rescueDurationSeconds: 1.45,
  investigateNoticeRadius: 7.5,
  rescueRadius: 2.75,
  crashSite: Object.freeze({
    clearanceRadius: 4.4,
    relaxedClearanceRadius: 3.25,
    playableMargin: 5,
    maxPreferredSlope: 0.62,
    presentationClearRadius: 3.7,
    inlandDistances: Object.freeze([20, 24, 28, 32, 36]),
    lateralOffsets: Object.freeze([9, -9, 13, -13, 5, -5, 17, -17, 0])
  }),
  incoming: Object.freeze({
    startHeight: 31,
    horizontalStartDistance: 24,
    titleHorizontalDistance: 47.43416490252569,
    approachDirection: Object.freeze({ x: -3, z: 1 })
  }),
  dialogue: Object.freeze([
    Object.freeze({
      speaker: 'SYSTEM',
      text: 'CORE REBOOT COMPLETE · SURVIVOR ASSISTANCE DETECTED'
    }),
    Object.freeze({
      speaker: 'SPROUT',
      text: 'You moved those logs off me. Thank you, Ranger.'
    }),
    Object.freeze({
      speaker: 'SPROUT',
      text: 'My scout pod is wrecked, but my core systems survived the impact.'
    }),
    Object.freeze({
      speaker: 'SPROUT',
      text: 'Designation: Sprout. I am with you now. Watch what I can do with those logs.'
    })
  ])
});