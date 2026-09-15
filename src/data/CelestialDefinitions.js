export const CELESTIAL_PRESENTATION = Object.freeze({
  orbitRadius: 360,
  horizonFadeStart: -0.08,
  horizonFadeEnd: 0.045,
  orbitAzimuthRadians: Math.PI * 0.16,
  lightDistance: 48,
  sun: Object.freeze({
    radius: 16,
    color: 0xffefb0,
    haloColor: 0xffd776,
    haloScale: 1.65,
    haloOpacity: 0.17,
    rays: Object.freeze({
      count: 12,
      color: 0xffd36d,
      opacity: 0.2,
      innerRadiusScale: 1.12,
      outerRadiusScale: 1.72,
      halfWidthRadians: 0.045,
      rotationPerGameMinute: 0.0012,
      pulsePeriodGameMinutes: 36,
      pulseAmount: 0.12
    })
  }),
  moon: Object.freeze({
    radius: 13,
    color: 0xe4e9e8,
    haloColor: 0xb4cde4,
    haloScale: 1.48,
    haloOpacity: 0.1,
    surfaceMarkColor: 0xaeb9bc,
    surfaceMarkOpacity: 0.22,
    surfaceMarks: Object.freeze([
      Object.freeze({ x: -0.3, y: 0.22, radius: 0.18, scaleX: 1.18, scaleY: 0.84 }),
      Object.freeze({ x: 0.22, y: 0.18, radius: 0.13, scaleX: 0.9, scaleY: 1.12 }),
      Object.freeze({ x: 0.15, y: -0.27, radius: 0.2, scaleX: 1.16, scaleY: 0.88 }),
      Object.freeze({ x: -0.37, y: -0.2, radius: 0.1, scaleX: 1, scaleY: 0.92 }),
      Object.freeze({ x: 0.39, y: 0.34, radius: 0.075, scaleX: 0.92, scaleY: 1.08 })
    ])
  })
});
