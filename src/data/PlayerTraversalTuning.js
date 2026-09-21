export const PLAYER_TRAVERSAL_TUNING = Object.freeze({
  body: Object.freeze({
    radius: 0.42,
    height: 2.2,
    eyeHeight: 1.72
  }),
  movement: Object.freeze({
    runSpeed: 6
  }),
  jump: Object.freeze({
    launchSpeed: 6.8,
    doubleJumpSpeed: 6.4,
    gravity: 16,
    fallGravityMultiplier: 1.18,
    maxAirJumps: 1
  }),
  flight: Object.freeze({
    holdDelaySeconds: 0.18,
    ascentSpeed: 4.8,
    descendSpeed: 4.2,
    verticalResponse: 10,
    horizontalSpeedMultiplier: 2.5,
    lockTapCount: 3,
    lockTapWindowSeconds: 0.72,
    turnRateRadiansPerSecond: 2.1
  })
});

export function gravityForVerticalSpeed(verticalSpeed) {
  const { gravity, fallGravityMultiplier } = PLAYER_TRAVERSAL_TUNING.jump;
  return gravity * (verticalSpeed < 0 ? fallGravityMultiplier : 1);
}
