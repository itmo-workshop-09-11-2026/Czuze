"use strict";

const productModelViewer = (() => {
  const dialog = document.querySelector("#product-model-dialog");
  const canvas = document.querySelector("#product-model");
  const angle = document.querySelector("#product-model-angle");
  const reset = document.querySelector("#product-model-reset");
  const launch = document.querySelector("#product-model-launch");
  const spin = document.querySelector("#product-model-spin");
  const models = {
    duck: { make: makeDuck, yaw: -0.27, pitch: -0.12, tint: "#30492a" },
    escape: { make: makeKey, yaw: -0.37, pitch: 0.49, tint: "#374b1b", label: { text: "Esc", origin: [0, 0.422, 0], down: [0, 0, 1], normal: [0, 1, 0], color: "#243818" } },
    coffee: { make: makeCoffee, yaw: 0.23, pitch: 0.19, tint: "#493122", label: { text: ">_", origin: [0, 0.02, 0.553], down: [0, -1, 0], normal: [0, 0, 1], color: "#dbecad" } },
  };
  let model;
  let yaw, pitch, zoom;
  let context;
  let parts;
  let drag;
  let frame;
  let spinning = false;
  let lastFrame;

  function ellipsoid(center, radii, color, tilt = 0) {
    const [cx, cy, cz] = center;
    const [rx, ry, rz] = radii;
    const cosine = Math.cos(tilt);
    const sine = Math.sin(tilt);
    const columns = 24;
    const rows = 14;
    const vertices = [];
    const faces = [];
    for (let row = 0; row <= rows; row++) {
      const latitude = Math.PI * row / rows;
      for (let column = 0; column < columns; column++) {
        const longitude = 2 * Math.PI * column / columns;
        const x = Math.sin(latitude) * Math.cos(longitude);
        const y = Math.cos(latitude);
        const z = Math.sin(latitude) * Math.sin(longitude);
        vertices.push([cx + x * rx * cosine - y * ry * sine, cy + x * rx * sine + y * ry * cosine, cz + z * rz]);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const next = (column + 1) % columns;
        const indices = [row * columns + column, row * columns + next, (row + 1) * columns + next, (row + 1) * columns + column];
        const latitude = Math.PI * (row + 0.5) / rows;
        const longitude = 2 * Math.PI * (column + 0.5) / columns;
        const x = Math.sin(latitude) * Math.cos(longitude) / rx;
        const y = Math.cos(latitude) / ry;
        const z = Math.sin(latitude) * Math.sin(longitude) / rz;
        const length = Math.hypot(x, y, z);
        faces.push({ indices, normal: [(x * cosine - y * sine) / length, (x * sine + y * cosine) / length, z / length] });
      }
    }
    return { vertices, faces, color };
  }

  function makeDuck() {
    const gold = [255, 202, 49];
    const amber = [244, 171, 34];
    const orange = [245, 114, 25];
    const parts = [
      ellipsoid([0.12, -0.30, 0], [0.86, 0.49, 0.54], gold),
      ellipsoid([0.74, -0.14, 0], [0.39, 0.22, 0.31], gold, 0.68),
      ellipsoid([-0.43, 0.37, 0], [0.51, 0.55, 0.43], gold),
      ellipsoid([-0.93, 0.20, 0], [0.32, 0.105, 0.28], [211, 82, 16], 0.09),
      ellipsoid([-0.96, 0.29, 0], [0.33, 0.105, 0.28], orange, -0.12),
    ];
    for (const side of [-1, 1]) {
      parts.push(
        ellipsoid([0.20, -0.22, side * 0.43], [0.49, 0.23, 0.14], amber, 0.14),
        ellipsoid([-0.60, 0.50, side * 0.38], [0.079, 0.102, 0.062], [28, 22, 14]),
        ellipsoid([-0.625, 0.535, side * 0.429], [0.024, 0.029, 0.016], [255, 249, 218]),
      );
    }
    return parts;
  }

  function turnedShape(profile, color, sides = 36, square = 1) {
    const vertices = [];
    const faces = [];
    const power = value => Math.sign(value) * Math.abs(value) ** square;
    for (const [y, radius] of profile) {
      for (let i = 0; i < sides; i++) {
        const theta = i * Math.PI * 2 / sides;
        vertices.push([radius * power(Math.cos(theta)), y, radius * power(Math.sin(theta))]);
      }
    }
    for (let row = 0; row < profile.length - 1; row++) {
      const [y, radius] = profile[row];
      const [nextY, nextRadius] = profile[row + 1];
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        const first = row * sides + i;
        const second = row * sides + j;
        const top = (row + 1) * sides;
        const [ax, , az] = vertices[radius ? first : top + i];
        const [bx, , bz] = vertices[radius ? second : top + j];
        const dx = bx - ax, dz = bz - az;
        const slope = Math.hypot(dx, dz) * (nextRadius - radius) / (radius || nextRadius);
        const normal = [dz * (nextY - y), -slope, -dx * (nextY - y)];
        const length = Math.hypot(...normal);
        faces.push({ indices: [first, second, top + j, top + i], normal: normal.map(value => value / length) });
      }
    }
    return { vertices, faces, color };
  }

  function makeKey() {
    return [
      turnedShape([[-0.42, 0], [-0.42, 0.83], [-0.37, 0.91], [-0.18, 0.91], [-0.14, 0.88], [-0.14, 0]], [85, 126, 39], 48, 0.23),
      turnedShape([[-0.23, 0], [-0.23, 0.87], [-0.14, 0.88], [0.34, 0.72], [0.42, 0.65], [0.42, 0]], [186, 240, 75], 48, 0.23),
    ];
  }

  function makeCoffee() {
    return [
      turnedShape([[-0.89, 0], [-0.89, 0.37], [-0.83, 0.42], [0.67, 0.57], [0.72, 0.56], [0.72, 0]], [213, 158, 105]),
      turnedShape([[-0.41, 0.46], [-0.39, 0.48], [0.33, 0.55], [0.36, 0.54]], [112, 61, 41]),
      turnedShape([[0.62, 0], [0.62, 0.59], [0.68, 0.64], [0.75, 0.64], [0.80, 0.59], [0.91, 0.53], [0.93, 0.50], [0.93, 0]], [53, 57, 53]),
      ellipsoid([0.13, 0.932, 0.29], [0.12, 0.014, 0.058], [16, 18, 16]),
    ];
  }

  function draw() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rotate = ([x, y, z]) => {
      const depth = -x * sy + z * cy;
      return [x * cy + z * sy, y * cp - depth * sp, y * sp + depth * cp];
    };
    const scale = 172 * zoom;
    const project = ([x, y]) => [360 + x * scale, 253 - y * scale];
    const visible = [];
    for (const { vertices, faces, color } of parts) {
      const points = vertices.map(rotate);
      for (const { indices, normal } of faces) {
        const [x, y, z] = rotate(normal);
        if (z <= 0) continue;
        const corners = indices.map(index => points[index]);
        const depth = corners.reduce((sum, point) => sum + point[2], 0) / corners.length;
        const light = Math.max(0, -0.33 * x + 0.62 * y + 0.71 * z);
        visible.push({ corners, depth, color, light });
      }
    }
    visible.sort((a, b) => a.depth - b.depth);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0a100ab8";
    context.beginPath();
    context.ellipse(360, Math.min(472, 253 + 164 * zoom), 140 * zoom, 17 * zoom, 0, 0, Math.PI * 2);
    context.fill();
    for (const { corners, color, light } of visible) {
      const channels = color.map(channel => Math.min(255, Math.round(channel * (0.48 + light * 0.55) + 39 * light ** 18)));
      context.fillStyle = context.strokeStyle = `rgb(${channels.join(",")})`;
      context.lineWidth = 0.9;
      context.beginPath();
      corners.forEach((corner, index) => {
        const [screenX, screenY] = project(corner);
        if (index === 0) context.moveTo(screenX, screenY);
        else context.lineTo(screenX, screenY);
      });
      context.closePath();
      context.fill();
      context.stroke();
    }
    const label = model.label;
    if (label && rotate(label.normal)[2] > 0.09) {
      const [lx, ly, lz] = label.origin;
      const [x, y] = project(rotate(label.origin));
      const [xx, xy] = project(rotate([lx + 1, ly, lz]));
      const [dx, dy] = project(rotate(label.origin.map((value, index) => value + label.down[index])));
      context.save();
      context.transform(xx - x, xy - y, dx - x, dy - y, x, y);
      context.fillStyle = label.color;
      context.font = "bold 0.46px monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label.text, 0, 0);
      context.restore();
    }
    const degrees = radians => Math.round(radians * 180 / Math.PI);
    angle.textContent = `${degrees(yaw)}° / ${degrees(pitch)}° · ${Math.round(zoom * 100)}%`;
  }

  function animate(now) {
    frame = undefined;
    if (!dialog.open) return;
    if (spinning && lastFrame !== undefined) {
      yaw += Math.min(40, now - lastFrame) * 0.00085;
      if (yaw > Math.PI) yaw -= 2 * Math.PI;
    }
    lastFrame = now;
    draw();
    if (spinning) scheduleDraw();
  }

  function scheduleDraw() {
    if (frame === undefined) frame = requestAnimationFrame(animate);
  }

  function setSpin(active) {
    spinning = active;
    lastFrame = undefined;
    spin.setAttribute("aria-pressed", active);
    spin.textContent = active ? "Пауза" : "Автовращение";
    scheduleDraw();
  }

  function turn(horizontal, vertical = 0) {
    setSpin(false);
    yaw = Math.atan2(Math.sin(yaw + horizontal), Math.cos(yaw + horizontal));
    pitch = Math.max(-1.15, Math.min(1.15, pitch + vertical));
  }

  function changeZoom(direction) {
    zoom = Math.max(0.72, Math.min(1.34, zoom + direction * 0.1));
    scheduleDraw();
  }

  launch.addEventListener("click", () => {
    dialog.showModal();
    context ??= canvas.getContext("2d");
    if (!context) {
      canvas.hidden = true;
      document.querySelector("#product-model-unavailable").hidden = false;
      dialog.querySelector(".model-controls").hidden = true;
      return;
    }
    parts ??= model.make();
    draw();
    canvas.focus();
  });

  canvas.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    setSpin(false);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    turn((event.clientX - drag.x) * 0.012, (event.clientY - drag.y) * 0.012);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", () => {
    drag = undefined;
    canvas.classList.remove("dragging");
  });
  canvas.addEventListener("keydown", event => {
    if (["+", "=", "-", "−"].includes(event.key)) {
      event.preventDefault();
      changeZoom(event.key === "+" || event.key === "=" ? 1 : -1);
      return;
    }
    const directions = { ArrowLeft: [-0.22, 0], ArrowRight: [0.22, 0], ArrowUp: [0, -0.16], ArrowDown: [0, 0.16] };
    if (!Object.hasOwn(directions, event.key)) return;
    event.preventDefault();
    turn(...directions[event.key]);
  });
  dialog.querySelectorAll("[data-model-turn]").forEach(button => {
    button.addEventListener("click", () => turn(Number(button.dataset.modelTurn) * 0.28));
  });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    changeZoom(-Math.sign(event.deltaY));
  }, { passive: false });
  dialog.querySelectorAll("[data-model-zoom]").forEach(button => {
    button.addEventListener("click", () => changeZoom(Number(button.dataset.modelZoom)));
  });
  spin.addEventListener("click", () => setSpin(!spinning));
  dialog.addEventListener("close", () => setSpin(false));

  function resetView() {
    yaw = model.yaw;
    pitch = model.pitch;
    zoom = 1;
    setSpin(false);
  }
  reset.addEventListener("click", resetView);

  return {
    select(product) {
      model = Object.hasOwn(models, product.id) ? models[product.id] : undefined;
      launch.hidden = !model;
      if (!model) return;
      parts = undefined;
      document.querySelector("#product-model-title").textContent = product.name + " в 3D";
      canvas.style.setProperty("--model-tint", model.tint);
      resetView();
    },
  };
})();
