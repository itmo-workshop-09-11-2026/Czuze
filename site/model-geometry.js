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

  function makeKey(style = "lime", legend = "Esc", width = 1) {
    const colors = { lime: [0.72, 0.94, 0.25], ice: [0.34, 0.65, 0.94], violet: [0.65, 0.40, 0.89] };
    const plastic = { color: colors[style], roughness: 0.32, grain: 1 };
    const dark = { color: [0.18, 0.27, 0.07], roughness: 0.45 };
    const parts = [
      turnedShape([[-0.43, 0], [-0.43, 0.81], [-0.415, 0.86], [-0.38, 0.9], [-0.30, 0.91], [-0.18, 0.9], [-0.15, 0.87], [-0.15, 0]], dark, 0.23),
      turnedShape([[-0.24, 0], [-0.24, 0.81], [-0.225, 0.87], [-0.18, 0.885], [-0.13, 0.88], [0.27, 0.745], [0.34, 0.714], [0.388, 0.681], [0.413, 0.64], [0.42, 0.58], [0.42, 0]], plastic, 0.23),
      turnedShape([[-0.43, 0], [-0.43, 0.24], [-0.55, 0.24], [-0.55, 0]], dark, 0.2),
      label(legend, [0.09, 0.14, 0.025], (u, v) => ({ position: [(u - 0.5) * 0.94, 0.423, (v - 0.5) * 0.5], normal: [0, 1, 0] })),
    ];
    return parts.map(part => scale(part, [width, 1, 1]));
  }

  function makeCoffee(style = "classic") {
    const styles = {
      classic: [[0.73, 0.49, 0.28], [0.09, 0.105, 0.09], [0.27, 0.10, 0.055], ">_"],
      winter: [[0.94, 0.89, 0.78], [0.82, 0.85, 0.79], [0.60, 0.04, 0.08], "❄"],
      night: [[0.09, 0.11, 0.14], [0.035, 0.045, 0.055], [0.06, 0.23, 0.24], "</>"],
    };
    const [paperColor, lidColor, sleeveColor, legend] = styles[style];
    const paper = { color: paperColor, roughness: 0.85, grain: 1 };
    const lid = { color: lidColor, roughness: 0.32 };
    const sleeve = { color: sleeveColor, roughness: 0.8, grain: style === "winter" ? 2 : 1 };
    const parts = [
      turnedShape([[-0.90, 0], [-0.90, 0.34], [-0.89, 0.38], [-0.85, 0.41], [-0.79, 0.423], [0.62, 0.565], [0.67, 0.572], [0.69, 0.555], [0.69, 0]], paper),
      turnedShape([[-0.42, 0.465], [-0.41, 0.48], [-0.38, 0.484], [0.32, 0.552], [0.35, 0.55], [0.36, 0.537]], sleeve),
      turnedShape([[0.63, 0], [0.63, 0.58], [0.64, 0.62], [0.66, 0.638], [0.71, 0.64], [0.73, 0.633], [0.75, 0.60], [0.77, 0.59], [0.84, 0.548], [0.89, 0.53], [0.92, 0.50], [0.93, 0.47], [0.93, 0]], lid),
      ring([0, -0.865, 0], [0.395, 0.395], 0.012, paper),
      ring([0, 0.685, 0], [0.64, 0.64], 0.012, lid),
      ring([0, 0.89, 0], [0.523, 0.523], 0.009, lid),
      ring([0, 0.927, 0], [0.43, 0.43], 0.005, lid),
      ellipsoid([0.13, 0.932, 0.29], [0.115, 0.013, 0.054], { color: [0.008, 0.009, 0.008], roughness: 0.95 }, 0, 80, 32),
      label(legend, [0.82, 0.92, 0.59], (u, v) => {
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

  function scale(part, factors) {
    for (let vertex = 0; vertex < part.vertices.length; vertex += 8) {
      const normal = [];
      for (let axis = 0; axis < 3; axis++) {
        part.vertices[vertex + axis] *= factors[axis];
        normal.push(part.vertices[vertex + 3 + axis] / factors[axis]);
      }
      part.vertices.set(normalize(normal), vertex + 3);
    }
    return part;
  }

  function rotateX(part, tilt) {
    const cosine = Math.cos(tilt), sine = Math.sin(tilt);
    for (let vertex = 0; vertex < part.vertices.length; vertex += 8) {
      for (const offset of [0, 3]) {
        const y = part.vertices[vertex + offset + 1], z = part.vertices[vertex + offset + 2];
        part.vertices[vertex + offset + 1] = y * cosine - z * sine;
        part.vertices[vertex + offset + 2] = y * sine + z * cosine;
      }
    }
    return part;
  }

  function box(center, radii, material, tilt = 0, columns = 128) {
    const part = turnedShape([[-1, 0], [-1, 0.90], [-0.98, 0.97], [-0.94, 1], [0.94, 1], [0.98, 0.97], [1, 0.90], [1, 0]], material, 0.16, columns);
    return place(scale(part, radii), center, tilt);
  }

  function frontLabel(text, color, center, width, height, tilt = 0) {
    return place(label(text, color, (u, v) => ({
      position: [(u - 0.5) * width, (0.5 - v) * height, 0], normal: [0, 0, 1],
    })), center, tilt);
  }

  function makeNotebook(style = "violet") {
    const colors = { violet: [0.43, 0.27, 0.66], graphite: [0.12, 0.15, 0.18], lime: [0.58, 0.76, 0.20] };
    const cover = { color: colors[style], roughness: 0.65, grain: 1 };
    const paper = { color: [0.89, 0.87, 0.78], roughness: 0.95 };
    const steel = { color: [0.49, 0.55, 0.57], roughness: 0.18 };
    const parts = [
      box([0, 0, 0], [0.57, 0.80, 0.075], paper),
      box([0, 0, -0.09], [0.61, 0.84, 0.025], cover),
      box([0, 0, 0.09], [0.61, 0.84, 0.025], cover),
      frontLabel("STACK\nTRACE", [0.9, 0.92, 0.82], [0.06, 0.17, 0.117], 0.78, 0.38),
      frontLabel("</>", [0.9, 0.92, 0.82], [0.06, 0.51, 0.117], 0.34, 0.17),
    ];
    for (let page = 0; page < 7; page++) {
      parts.push(box([0, 0, -0.057 + page * 0.019], [0.574, 0.801, 0.002], { color: [0.67, 0.65, 0.60], roughness: 1 }));
    }
    for (let loop = 0; loop < 12; loop++) {
      parts.push(ring([-0.59, -0.72 + loop * 0.13, 0], [0.085, 0.13], 0.018, steel, 0, 64));
    }
    return parts;
  }

  function makeMat(style = "target") {
    const styles = {
      target: [[0.055, 0.23, 0.20], [0.49, 0.83, 0.65], "◉"],
      terminal: [[0.075, 0.09, 0.12], [0.74, 0.96, 0.34], ">_"],
      neon: [[0.22, 0.09, 0.32], [0.80, 0.52, 0.99], "⌘"],
    };
    const [color, edge, legend] = styles[style];
    return [
      box([0, -0.03, 0], [1.13, 0.05, 0.68], { color: [0.04, 0.05, 0.045], roughness: 1 }),
      box([0, 0.005, 0], [1.13, 0.023, 0.68], { color: edge, roughness: 0.9 }),
      box([0, 0.03, 0], [1.10, 0.018, 0.65], { color, roughness: 0.95, grain: 2 }),
      label(legend, edge, (u, v) => ({ position: [(u - 0.5) * 1.05, 0.05, (v - 0.5) * 0.55], normal: [0, 1, 0] })),
    ];
  }

  function makeMug(style = "coffee") {
    const styles = {
      coffee: [[0.91, 0.57, 0.35], [0.11, 0.055, 0.025], "✓"],
      tea: [[0.29, 0.56, 0.39], [0.47, 0.25, 0.075], "leaf"],
      cocoa: [[0.63, 0.38, 0.65], [0.29, 0.13, 0.065], "♥"],
    };
    const [color, drink, legend] = styles[style];
    const ceramic = { color, roughness: 0.21 };
    const parts = [
      turnedShape([[-0.64, 0], [-0.64, 0.36], [-0.61, 0.43], [-0.54, 0.48], [0.53, 0.52], [0.57, 0.51], [0.59, 0.49], [0.57, 0.465], [0.51, 0.458], [-0.48, 0.42], [-0.51, 0.35], [-0.51, 0]], ceramic),
      place(rotateX(ring([0, 0, 0], [0.28, 0.37], 0.082, ceramic), Math.PI / 2), [0.60, -0.02, 0]),
      turnedShape([[0.42, 0.464], [0.42, 0]], { color: drink, roughness: 0.18 }),
      label(legend === "leaf" ? "❧" : legend, [0.14, 0.19, 0.10], (u, v) => {
        const theta = (u - 0.5) * 1.05;
        const y = 0.23 - v * 0.48;
        const radius = 0.502 + y * 0.038;
        return { position: [Math.sin(theta) * radius, y, Math.cos(theta) * radius], normal: [Math.sin(theta), -0.038, Math.cos(theta)] };
      }),
    ];
    if (style === "cocoa") {
      const marshmallow = { color: [0.98, 0.93, 0.85], roughness: 0.8 };
      for (const [x, z, tilt] of [[-0.15, -0.11, 0.3], [0.15, -0.02, -0.25], [-0.06, 0.18, -0.1]]) {
        parts.push(box([x, 0.46, z], [0.09, 0.065, 0.075], marshmallow, tilt));
      }
    }
    return parts;
  }

  function makeStickers(style = "code") {
    const icons = {
      code: ["</>", "{ }", ">_", "#", "git", "✓"],
      space: ["★", "☾", "∞", "☄", "01", "✦"],
      winter: ["❄", "★", "25", "♥", "✦", "☃"],
    };
    const colors = [[0.60, 0.40, 0.87], [0.55, 0.81, 0.25], [0.25, 0.72, 0.72], [0.96, 0.61, 0.32], [0.91, 0.43, 0.59], [0.45, 0.64, 0.90]];
    const parts = [box([0, 0, 0], [0.62, 0.84, 0.025], { color: [0.96, 0.94, 0.87], roughness: 0.75, grain: 1 })];
    for (let sticker = 0; sticker < 6; sticker++) {
      const x = sticker % 2 ? 0.29 : -0.29;
      const y = 0.53 - Math.floor(sticker / 2) * 0.51;
      const tilt = sticker % 2 ? -0.08 : 0.09;
      const symbol = icons[style][sticker];
      const singleSymbol = [...symbol].length === 1;
      parts.push(
        box([x, y, 0.033], [0.235, 0.195, 0.009], { color: colors[sticker], roughness: 0.5 }, tilt),
        frontLabel(symbol, [0.08, 0.11, 0.12], [x, y, 0.044], singleSymbol ? 0.8 : 0.40, singleSymbol ? 0.40 : 0.23, tilt),
      );
    }
    return parts;
  }

  function makeTimer(style = "25") {
    const minutes = Number(style);
    const plastic = { color: [0.24, 0.45, 0.72], roughness: 0.32 };
    const dark = { color: [0.07, 0.13, 0.19], roughness: 0.55 };
    const parts = [
      rotateX(turnedShape([[-0.19, 0], [-0.19, 0.50], [-0.17, 0.59], [-0.10, 0.65], [0.12, 0.65], [0.18, 0.61], [0.20, 0.55], [0.20, 0]], plastic), Math.PI / 2),
      rotateX(turnedShape([[0.205, 0.55], [0.205, 0]], { color: [0.94, 0.92, 0.83], roughness: 0.75 }), Math.PI / 2),
      box([0, -0.67, 0], [0.44, 0.06, 0.28], dark),
    ];
    parts.push(surface((u, v) => {
      const theta = Math.PI / 2 - u * minutes / 60 * Math.PI * 2;
      return { position: [Math.cos(theta) * v * 0.51, Math.sin(theta) * v * 0.51, 0.207], normal: [0, 0, 1] };
    }, 120, 4, { color: [0.90, 0.36, 0.20], roughness: 0.75 }));
    for (let tick = 0; tick < 60; tick++) {
      const theta = tick * Math.PI / 30;
      const major = tick % 5 === 0;
      parts.push(box([Math.sin(theta) * 0.48, Math.cos(theta) * 0.48, 0.212], [major ? 0.007 : 0.004, major ? 0.033 : 0.018, 0.002], dark, -theta, 16));
    }
    for (const value of [0, 15, 30, 45]) {
      const theta = value * Math.PI / 30;
      parts.push(frontLabel(String(value), [0.08, 0.12, 0.16], [Math.sin(theta) * 0.36, Math.cos(theta) * 0.36, 0.216], 0.12, 0.07));
    }
    const theta = minutes * Math.PI / 30;
    parts.push(
      box([Math.sin(theta) * 0.16, Math.cos(theta) * 0.16, 0.227], [0.015, 0.23, 0.009], dark, -theta),
      ellipsoid([0, 0, 0.25], [0.07, 0.07, 0.035], plastic, 0, 64, 32),
    );
    return parts;
  }

  const models = {
    duck: {
      make: style => [...makeDuck(), ...makeHat(style)], yaw: -0.27, pitch: 0.10, tint: "#30492a",
      optionLabel: "Новогодняя шапка",
      options: [["none", "Без шапки"], ["santa", "Шапка Санты"], ["tree", "Праздничная ёлочка"], ["winter", "Зимняя с помпоном"]],
    },
    escape: {
      make: makeKey, yaw: -0.37, pitch: 0.49, tint: "#374b1b",
      optionLabel: "Цвет клавиши",
      options: [["lime", "Лайм"], ["ice", "Лёд"], ["violet", "Фиолетовый"]],
    },
    coffee: {
      make: makeCoffee, yaw: 0.23, pitch: 0.19, tint: "#493122",
      optionLabel: "Оформление стакана",
      options: [["classic", "Классический"], ["winter", "Зимний"], ["night", "Ночной"]],
    },
    notebook: {
      make: makeNotebook, yaw: -0.30, pitch: 0.12, tint: "#352548",
      optionLabel: "Обложка",
      options: [["violet", "Фиолетовая"], ["graphite", "Графит"], ["lime", "Лайм"]],
    },
    enter: {
      make: style => makeKey(style, "↵", 1.45), yaw: -0.37, pitch: 0.49, tint: "#263c56",
      optionLabel: "Цвет клавиши",
      options: [["ice", "Лёд"], ["lime", "Лайм"], ["violet", "Фиолетовый"]],
    },
    mouse: {
      make: makeMat, yaw: -0.26, pitch: 0.65, tint: "#204039",
      optionLabel: "Рисунок коврика",
      options: [["target", "Прицел"], ["terminal", "Терминал"], ["neon", "Неон"]],
    },
    mug: {
      make: makeMug, yaw: -0.23, pitch: 0.20, tint: "#453126",
      optionLabel: "Напиток и оформление",
      options: [["coffee", "Кофе"], ["tea", "Чай"], ["cocoa", "Какао с маршмеллоу"]],
    },
    stickers: {
      make: makeStickers, yaw: -0.20, pitch: 0.10, tint: "#363747",
      optionLabel: "Набор стикеров",
      options: [["code", "Код"], ["space", "Космос"], ["winter", "Новый год"]],
    },
    timer: {
      make: makeTimer, yaw: -0.22, pitch: 0.12, tint: "#263c56",
      optionLabel: "Положение таймера",
      options: [["25", "25 минут"], ["15", "15 минут"], ["50", "50 минут"]],
    },
  };

  return { makeDuck, makeKey, makeCoffee, makeHat, models };
})();
