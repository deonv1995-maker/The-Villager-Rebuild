export const CELESTIAL_PRESENTATION = Object.freeze({
  orbitRadius: 360,
  horizonFadeStart: -0.08,
  horizonFadeEnd: 0.045,
  orbitAzimuthRadians: Math.PI * 0.16,
  lightDistance: 48,
  sun: Object.freeze({
    radius: 11.5,
    color: 0xffefb0,
    haloColor: 0xffd776,
    haloScale: 1.75,
    haloOpacity: 0.17
  }),
  moon: Object.freeze({
    radius: 8.5,
    color: 0xdde8f2,
    haloColor: 0xa9c9ea,
    haloScale: 1.55,
    haloOpacity: 0.09
  })
});
