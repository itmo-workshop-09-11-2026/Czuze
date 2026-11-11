"use strict";

const productModelViewer = (() => {
  const dialog = document.querySelector("#product-model-dialog");
  const canvas = document.querySelector("#product-model");
  const angle = document.querySelector("#product-model-angle");
  const reset = document.querySelector("#product-model-reset");
  const launch = document.querySelector("#product-model-launch");
  const spin = document.querySelector("#product-model-spin");
  const hats = document.querySelector("#product-model-hat");
  const unavailable = document.querySelector("#product-model-unavailable");
  const models = {
    duck: { make: productGeometry.makeDuck, yaw: -0.27, pitch: 0.10, tint: "#30492a" },
    escape: { make: productGeometry.makeKey, yaw: -0.37, pitch: 0.49, tint: "#374b1b" },
    coffee: { make: productGeometry.makeCoffee, yaw: 0.23, pitch: 0.19, tint: "#493122" },
  };
  let model;
  let yaw, pitch, zoom;
  let renderer;
  let meshes;
  let baseParts;
  let sceneCenter;
  let sceneRadius;
  let drag;
  let frame;
  let spinning = false;
  let lastFrame;

  function createRenderer() {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL unavailable");

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec2 aUv;
      uniform mat3 uRotation;
      uniform vec3 uCenter;
      uniform float uRadius;
      uniform float uZoom;
      uniform float uAspect;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vLocal;
      varying vec2 vUv;
      void main() {
        vec3 position = uRotation * (aPosition - uCenter);
        vPosition = position;
        vLocal = aPosition;
        vNormal = uRotation * aNormal;
        vUv = aUv;
        float scale = uZoom / (uRadius * 1.12);
        gl_Position = vec4(position.x * scale / uAspect, position.y * scale, -position.z / (uRadius * 4.0), 1.0);
      }
    `);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vLocal;
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uRoughness;
      uniform float uGrain;
      uniform float uKind;
      uniform sampler2D uTexture;
      float noise(vec3 point) {
        return fract(sin(dot(point, vec3(12.9898, 78.233, 31.345))) * 43758.5453);
      }
      void main() {
        float alpha = 1.0;
        if (uKind > 0.5) {
          alpha = texture2D(uTexture, vUv).a;
          if (alpha < 0.015) discard;
        }
        if (uKind > 1.5) {
          gl_FragColor = vec4(0.008, 0.015, 0.008, alpha * 0.46);
          return;
        }
        vec3 normal = normalize(vNormal);
        vec3 key = normalize(vec3(-0.6, 0.9, 1.1));
        vec3 fill = normalize(vec3(0.9, 0.3, 0.6));
        vec3 rim = normalize(vec3(0.2, 0.8, -0.9));
        float light = 0.32 + 0.65 * max(dot(normal, key), 0.0)
          + 0.22 * max(dot(normal, fill), 0.0) + 0.18 * max(dot(normal, rim), 0.0);
        vec3 base = pow(uColor, vec3(2.2));
        float surfaceNoise = 1.0;
        if (uGrain > 0.5) {
          surfaceNoise = 0.975 + 0.045 * noise(floor(vLocal * 340.0));
        }
        if (uGrain > 1.5) {
          float rib = sin(vUv.x * 420.0) * sin(vUv.y * 240.0);
          surfaceNoise *= 0.94 + 0.06 * rib;
        }
        vec3 view = vec3(0.0, 0.0, 1.0);
        vec3 halfVector = normalize(key + view);
        float shine = mix(180.0, 18.0, uRoughness);
        float specular = pow(max(dot(normal, halfVector), 0.0), shine)
          * mix(0.42, 0.045, uRoughness);
        float fresnel = pow(1.0 - max(normal.z, 0.0), 4.0) * 0.045;
        vec3 lit = base * light * surfaceNoise + vec3(specular + fresnel);
        gl_FragColor = vec4(pow(lit, vec3(1.0 / 2.2)), alpha);
      }
    `);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(message);
    }
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    const attributes = ["aPosition", "aNormal", "aUv"].map(name => gl.getAttribLocation(program, name));
    const uniforms = Object.fromEntries(
      ["uRotation", "uCenter", "uRadius", "uZoom", "uAspect", "uColor", "uRoughness", "uGrain", "uKind", "uTexture"]
        .map(name => [name, gl.getUniformLocation(program, name)]),
    );
    attributes.forEach(attribute => gl.enableVertexAttribArray(attribute));
    gl.uniform1i(uniforms.uTexture, 0);

    function texture(kind) {
      const image = document.createElement("canvas");
      image.width = 512;
      image.height = 256;
      const context = image.getContext("2d");
      if (kind === "shadow") {
        const gradient = context.createRadialGradient(256, 128, 0, 256, 128, 245);
        gradient.addColorStop(0, "#000000d9");
        gradient.addColorStop(0.35, "#00000099");
        gradient.addColorStop(1, "#00000000");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 512, 256);
      } else {
        context.fillStyle = "white";
        context.font = "bold 174px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(kind, 256, 130);
      }
      const result = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, result);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return result;
    }

    return {
      upload(part) {
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, part.vertices, gl.STATIC_DRAW);
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);
        return {
          vertexBuffer, indexBuffer, count: part.indices.length, color: part.color,
          roughness: part.roughness ?? 0.4, grain: part.grain ?? 0,
          kind: part.shadow ? 2 : part.label ? 1 : 0,
          texture: part.shadow ? texture("shadow") : part.label ? texture(part.label) : null,
        };
      },
      dispose(mesh) {
        gl.deleteBuffer(mesh.vertexBuffer);
        gl.deleteBuffer(mesh.indexBuffer);
        if (mesh.texture) gl.deleteTexture(mesh.texture);
      },
      draw(meshes, rotation, center, radius, zoom) {
        const width = Math.round(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1));
        const height = Math.round(width * 500 / 720);
        if (!width || !height) return;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix3fv(uniforms.uRotation, false, rotation);
        gl.uniform3fv(uniforms.uCenter, center);
        gl.uniform1f(uniforms.uRadius, radius);
        gl.uniform1f(uniforms.uZoom, zoom);
        gl.uniform1f(uniforms.uAspect, width / height);
        for (const mesh of meshes) {
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
          gl.vertexAttribPointer(attributes[0], 3, gl.FLOAT, false, 32, 0);
          gl.vertexAttribPointer(attributes[1], 3, gl.FLOAT, false, 32, 12);
          gl.vertexAttribPointer(attributes[2], 2, gl.FLOAT, false, 32, 24);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
          gl.uniform3fv(uniforms.uColor, mesh.color);
          gl.uniform1f(uniforms.uRoughness, mesh.roughness);
          gl.uniform1f(uniforms.uGrain, mesh.grain);
          gl.uniform1f(uniforms.uKind, mesh.kind);
          gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
          gl.depthMask(mesh.kind !== 2);
          gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
        }
        gl.depthMask(true);
      },
    };
  }

  function loadMeshes() {
    const parts = [...baseParts, ...(model === models.duck ? productGeometry.makeHat(hats.value) : [])];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
      for (let vertex = 0; vertex < part.vertices.length; vertex += 8) {
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], part.vertices[vertex + axis]);
          max[axis] = Math.max(max[axis], part.vertices[vertex + axis]);
        }
      }
    }
    sceneCenter = min.map((value, axis) => (value + max[axis]) / 2);
    sceneRadius = 0;
    for (const part of parts) {
      for (let vertex = 0; vertex < part.vertices.length; vertex += 8) {
        sceneRadius = Math.max(sceneRadius, Math.hypot(...sceneCenter.map((value, axis) => part.vertices[vertex + axis] - value)));
      }
    }
    const y = min[1] - 0.035;
    const radius = sceneRadius * 1.45;
    const shadow = {
      vertices: new Float32Array([
        -radius, y, -radius, 0, 1, 0, 0, 0,
        radius, y, -radius, 0, 1, 0, 1, 0,
        -radius, y, radius, 0, 1, 0, 0, 1,
        radius, y, radius, 0, 1, 0, 1, 1,
      ]),
      indices: new Uint16Array([0, 1, 2, 1, 2, 3]), color: [0, 0, 0], shadow: true,
    };
    if (meshes) meshes.forEach(renderer.dispose);
    meshes = [shadow, ...parts].map(renderer.upload);
    canvas.dataset.triangles = parts.reduce((sum, part) => sum + part.indices.length / 3, 0);
    canvas.dataset.hat = model === models.duck ? hats.value : "none";
  }

  function draw() {
    if (!renderer || !meshes) return;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rotation = [cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy];
    renderer.draw(meshes, rotation, sceneCenter, sceneRadius, zoom);
    const degrees = radians => Math.round(radians * 180 / Math.PI);
    angle.textContent = `${degrees(yaw)}° / ${degrees(pitch)}° · ${Math.round(zoom * 100)}%`;
  }

  function animate(now) {
    frame = undefined;
    if (!dialog.open || document.hidden || !renderer) return;
    if (spinning && lastFrame !== undefined) {
      yaw += Math.min(40, now - lastFrame) * 0.00085;
      if (yaw > Math.PI) yaw -= 2 * Math.PI;
    }
    lastFrame = now;
    draw();
    if (spinning) scheduleDraw();
  }

  function scheduleDraw() {
    if (frame === undefined && dialog.open) frame = requestAnimationFrame(animate);
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
    zoom = Math.max(0.65, Math.min(1.8, zoom + direction * 0.1));
    scheduleDraw();
  }

  function openModel() {
    try {
      renderer ??= createRenderer();
      if (!meshes) {
        baseParts ??= model.make();
        loadMeshes();
      }
      unavailable.hidden = true;
      canvas.hidden = false;
      dialog.querySelector(".model-controls").hidden = false;
      document.querySelector("#product-model-hats").hidden = model !== models.duck;
      draw();
      canvas.focus();
    } catch (error) {
      console.warn("3D viewer unavailable", error);
      unavailable.hidden = false;
      canvas.hidden = true;
      dialog.querySelector(".model-controls").hidden = true;
      document.querySelector("#product-model-hats").hidden = true;
    }
  }

  launch.addEventListener("click", () => {
    dialog.showModal();
    openModel();
  });
  hats.addEventListener("change", () => {
    if (!renderer || model !== models.duck) return;
    loadMeshes();
    document.querySelector("#product-model-hat-status").textContent = `Выбрано: ${hats.selectedOptions[0].textContent}`;
    scheduleDraw();
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
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
    button.addEventListener("click", () => turn(Number(button.dataset.modelTurn)));
  });
  canvas.addEventListener("wheel", event => {
    if (event.ctrlKey || event.metaKey || !event.deltaY) return;
    event.preventDefault();
    changeZoom(-Math.sign(event.deltaY));
  }, { passive: false });
  dialog.querySelectorAll("[data-model-zoom]").forEach(button => {
    button.addEventListener("click", () => changeZoom(Number(button.dataset.modelZoom)));
  });
  spin.addEventListener("click", () => setSpin(!spinning));
  dialog.addEventListener("close", () => {
    setSpin(false);
    cancelAnimationFrame(frame);
    frame = undefined;
  });
  document.addEventListener("visibilitychange", () => {
    lastFrame = undefined;
    if (!document.hidden) scheduleDraw();
  });
  new ResizeObserver(scheduleDraw).observe(canvas);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    renderer = undefined;
    meshes = undefined;
    setSpin(false);
    unavailable.hidden = false;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (dialog.open) openModel();
  });

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
      if (meshes) meshes.forEach(renderer.dispose);
      meshes = undefined;
      baseParts = undefined;
      document.querySelector("#product-model-title").textContent = product.name + " в 3D";
      canvas.style.setProperty("--model-tint", model.tint);
      resetView();
    },
  };
})();
