"use strict";

{
  const dialog = document.querySelector("#duck-model-dialog");
  const canvas = document.querySelector("#duck-model");
  const angle = document.querySelector("#duck-model-angle");
  const reset = document.querySelector("#duck-model-reset");
  const startYaw = -0.27;
  const startPitch = -0.12;
  let yaw = startYaw;
  let pitch = startPitch;
  let context;
  let parts;
  let drag;
  let frame;

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

  function draw() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rotate = ([x, y, z]) => {
      const depth = -x * sy + z * cy;
      return [x * cy + z * sy, y * cp - depth * sp, y * sp + depth * cp];
    };
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
    context.ellipse(360, 407, 175, 21, 0, 0, Math.PI * 2);
    context.fill();
    for (const { corners, color, light } of visible) {
      const channels = color.map(channel => Math.min(255, Math.round(channel * (0.48 + light * 0.55) + 39 * light ** 18)));
      context.fillStyle = context.strokeStyle = `rgb(${channels.join(",")})`;
      context.lineWidth = 0.9;
      context.beginPath();
      corners.forEach(([x, y], index) => {
        const screenX = 370 + x * 179;
        const screenY = 258 - y * 179;
        if (index === 0) context.moveTo(screenX, screenY);
        else context.lineTo(screenX, screenY);
      });
      context.closePath();
      context.fill();
      context.stroke();
    }
    const degrees = radians => Math.round(radians * 180 / Math.PI);
    angle.textContent = `${degrees(yaw)}° / ${degrees(pitch)}°`;
  }

  function turn(horizontal, vertical = 0) {
    if (!context) return;
    yaw = Math.atan2(Math.sin(yaw + horizontal), Math.cos(yaw + horizontal));
    pitch = Math.max(-1.15, Math.min(1.15, pitch + vertical));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  document.querySelector("#duck-model-launch").addEventListener("click", () => {
    dialog.showModal();
    context ??= canvas.getContext("2d");
    if (!context) {
      canvas.hidden = true;
      document.querySelector("#duck-model-unavailable").hidden = false;
      dialog.querySelector(".model-controls").hidden = true;
      return;
    }
    parts ??= makeDuck();
    draw();
    canvas.focus();
  });

  canvas.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
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
    const directions = { ArrowLeft: [-0.22, 0], ArrowRight: [0.22, 0], ArrowUp: [0, -0.16], ArrowDown: [0, 0.16] };
    if (!Object.hasOwn(directions, event.key)) return;
    event.preventDefault();
    turn(...directions[event.key]);
  });
  dialog.querySelectorAll("[data-model-turn]").forEach(button => {
    button.addEventListener("click", () => turn(Number(button.dataset.modelTurn) * 0.28));
  });
  reset.addEventListener("click", () => {
    yaw = startYaw;
    pitch = startPitch;
    turn(0);
  });
}
