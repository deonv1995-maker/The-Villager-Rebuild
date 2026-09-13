export const PLAYER_TRAVERSAL_TUNING = Object.freeze({
  jump: Object.freeze({
    launchSpeed: 6.8,
    doubleJumpSpeed: 6.4,
    gravity: 16,
    fallGravityMultiplier: 1.18,
    maxAirJumps: 1
  })
});

export function gravityForVerticalSpeed(verticalSpeed) {
  const { gravity, fallGravityMultiplier } = PLAYER_TRAVERSAL_TUNING.jump;
  return gravity * (verticalSpeed < 0 ? fallGravityMultiplier : 1);
}
