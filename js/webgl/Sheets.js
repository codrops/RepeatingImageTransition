// Draws WebGL movers: copies of the image as sheets on a fixed canvas that sits under the
// panel, with the shaders of a surface ('silk' or 'ink', one file each in this folder).
// index.js creates the sheets and animates their values with GSAP; this only draws them.

import * as silk from './silk.js';
import * as ink from './ink.js';

const SURFACES = { silk, ink };

// Mesh resolution of a sheet (columns x rows), enough for smooth folds at panel size
const COLS = 40;
const ROWS = 50;

// Each clip-path direction as a coordinate across the sheet that runs from 0 to 1
// the way the edge travels (dot(uv, xy) + z), matching getClipPathsForDirection in index.js
const WIPES = {
  'top-bottom': [0, 1, 0],
  'bottom-top': [0, -1, 1],
  'left-right': [-1, 0, 1],
  'right-left': [1, 0, 0],
};

// Every uniform a surface can use (a surface that doesn't declare one just ignores it)
const UNIFORMS = [
  'uRect',
  'uViewport',
  'uTravel',
  'uWipe',
  'uOrigin',
  'uReveal',
  'uHide',
  'uOpacity',
  'uStrength',
  'uRotation',
  'uEdgeNoise',
  'uSeed',
  'uTime',
  'uTexture',
  'uImageSize',
];

// Compile both shaders and link them
const createProgram = (gl, vertexShader, fragmentShader) => {
  const program = gl.createProgram();
  [
    [gl.VERTEX_SHADER, vertexShader],
    [gl.FRAGMENT_SHADER, fragmentShader],
  ].forEach(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    gl.attachShader(program, shader);
  });
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
};

export class Sheets {
  // Set up the canvas, every surface's shaders and the sheet mesh (throws without WebGL)
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sheets';
    const options = { alpha: true, premultipliedAlpha: true, antialias: true };
    const gl = this.canvas.getContext('webgl2', options) || this.canvas.getContext('webgl', options);
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

    // A grid of points over the sheet (uv from 0 to 1, y down), in triangles
    const uvs = [];
    for (let y = 0; y <= ROWS; y++) {
      for (let x = 0; x <= COLS; x++) uvs.push(x / COLS, y / ROWS);
    }
    const indices = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * (COLS + 1) + x;
        indices.push(i, i + 1, i + COLS + 1, i + 1, i + COLS + 2, i + COLS + 1);
      }
    }
    this.count = indices.length;
    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    // Every surface is compiled up front, so one that fails falls back to flat movers
    this.programs = {};
    Object.entries(SURFACES).forEach(([name, { vertexShader, fragmentShader }]) => {
      const program = createProgram(gl, vertexShader, fragmentShader);
      const uniforms = {};
      UNIFORMS.forEach((uniform) => {
        uniforms[uniform] = gl.getUniformLocation(program, uniform);
      });
      this.programs[name] = { program, uniforms, aUv: gl.getAttribLocation(program, 'aUv') };
    });

    // Premultiplied alpha, so the sheets blend over the page like DOM elements
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.sheets = [];
    this.render = this.render.bind(this);
    document.body.appendChild(this.canvas);
  }

  // Whether a surface exists ('silk', 'ink')
  has(surface) {
    return surface in this.programs;
  }

  // Draw the next transition with a surface's shaders
  use(surface) {
    const gl = this.gl;
    this.current = this.programs[surface];
    gl.useProgram(this.current.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.current.aUv);
    gl.vertexAttribPointer(this.current.aUv, 2, gl.FLOAT, false, 0, 0);
  }

  // Load the image into a texture (accepts a CSS url() value)
  load(imgURL) {
    const url = imgURL.match(/url\(["']?(.*?)["']?\)/)?.[1] ?? imgURL;
    const image = new Image();
    image.src = url;
    return image.decode().then(() => {
      const gl = this.gl;
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      // Mipmaps keep the small copies from shimmering (WebGL1 can't make them for this size)
      if (this.isWebGL2) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        this.isWebGL2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.imageSize = [image.naturalWidth, image.naturalHeight];
    });
  }

  // Add a sheet; GSAP animates its reveal, hide, opacity and strength values
  add({
    rect,
    travel,
    wipe,
    origin = { x: 0.5, y: 0.5 },
    reveal = 0,
    hide = 0,
    opacity = 1,
    strength = 0,
    rotation = 0,
    edgeNoise = 0,
  }) {
    const length = Math.hypot(travel.x, travel.y) || 1;
    const sheet = {
      rect: [rect.left, rect.top, rect.width, rect.height],
      travel: [travel.x / length, travel.y / length],
      wipe: WIPES[wipe] ?? WIPES['top-bottom'],
      origin: [origin.x, origin.y],
      reveal,
      hide,
      opacity,
      strength,
      rotation: (rotation * Math.PI) / 180,
      edgeNoise,
      seed: Math.random() * 100,
    };
    this.sheets.push(sheet);
    return sheet;
  }

  // Stop drawing a sheet
  remove(sheet) {
    this.sheets = this.sheets.filter((s) => s !== sheet);
  }

  // Size the canvas to the viewport and draw on every tick until stop()
  start() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.classList.add('sheets--active');
    this.viewport = [this.canvas.clientWidth, this.canvas.clientHeight];
    this.canvas.width = Math.round(this.viewport[0] * dpr);
    this.canvas.height = Math.round(this.viewport[1] * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gsap.ticker.add(this.render);
    // Draw right away, so the sheets show on the same frame as the DOM changes around them
    this.render(gsap.ticker.time);
  }

  // Clear and hide the canvas, and free the texture
  stop() {
    const gl = this.gl;
    gsap.ticker.remove(this.render);
    this.sheets = [];
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.canvas.classList.remove('sheets--active');
    gl.deleteTexture(this.texture);
    this.texture = null;
  }

  // Draw every visible sheet, in the order they were added
  render(time) {
    const gl = this.gl;
    const u = this.current.uniforms;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(u.uTexture, 0);
    gl.uniform2fv(u.uViewport, this.viewport);
    gl.uniform2fv(u.uImageSize, this.imageSize);
    gl.uniform1f(u.uTime, time);

    this.sheets.forEach((sheet) => {
      if (sheet.reveal <= 0 || sheet.hide >= 1 || sheet.opacity <= 0) return;
      gl.uniform4fv(u.uRect, sheet.rect);
      gl.uniform2fv(u.uTravel, sheet.travel);
      gl.uniform3fv(u.uWipe, sheet.wipe);
      gl.uniform2fv(u.uOrigin, sheet.origin);
      gl.uniform1f(u.uReveal, sheet.reveal);
      gl.uniform1f(u.uHide, sheet.hide);
      gl.uniform1f(u.uOpacity, sheet.opacity);
      gl.uniform1f(u.uStrength, sheet.strength);
      gl.uniform1f(u.uRotation, sheet.rotation);
      gl.uniform1f(u.uEdgeNoise, sheet.edgeNoise);
      gl.uniform1f(u.uSeed, sheet.seed);
      gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    });
  }
}
