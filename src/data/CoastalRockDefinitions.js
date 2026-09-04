const formation = ({
  id,
  angle,
  coastOffset,
  scaleX,
  scaleY,
  scaleZ,
  yaw,
  pitch = 0,
  roll = 0,
  sink = 1.4
}) => Object.freeze({
  id,
  angle,
  coastOffset,
  scaleX,
  scaleY,
  scaleZ,
  yaw,
  pitch,
  roll,
  sink
});

// Shared presentation tuning keeps the title wreck and playable coastline using
// one silhouette language while allowing the gameplay ring to sit closer to shore.
export const COASTAL_ROCK_PRESENTATION = Object.freeze({
  footprintScale: 1.2,
  playableCoastOffsetScale: 0.62
});

// One authored shoreline-rock layout is shared by the playable island and the
// shipwreck/title island. Positions are resolved from the authoritative coast
// radius at runtime so terrain reshaping does not leave rocks stranded inland.
export const COASTAL_ROCK_FORMATIONS = Object.freeze([
  formation({ id: 'wreck-west-outer', angle: Math.PI * 0.425, coastOffset: 22, scaleX: 9.4, scaleY: 11.6, scaleZ: 8.1, yaw: 0.32, pitch: 0.06, roll: -0.08, sink: 1.9 }),
  formation({ id: 'wreck-west-inner', angle: Math.PI * 0.468, coastOffset: 12, scaleX: 6.8, scaleY: 8.6, scaleZ: 6.1, yaw: 1.12, pitch: -0.03, roll: 0.07, sink: 1.35 }),
  formation({ id: 'day-one-beach-visible', angle: Math.PI * 0.485, coastOffset: 6, scaleX: 8.6, scaleY: 10.4, scaleZ: 7.8, yaw: 1.84, pitch: 0.03, roll: -0.04, sink: 1.55 }),
  formation({ id: 'wreck-east-inner', angle: Math.PI * 0.535, coastOffset: 13, scaleX: 7.2, scaleY: 9.2, scaleZ: 6.6, yaw: 2.18, pitch: 0.04, roll: -0.04, sink: 1.45 }),
  formation({ id: 'wreck-east-outer', angle: Math.PI * 0.58, coastOffset: 24, scaleX: 10.6, scaleY: 13.2, scaleZ: 9.4, yaw: 2.72, pitch: -0.05, roll: 0.09, sink: 2.1 }),
  formation({ id: 'wreck-breaker-east', angle: Math.PI * 0.615, coastOffset: 34, scaleX: 5.8, scaleY: 7.4, scaleZ: 5.2, yaw: 0.82, pitch: 0.08, roll: 0.05, sink: 1.2 }),
  formation({ id: 'east-shelf-north', angle: Math.PI * 0.31, coastOffset: 19, scaleX: 8.4, scaleY: 9.8, scaleZ: 7.2, yaw: 1.58, roll: 0.05, sink: 1.55 }),
  formation({ id: 'east-shelf-mid', angle: Math.PI * 0.2, coastOffset: 29, scaleX: 6.6, scaleY: 7.8, scaleZ: 5.9, yaw: 2.44, pitch: -0.04, sink: 1.35 }),
  formation({ id: 'east-shelf-south', angle: Math.PI * 0.07, coastOffset: 16, scaleX: 11.2, scaleY: 12.4, scaleZ: 8.8, yaw: 0.54, roll: -0.07, sink: 2.0 }),
  formation({ id: 'north-east-breaker', angle: Math.PI * -0.06, coastOffset: 25, scaleX: 7.8, scaleY: 9.4, scaleZ: 6.8, yaw: 1.94, pitch: 0.05, sink: 1.5 }),
  formation({ id: 'north-east-spire', angle: Math.PI * -0.23, coastOffset: 18, scaleX: 6.1, scaleY: 10.8, scaleZ: 5.6, yaw: 2.9, roll: 0.08, sink: 1.65 }),
  formation({ id: 'north-breaker-east', angle: Math.PI * -0.38, coastOffset: 33, scaleX: 9.5, scaleY: 11.1, scaleZ: 8.2, yaw: 0.18, pitch: -0.05, sink: 1.9 }),
  formation({ id: 'north-breaker-west', angle: Math.PI * -0.52, coastOffset: 23, scaleX: 7.0, scaleY: 8.6, scaleZ: 6.2, yaw: 1.36, roll: -0.05, sink: 1.45 }),
  formation({ id: 'north-west-shelf', angle: Math.PI * -0.67, coastOffset: 28, scaleX: 10.2, scaleY: 11.8, scaleZ: 9.1, yaw: 2.22, pitch: 0.04, sink: 2.05 }),
  formation({ id: 'west-breaker-north', angle: Math.PI * -0.82, coastOffset: 17, scaleX: 6.4, scaleY: 8.1, scaleZ: 5.7, yaw: 0.94, roll: 0.06, sink: 1.35 }),
  formation({ id: 'west-breaker-mid', angle: Math.PI * -0.96, coastOffset: 30, scaleX: 8.8, scaleY: 10.6, scaleZ: 7.5, yaw: 2.58, pitch: -0.03, sink: 1.75 }),
  formation({ id: 'west-breaker-south', angle: Math.PI * 0.88, coastOffset: 21, scaleX: 11.8, scaleY: 13.6, scaleZ: 9.8, yaw: 0.7, roll: -0.08, sink: 2.2 }),
  formation({ id: 'south-west-shelf', angle: Math.PI * 0.78, coastOffset: 31, scaleX: 7.5, scaleY: 9.0, scaleZ: 6.5, yaw: 1.74, pitch: 0.05, sink: 1.5 }),
  formation({ id: 'south-east-shelf', angle: Math.PI * 0.69, coastOffset: 26, scaleX: 8.9, scaleY: 10.2, scaleZ: 7.4, yaw: 2.36, roll: 0.05, sink: 1.7 })
]);
