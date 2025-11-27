const canvas = document.getElementById("tetris");
const ctx = canvas.getContext("2d");

ctx.scale(20, 20);

function arenaSweep() {
  outer: for (let y = arena.length - 1; y > 0; --y) {
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] === 0) {
        continue outer;
      }
    }
    const row = arena.splice(y, 1)[0].fill(0);
    arena.unshift(row);
    ++y;
  }
}

function collide(arena, player) {
  const [m, o] = [player.matrix, player.pos];
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (
        m[y][x] !== 0 &&
        (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function createMatrix(w, h) {
  const matrix = [];
  while (h--) matrix.push(new Array(w).fill(0));
  return matrix;
}

function createPiece(type) {
  switch (type) {
    case "T": return [[0,1,0],[1,1,1],[0,0,0]];
    case "O": return [[1,1],[1,1]];
    case "L": return [[0,0,1],[1,1,1],[0,0,0]];
    case "J": return [[1,0,0],[1,1,1],[0,0,0]];
    case "I": return [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]];
    case "S": return [[0,1,1],[1,1,0],[0,0,0]];
    case "Z": return [[1,1,0],[0,1,1],[0,0,0]];
  }
}

function drawMatrix(matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        ctx.fillStyle = "#00FFFF"; 
        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
      }
    });
  });
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawMatrix(arena, { x: 0, y: 0 });
  drawMatrix(player.matrix, player.pos);
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        arena[y + player.pos.y][x + player.pos.x] = value;
      }
    });
  });
}

function rotate(matrix) {
  for (let y = 0; y < matrix.length; ++y) {
    for (let x = 0; x < y; ++x) {
      [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
  }
  matrix.forEach(row => row.reverse());
}

function playerReset() {
  const pieces = "ILJOTSZ";
  player.matrix = createPiece(
    pieces[(pieces.length * Math.random()) | 0]
  );
  player.pos.y = 0;
  player.pos.x = ((arena[0].length / 2) | 0) -
                 ((player.matrix[0].length / 2) | 0);

  if (collide(arena, player)) {
    arena.forEach(row => row.fill(0));
  }
}

function playerDrop() {
  player.pos.y++;
  if (collide(arena, player)) {
    player.pos.y--;
    merge(arena, player);
    playerReset();
    arenaSweep();
  }
  dropCounter = 0;
}

function playerMove(dir) {
  player.pos.x += dir;
  if (collide(arena, player)) {
    player.pos.x -= dir;
  }
}

let dropCounter = 0;
let dropInterval = 1000;

let lastTime = 0;
function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;

  if (dropCounter > dropInterval) {
    playerDrop();
  }

  draw();
  requestAnimationFrame(update);
}

/* -----------------------------
   KEYBOARD CONTROLS
--------------------------------*/
document.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft") playerMove(-1);
  else if (event.key === "ArrowRight") playerMove(1);
  else if (event.key === "ArrowDown") playerDrop();
  else if (event.key === "ArrowUp") rotate(player.matrix);
});

/* -----------------------------
   TOUCH / MOBILE CONTROLS
   (Now uses pointer events)
--------------------------------*/

function bindControl(id, action) {
  const btn = document.getElementById(id);

  btn.addEventListener("pointerdown", e => {
    e.preventDefault();
    btn.classList.add("pressed");
    action();
  });

  btn.addEventListener("pointerup", () => {
    btn.classList.remove("pressed");
  });

  btn.addEventListener("pointerleave", () => {
    btn.classList.remove("pressed");
  });
}

bindControl("left-btn", () => playerMove(-1));
bindControl("right-btn", () => playerMove(1));
bindControl("down-btn", () => playerDrop());
bindControl("rotate-btn", () => rotate(player.matrix));

/* -------------------------------- */

const arena = createMatrix(12, 20);

const player = {
  pos: { x: 0, y: 0 },
  matrix: null,
};

playerReset();
update();
