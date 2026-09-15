import * as THREE from 'three';

const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);

const createRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const createTrailCone = ({ name, radius, length, color, opacity, fog }) => {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, length, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog
    })
  );
  mesh.name = name;
  // ConeGeometry points toward +Y. Flip it so the wide luminous base meets the
  // falling-star head and the trail tapers away behind the travel direction.
  mesh.rotation.z = Math.PI;
  mesh.position.y = -length * 0.5;
  return mesh;
};

export const createFallingStarTrailVisual = ({
  namePrefix = 'falling-star',
  outerName = `${namePrefix}-outer-plasma-tail`,
  innerName = `${namePrefix}-inner-plasma-tail`,
  outerLength = 17,
  outerRadius = 1.25,
  innerLength = 12.5,
  innerRadius = 0.58,
  outerColor = 0x1aa8ff,
  innerColor = 0x87eaff,
  accentColor = 0x8f7cff,
  sparkColor = 0x72ddff,
  sparkCount = 38,
  fog = false,
  seed = 0x51f00d
} = {}) => {
  const root = new THREE.Group();
  root.name = `${namePrefix}-falling-star-trail`;

  const outerTail = createTrailCone({
    name: outerName,
    radius: outerRadius,
    length: outerLength,
    color: outerColor,
    opacity: 0.18,
    fog
  });
  root.add(outerTail);

  const innerTail = createTrailCone({
    name: innerName,
    radius: innerRadius,
    length: innerLength,
    color: innerColor,
    opacity: 0.52,
    fog
  });
  root.add(innerTail);

  const streakSpecs = [
    { x: -0.38, z: 0.12, length: outerLength * 0.94, width: 0.065, color: accentColor, opacity: 0.3 },
    { x: 0.31, z: -0.08, length: outerLength * 0.84, width: 0.085, color: innerColor, opacity: 0.36 },
    { x: -0.12, z: -0.34, length: outerLength * 0.7, width: 0.055, color: accentColor, opacity: 0.24 },
    { x: 0.14, z: 0.3, length: outerLength * 0.62, width: 0.05, color: innerColor, opacity: 0.3 }
  ];
  const streaks = streakSpecs.map((spec, index) => {
    const streak = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width, spec.length, spec.width),
      new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog
      })
    );
    streak.name = `${namePrefix}-light-streak-${index}`;
    streak.position.set(spec.x, -spec.length * 0.52, spec.z);
    root.add(streak);
    return { mesh: streak, baseOpacity: spec.opacity };
  });

  const random = createRandom(seed);
  const sparkPositions = new Float32Array(Math.max(1, sparkCount) * 3);
  for (let index = 0; index < sparkCount; index += 1) {
    const offset = index * 3;
    const distance = 0.65 + random() * outerLength * 0.92;
    const spread = 0.14 + (distance / outerLength) * outerRadius * 1.25;
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.62) * spread;
    sparkPositions[offset] = Math.cos(angle) * radius;
    sparkPositions[offset + 1] = -distance;
    sparkPositions[offset + 2] = Math.sin(angle) * radius;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(
    sparkGeometry,
    new THREE.PointsMaterial({
      color: sparkColor,
      size: Math.max(0.085, outerRadius * 0.13),
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog
    })
  );
  sparks.name = `${namePrefix}-spark-particles`;
  root.add(sparks);

  const update = ({ elapsed = 0, progress = 0, intensity = 1 } = {}) => {
    const t = clamp01(progress);
    const strength = clamp01(intensity);
    const plasmaFlicker = 1 + Math.sin(elapsed * 24) * 0.075;
    const innerPulse = 1 + Math.sin(elapsed * 18 + 0.6) * 0.055;

    outerTail.scale.set(plasmaFlicker, 0.92 + t * 0.24, plasmaFlicker);
    innerTail.scale.set(innerPulse, 0.95 + t * 0.32, innerPulse);
    outerTail.material.opacity = (0.16 + t * 0.14) * strength;
    innerTail.material.opacity = (0.46 + t * 0.18) * strength;

    streaks.forEach(({ mesh, baseOpacity }, index) => {
      const flicker = 0.82 + Math.sin(elapsed * (15 + index * 2.7) + index) * 0.18;
      mesh.material.opacity = baseOpacity * flicker * strength;
      mesh.scale.y = 0.9 + t * (0.18 + index * 0.025);
    });

    sparks.material.opacity = (0.58 + t * 0.28) * (0.88 + Math.sin(elapsed * 13) * 0.12) * strength;
    sparks.rotation.y = elapsed * 0.36;
  };

  return {
    root,
    outerTail,
    innerTail,
    streaks: streaks.map(entry => entry.mesh),
    sparks,
    update
  };
};
