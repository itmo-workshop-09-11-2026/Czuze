"use strict";

const productGeometry = (() => {
  const rubber = { color: [1, 0.73, 0.075], roughness: 0.28 };
  const white = { color: [0.98, 0.96, 0.86], roughness: 0.8, grain: 2 };
  const red = { color: [0.76, 0.035, 0.065], roughness: 0.8, grain: 2 };
  const gold = { color: [1, 0.64, 0.09], roughness: 0.2 };

  function normalize(vector) {
    const length = Math.hypot(...vector);
    return vector.map(value => value / (length || 1));
  }

  function surface(evaluate, columns, rows, material) {
    const vertices = [];
    const indices = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const v = row / rows;
        const { position, normal } = evaluate(u, v);
        vertices.push(...position, ...normalize(normal), u, v);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = row * (columns + 1) + column;
        const b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), ...material };
  }

  function place(part, center, tilt = 0) {
    const cosine = Math.cos(tilt);
    const sine = Math.sin(tilt);
    for (let index = 0; index < part.vertices.length; index += 8) {
      for (const offset of [0, 3]) {
        const x = part.vertices[index + offset];
        const y = part.vertices[index + offset + 1];
        part.vertices[index + offset] = x * cosine - y * sine;
        part.vertices[index + offset + 1] = x * sine + y * cosine;
      }
      for (let axis = 0; axis < 3; axis++) part.vertices[index + axis] += center[axis];
    }
    return part;
  }

  function ellipsoid(center, radii, material, tilt = 0, columns = 128, rows = 72) {
    const [rx, ry, rz] = radii;
    return place(surface((u, v) => {
      const latitude = Math.PI * v;
      const longitude = Math.PI * 2 * u;
      const x = Math.sin(latitude) * Math.cos(longitude);
      const y = Math.cos(latitude);
      const z = Math.sin(latitude) * Math.sin(longitude);
      return { position: [x * rx, y * ry, z * rz], normal: [x / rx, y / ry, z / rz] };
    }, columns, rows, material), center, tilt);
  }

  function turnedShape(profile, material, square = 1, columns = 160) {
    const power = value => Math.sign(value) * Math.abs(value) ** square;
    const rows = (profile.length - 1) * 4;
    return surface((u, v) => {
      const segment = Math.min(profile.length - 2, Math.floor(v * (profile.length - 1)));
      const blend = v * (profile.length - 1) - segment;
      const [y0, r0] = profile[segment];
      const [y1, r1] = profile[segment + 1];
      const y = y0 + (y1 - y0) * blend;
      const radius = r0 + (r1 - r0) * blend;
      const theta = Math.PI * 2 * u;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const x = power(cosine), z = power(sine);
      const dx = -sine * square * Math.max(0.000001, Math.abs(cosine)) ** (square - 1);
      const dz = cosine * square * Math.max(0.000001, Math.abs(sine)) ** (square - 1);
      const height = y1 - y0, taper = r1 - r0;
      return {
        position: [radius * x, y, radius * z],
        normal: [height * dz, taper * (z * dx - x * dz), -height * dx],
      };
    }, columns, rows, material);
  }

  function ring(center, radii, tube, material, tilt = 0, columns = 128) {
    return place(surface((u, v) => {
      const theta = Math.PI * 2 * u;
      const phi = Math.PI * 2 * v;
      const cosine = Math.cos(theta), sine = Math.sin(theta);
      return {
        position: [(radii[0] + tube * Math.cos(phi)) * cosine, tube * Math.sin(phi), (radii[1] + tube * Math.cos(phi)) * sine],
        normal: [Math.cos(phi) * cosine, Math.sin(phi), Math.cos(phi) * sine],
      };
    }, columns, 24, material), center, tilt);
  }

  function label(text, color, evaluate) {
    return surface(evaluate, 48, 8, { color, roughness: 0.85, label: text });
  }

  function makeDuck() {
    const orange = { color: [1, 0.30, 0.025], roughness: 0.33 };
    const eye = { color: [0.018, 0.013, 0.009], roughness: 0.12 };
    const wing = { color: [0.97, 0.61, 0.045], roughness: 0.34 };
    const parts = [
      ellipsoid([0.12, -0.30, 0], [0.86, 0.49, 0.54], rubber),
      ellipsoid([0.74, -0.14, 0], [0.39, 0.22, 0.31], rubber, 0.68),
      ellipsoid([-0.43, 0.37, 0], [0.51, 0.55, 0.43], rubber),
      ellipsoid([-0.93, 0.20, 0], [0.32, 0.09, 0.28], { ...orange, color: [0.78, 0.16, 0.01] }, 0.09),
      ellipsoid([-0.96, 0.29, 0], [0.33, 0.105, 0.28], orange, -0.12),
    ];
    for (const side of [-1, 1]) {
      parts.push(
        ellipsoid([0.20, -0.22, side * 0.465], [0.49, 0.23, 0.13], wing, 0.14),
        ellipsoid([-0.60, 0.50, side * 0.38], [0.079, 0.102, 0.062], eye, 0, 80, 48),
        ellipsoid([-0.625, 0.535, side * 0.429], [0.020, 0.025, 0.013], white, 0, 48, 32),
        ellipsoid([-1.035, 0.355, side * 0.13], [0.018, 0.008, 0.023], { ...orange, color: [0.36, 0.08, 0.01] }, -0.12, 48, 24),
      );
      for (let feather = 0; feather < 3; feather++) {
        parts.push(ellipsoid([0.17 + feather * 0.12, -0.25 + feather * 0.01, side * 0.579], [0.13, 0.015, 0.012], wing, 0.28, 48, 24));
      }
    }
    return parts;
  }

  function makeKey() {
    const plastic = { color: [0.72, 0.94, 0.25], roughness: 0.32, grain: 1 };
    const dark = { color: [0.18, 0.27, 0.07], roughness: 0.45 };
    return [
      turnedShape([[-0.43, 0], [-0.43, 0.81], [-0.415, 0.86], [-0.38, 0.9], [-0.30, 0.91], [-0.18, 0.9], [-0.15, 0.87], [-0.15, 0]], dark, 0.23),
      turnedShape([[-0.24, 0], [-0.24, 0.81], [-0.225, 0.87], [-0.18, 0.885], [-0.13, 0.88], [0.27, 0.745], [0.34, 0.714], [0.388, 0.681], [0.413, 0.64], [0.42, 0.58], [0.42, 0]], plastic, 0.23),
      turnedShape([[-0.43, 0], [-0.43, 0.24], [-0.55, 0.24], [-0.55, 0]], dark, 0.2),
      label("Esc", [0.09, 0.14, 0.025], (u, v) => ({ position: [(u - 0.5) * 0.94, 0.423, (v - 0.5) * 0.5], normal: [0, 1, 0] })),
    ];
  }

  function makeCoffee() {
    const paper = { color: [0.73, 0.49, 0.28], roughness: 0.85, grain: 1 };
    const lid = { color: [0.09, 0.105, 0.09], roughness: 0.32 };
    const sleeve = { color: [0.27, 0.10, 0.055], roughness: 0.8, grain: 1 };
    const parts = [
      turnedShape([[-0.90, 0], [-0.90, 0.34], [-0.89, 0.38], [-0.85, 0.41], [-0.79, 0.423], [0.62, 0.565], [0.67, 0.572], [0.69, 0.555], [0.69, 0]], paper),
      turnedShape([[-0.42, 0.465], [-0.41, 0.48], [-0.38, 0.484], [0.32, 0.552], [0.35, 0.55], [0.36, 0.537]], sleeve),
      turnedShape([[0.63, 0], [0.63, 0.58], [0.64, 0.62], [0.66, 0.638], [0.71, 0.64], [0.73, 0.633], [0.75, 0.60], [0.77, 0.59], [0.84, 0.548], [0.89, 0.53], [0.92, 0.50], [0.93, 0.47], [0.93, 0]], lid),
      ring([0, -0.865, 0], [0.395, 0.395], 0.012, paper),
      ring([0, 0.685, 0], [0.64, 0.64], 0.012, lid),
      ring([0, 0.89, 0], [0.523, 0.523], 0.009, lid),
      ring([0, 0.927, 0], [0.43, 0.43], 0.005, lid),
      ellipsoid([0.13, 0.932, 0.29], [0.115, 0.013, 0.054], { color: [0.008, 0.009, 0.008], roughness: 0.95 }, 0, 80, 32),
      label(">_", [0.82, 0.92, 0.59], (u, v) => {
        const theta = (u - 0.5) * 1.3;
        const y = 0.19 - v * 0.35;
        const radius = 0.523 + y * 0.097;
        return { position: [Math.sin(theta) * radius, y, Math.cos(theta) * radius], normal: [Math.sin(theta), -0.097, Math.cos(theta)] };
      }),
    ];
    for (let groove = 0; groove < 4; groove++) {
      const y = 0.79 + groove * 0.025;
      const radius = 0.58 - groove * 0.015;
      parts.push(ring([0, y, 0], [radius, radius], 0.006, lid));
    }
    return parts;
  }

  function fluffyBrim() {
    const parts = [ring([-0.43, 0.855, 0], [0.355, 0.30], 0.065, white)];
    for (let i = 0; i < 32; i++) {
      const theta = Math.PI * 2 * i / 32;
      parts.push(ellipsoid([-0.43 + 0.355 * Math.cos(theta), 0.855, 0.30 * Math.sin(theta)], [0.071, 0.069, 0.057], white, 0, 32, 24));
    }
    return parts;
  }

  function pompom(center, radius, material) {
    const parts = [ellipsoid(center, [radius, radius, radius], material, 0, 64, 48)];
    for (let i = 0; i < 12; i++) {
      const theta = Math.PI * 2 * i / 12;
      parts.push(ellipsoid([center[0] + radius * 0.75 * Math.cos(theta), center[1], center[2] + radius * 0.75 * Math.sin(theta)], [radius * 0.38, radius * 0.46, radius * 0.38], material, 0, 24, 16));
    }
    return parts;
  }

  function makeHat(style) {
    if (style === "santa") {
      return [
        place(turnedShape([[0, 0], [0, 0.33], [0.12, 0.32], [0.30, 0.25], [0.48, 0.18], [0.63, 0.10], [0.73, 0.03], [0.75, 0]], red), [-0.43, 0.85, 0], -0.29),
        ...fluffyBrim(),
        ...pompom([-0.21, 1.57, 0], 0.125, white),
      ];
    }
    if (style === "tree") {
      const green = { color: [0.045, 0.31, 0.11], roughness: 0.65 };
      const parts = [
        place(turnedShape([[0, 0], [0, 0.39], [0.035, 0.39], [0.34, 0.15], [0.34, 0]], green), [-0.43, 0.84, 0]),
        place(turnedShape([[0, 0], [0, 0.31], [0.035, 0.31], [0.33, 0.10], [0.33, 0]], green), [-0.43, 1.06, 0]),
        place(turnedShape([[0, 0], [0, 0.22], [0.025, 0.22], [0.35, 0]], green), [-0.43, 1.28, 0]),
        ellipsoid([-0.43, 1.65, 0], [0.065, 0.09, 0.065], gold, 0, 48, 32),
      ];
      for (let i = 0; i < 12; i++) {
        const theta = i * 2.4;
        const level = i % 3;
        const radius = 0.29 - level * 0.065;
        parts.push(ellipsoid([-0.43 + radius * Math.cos(theta), 0.99 + level * 0.22, radius * Math.sin(theta)], [0.036, 0.036, 0.036], i % 2 ? gold : red, 0, 32, 20));
      }
      return parts;
    }
    if (style === "winter") {
      const knit = { color: [0.13, 0.26, 0.65], roughness: 0.85, grain: 2 };
      return [
        place(turnedShape([[0, 0], [0, 0.36], [0.12, 0.37], [0.26, 0.32], [0.37, 0.23], [0.44, 0.11], [0.46, 0]], knit), [-0.43, 0.84, 0]),
        ring([-0.43, 0.87, 0], [0.36, 0.31], 0.067, knit),
        ring([-0.43, 0.95, 0], [0.35, 0.31], 0.015, white),
        ...pompom([-0.43, 1.35, 0], 0.105, white),
      ];
    }
    return [];
  }

  return { makeDuck, makeKey, makeCoffee, makeHat };
})();
