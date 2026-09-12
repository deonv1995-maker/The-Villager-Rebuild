export const WORLD_DAY_MINUTES = 24 * 60;

export const WORLD_TIME = Object.freeze({
  startDay: 1,
  startMinuteOfDay: 8 * 60,
  realSecondsPerDay: 24 * 60,
  maxFrameDeltaSeconds: 1 / 4,
  phases: Object.freeze({
    dawnStart: 5 * 60,
    dayStart: 7 * 60,
    duskStart: 17 * 60 + 30,
    nightStart: 20 * 60
  })
});
