"use strict";

/* ------------------------
   Constants & Canvas Setup
---------------------------*/
const COLS = 12;
const ROWS = 20;
const TILE = 20; // logical tile size in CSS pixels

const canvas = document.getElementById("tetris");
const ctx = canvas.getContext("2d");

const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas ? nextCanvas.getContext("2d") : null;

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  // set CSS size
  canvas.style.width = `${COLS * TILE}px`;
  canvas.style.height = `${ROWS * TILE}px`;
  // set backing store size
  canvas.width = COLS * TILE * dpr;
  canvas.height = ROWS * TILE * dpr;
  // transform so drawing units are in tiles (1 = tile)
  ctx.setTransform(dpr * TILE, 0, 0, dpr * TILE, 0, 0);

  if (nextCanvas && nextCtx) {
    nextCanvas.style.width = `80px`;
    nextCanvas.style.height = `80px`;
    nextCanvas.width = 80 * dpr;
    nextCanvas.height = 80 * dpr;
    nextCtx.setTransform(dpr * (80 / 4) / (80 / 4), 0, 0, dpr * (80 / 4) / (80 / 4), 0, 0); // keep unit-based drawing
  }
}
setupCanvas();
window.addEventListener("resize", setupCanvas);

/* ------------------------
   State & Settings
---------------------------*/
let neonGlow = true;
let performanceMode = false;
let targetFPS = 60; // default render fps target
let minFrameTime = 1000 / targetFPS; // ms between renders when throttled

let dropInterval = 1000; // ms for automatic drop
let dropCounter = 0;
let lastTime = 0;
let lastRenderTime = 0;

let gameOver = false;
let paused = false;

const arena = createMatrix(COLS, ROWS);
const player = { pos: { x: 0, y: 0 }, matrix: null };

let nextPiece = null;

// scoring
let score = 0;
let level = 0;
let lines = 0;

/* ------------------------
   DOM Elements
---------------------------*/
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const perfToggle = document.getElementById("perf-toggle");
const glowToggle = document.getElementById("glow-toggle");
const speedSlider = document.getElementById("speed-slider");
const closeSettings = document.getElementById("close-settings");

const scoreEl = document.getElementById("score");

/* Safe event binding helper */
function onIf(el, event, fn) {
  if (el) el.addEventListener(event, fn);
}

/* ------------------------
   Settings handlers
---------------------------*/
onIf(settingsBtn, "click", () => settingsPanel.classList.remove("hidden"));
onIf(closeSettings, "click", () => settingsPanel.classList.add("hidden"));

onIf(perfToggle, "change", () => {
  performanceMode = perfToggle.checked;
  if (performanceMode) {
    targetFPS = 30; // limit render FPS in performance mode
    minFrameTime = 1000 / targetFPS;
  } else {
    targetFPS = 60;
    minFrameTime = 1000 / targetFPS;
  }
  // optionally disable expensive rendering features
  neonGlow = !performanceMode && (glowToggle ? glowToggle.checked : true);
});

onIf(glowToggle, "change", () => {
  neonGlow = glowToggle.checked && !performanceMode;
});

let speedDebounce;
onIf(speedSlider, "input", () => {
  if (!performanceMode) {
    clearTimeout(speedDebounce);
    speedDebounce = setTimeout(() => {
      dropInterval = Number(speedSlider.value);
    }, 80);
  }
});
// initialize slider
if (speedSlider) dropInterval = Number(speedSlider.value);

/* ------------------------
   Utilities & Pieces
---------------------------*/
function createMatrix(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(0));
}

/* return deep copy to avoid mutations sharing definitions */
function createPiece(type) {
  const shapes = {
    T: [[0,1,0],[1,1,1],[0,0,0]],
    O: [[1,1],[1,1]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]]
  };
  const shape = shapes[type];
  if (!shape) return null;
  return shape.map(row => row.slice());
}

/* Colors keyed by piece id (1..7). Use quick mapping for neon look */
const PALETTE = {
  1: "#0ff", // generic
  2: "#f0f", // alternate
  3: "#ff0",
  4: "#0f0",
  5: "#09f",
  6: "#f90",
  7: "#f09"
};

/* Map piece types to numeric values for arena cells so we can color them */
const PIECE_IDS = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

/* pick random piece type */
function randomPieceType() {
  const pieces = "ILJOTSZ";
  return pieces[Math.floor(Math.random() * pieces.length)];
}

/* ------------------------
   Collision & rotation
---------------------------*/
function collide(arena, player) {
  const [m, o] = [player.matrix, player.pos];
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (m[y][x] !== 0) {
        const ay = y + o.y;
        const ax = x + o.x;
        if (ay < 0 || ay >= arena.length || ax < 0 || ax >= arena[0].length) return true;
        if (arena[ay][ax] !== 0) return true;
      }
    }
  }
  return false;
}

/* rotate clockwise if dir = 1, ccw if dir = -1 */
function rotateMatrix(matrix, dir) {
  // transpose
  for (let y = 0; y < matrix.length; ++y) {
    for (let x = 0; x < y; ++x) {
      [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
  }
  if (dir > 0) {
    // clockwise: reverse each row
    matrix.forEach(row => row.reverse());
  } else {
    // ccw: reverse order of rows
    matrix.reverse();
  }
}

/* rotate with simple wall kicks */
function rotatePlayer(dir) {
  if (!player.matrix) return;
  const posX = player.pos.x;
  rotateMatrix(player.matrix, dir);

  let offset = 1;
  while (collide(arena, player)) {
    player.pos.x += offset;
    // try offsets: +1, -2, +3, -4 ...
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (Math.abs(offset) > player.matrix[0].length + 1) {
      // Give up: rotate back and restore position
      rotateMatrix(player.matrix, -dir);
      player.pos.x = posX;
      return;
    }
  }
}

/* ------------------------
   Merge / Sweep / Score
---------------------------*/
function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        arena[y + player.pos.y][x + player.pos.x] = value;
      }
    });
  });
}

function arenaSweep() {
  let linesCleared = 0;
  outer: for (let y = arena.length - 1; y >= 0; --y) {
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] === 0) continue outer;
    }
    // remove full row
    const row = arena.splice(y, 1)[0].fill(0);
    arena.unshift(row);
    ++linesCleared;
    ++y; // keep checking this index after unshift
  }

  if (linesCleared > 0) {
    updateScore(linesCleared);
  }
}

function updateScore(cleared) {
  // Standard Tetris scoring base
  const lineScores = [0, 40, 100, 300, 1200];
  score += (lineScores[cleared] || 0) * (level + 1);
  lines += cleared;
  // increase level every 10 lines
  const newLevel = Math.floor(lines / 10);
  if (newLevel > level) {
    level = newLevel;
    // speed up drop by 60ms per level, clamp minimum
    dropInterval = Math.max(120, dropInterval - 60 * (newLevel - level + 1));
  }
  if (scoreEl) scoreEl.textContent = String(score);
}

/* ------------------------
   Player functions
---------------------------*/
function playerReset() {
  // use nextPiece if available
  if (!nextPiece) {
    nextPiece = randomPieceType();
  }
  const type = nextPiece;
  player.matrix = createPiece(type);
  // pick id mapping in matrix for coloring, convert 1's in piece to numeric id
  const id = PIECE_IDS[type] || 1;
  for (let y = 0; y < player.matrix.length; ++y) {
    for (let x = 0; x < player.matrix[y].length; ++x) {
      if (player.matrix[y][x] !== 0) player.matrix[y][x] = id;
    }
  }

  player.pos.y = 0;
  player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);

  nextPiece = randomPieceType();
  drawNext();

  if (collide(arena, player)) {
    // game over
    gameOver = true;
    // show a short animation, then reset arena and score
    setTimeout(() => {
      arena.forEach(row => row.fill(0));
      score = 0;
      lines = 0;
      level = 0;
      if (scoreEl) scoreEl.textContent = String(score);
      gameOver = false;
      playerReset();
    }, 800);
  }
}

/* soft drop */
function playerDrop() {
  if (gameOver || paused) return;
  player.pos.y++;
  if (collide(arena, player)) {
    player.pos.y--;
    merge(arena, player);
    arenaSweep();
    playerReset();
  }
  dropCounter = 0;
}

/* hard drop - instantly drop to bottom */
function hardDrop() {
  if (gameOver || paused) return;
  while (!collide(arena, player)) {
    player.pos.y++;
  }
  player.pos.y--;
  merge(arena, player);
  arenaSweep();
  playerReset();
  dropCounter = 0;
}

function playerMove(dir) {
  if (gameOver || paused) return;
  player.pos.x += dir;
  if (collide(arena, player)) player.pos.x -= dir;
}

/* ------------------------
   Drawing
---------------------------*/
function drawMatrix(matrix, offset) {
  // set shadow/painting once per set
  ctx.save();
  if (neonGlow) {
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#0ff";
  } else {
    ctx.shadowBlur = 0;
  }

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      ctx.fillStyle = PALETTE[value] || "#0ff";
      ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
      // inner darker border for subtle visual separation
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(x + offset.x + 0.02, y + offset.y + 0.02, 0.96, 0.96);
    });
  });

  ctx.restore();
}

function draw() {
  // draw background in tile coordinates (so scaled transform applies)
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, COLS, ROWS);

  drawMatrix(arena, { x: 0, y: 0 });
  if (player.matrix && !gameOver) drawMatrix(player.matrix, player.pos);
}

/* draw next piece preview (small 4x4 grid) */
function drawNext() {
  if (!nextCtx) return;
  const cell = 80 / 4; // use CSS pixel sizes; nextCanvas is configured
  nextCtx.save();
  // fill background
  nextCtx.fillStyle = "#000";
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  // draw an empty 4x4 grid sized to nextCanvas (using CSS pixels scaled by transform)
  // create a preview matrix from nextPiece type
  const type = nextPiece || randomPieceType();
  const matrix = createPiece(type);
  // convert to numeric ids for color
  const id = PIECE_IDS[type] || 1;
  for (let y = 0; y < matrix.length; ++y) {
    for (let x = 0; x < matrix[y].length; ++x) {
      if (matrix[y][x] !== 0) {
        nextCtx.fillStyle = PALETTE[id] || "#0ff";
        // center the shape in the 4x4 preview (offset by 0.5 tiles)
        const offsetX = (4 - matrix[0].length) / 2;
        const offsetY = (4 - matrix.length) / 2;
        nextCtx.fillRect((x + offsetX) * cell, (y + offsetY) * cell, cell, cell);
      }
    }
  }
  nextCtx.restore();
}

/* ------------------------
   Game loop with FPS throttle
---------------------------*/
function update(time = 0) {
  if (!lastTime) lastTime = time;
  const delta = time - lastTime;
  lastTime = time;

  // accumulate drop counter using real elapsed ms
  dropCounter += delta;
  if (dropCounter > dropInterval) {
    playerDrop();
  }

  // render throttled when in performanceMode
  if (performanceMode) {
    if (time - lastRenderTime >= minFrameTime) {
      draw();
      lastRenderTime = time;
    }
  } else {
    // smooth normal rendering
    draw();
  }

  requestAnimationFrame(update);
}

/* ------------------------
   Input bindings
---------------------------*/
document.addEventListener("keydown", e => {
  if (e.repeat) return; // simple repeat guard
  switch (e.key) {
    case "ArrowLeft": playerMove(-1); break;
    case "ArrowRight": playerMove(1); break;
    case "ArrowDown": playerDrop(); break;
    case "ArrowUp": rotatePlayer(1); break;
    case " ": // space = hard drop
      e.preventDefault();
      hardDrop();
      break;
    case "p":
    case "P":
      paused = !paused;
      break;
  }
});

/* Touch / pointer button binding helper */
function bindControl(id, action) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("pointerdown", e => { e.preventDefault(); btn.classList.add("pressed"); action(); });
  btn.addEventListener("pointerup", () => btn.classList.remove("pressed"));
  btn.addEventListener("pointerleave", () => btn.classList.remove("pressed"));
  // support touch explicitly for some older browsers
  btn.addEventListener("touchstart", e => { e.preventDefault(); btn.classList.add("pressed"); action(); }, { passive: false });
  btn.addEventListener("touchend", () => btn.classList.remove("pressed"));
}

bindControl("left-btn", () => playerMove(-1));
bindControl("right-btn", () => playerMove(1));
bindControl("down-btn", () => playerDrop());
bindControl("rotate-btn", () => rotatePlayer(1));

/* ------------------------
   Initialization
---------------------------*/
function init() {
  // ensure UI default states
  if (perfToggle) perfToggle.checked = performanceMode;
  if (glowToggle) glowToggle.checked = neonGlow;
  if (speedSlider) speedSlider.value = dropInterval;

  // prepare first pieces
  nextPiece = randomPieceType();
  playerReset();
  drawNext();
  if (scoreEl) scoreEl.textContent = String(score);

  lastTime = performance.now();
  lastRenderTime = lastTime;
  requestAnimationFrame(update);
}

init();
