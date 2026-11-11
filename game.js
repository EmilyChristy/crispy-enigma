export const LEVELS = [
  { name: 'Midnight Market', seed: 17, ghosts: 2, speed: 440 },
  { name: 'Electric Gardens', seed: 83, ghosts: 3, speed: 400 },
  { name: 'Voltage Vault', seed: 137, ghosts: 4, speed: 360 },
  { name: 'Chromatic Circuit', seed: 251, ghosts: 5, speed: 320 },
  { name: 'The Neon Heart', seed: 419, ghosts: 6, speed: 280 },
];
export const DIRECTIONS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};
export const COLORS = ['#7df9c1', '#ff84ca', '#ffc773', '#91baff', '#c4a0ff',
  '#ff8d80', '#a8ef78', '#7fe4f2', '#f4a8f1', '#f6ed92'];
const key = (x, y) => `${x},${y}`;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function makeMaze(seed) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const grid = Array.from({ length: 17 }, () => Array(23).fill(1));
  const stack = [[1, 1]];
  grid[1][1] = 0;
  while (stack.length) {
    const [x, y] = stack.at(-1);
    const choices = Object.values(DIRECTIONS).filter(([dx, dy]) =>
      grid[y + dy * 2]?.[x + dx * 2] === 1 &&
      x + dx * 2 > 0 && x + dx * 2 < 22 && y + dy * 2 > 0 && y + dy * 2 < 16);
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = choices[Math.floor(random() * choices.length)];
    grid[y + dy][x + dx] = 0;
    grid[y + dy * 2][x + dx * 2] = 0;
    stack.push([x + dx * 2, y + dy * 2]);
  }
  // Loops give players escape routes without disconnecting the maze.
  for (let y = 1; y < 16; y++) {
    for (let x = 1; x < 22; x++) {
      if (grid[y][x] && ((grid[y - 1][x] === 0 && grid[y + 1][x] === 0) ||
        (grid[y][x - 1] === 0 && grid[y][x + 1] === 0)) && random() < 0.24) {
        grid[y][x] = 0;
      }
    }
  }
  return grid;
}

export function createGame() {
  return {
    status: 'lobby', level: 0, players: [], grid: [], sparks: new Set(),
    powers: new Set(), ghosts: [], score: 0, remaining: 120000,
    overdrive: 0, combo: 0, transition: 0, elapsed: 0, ghostClock: 0,
    message: 'Your next great run starts here.',
  };
}

export function addPlayer(game, id, name, avatar) {
  if (game.players.length >= 10) throw new Error('This room is full (10 players).');
  if (game.status !== 'lobby') throw new Error('This run has started. Join after the crew returns to the lobby.');
  const player = {
    id, name, avatar, color: COLORS.find(color => !game.players.some(p => p.color === color)),
    x: 1, y: 1, direction: null, lives: 3, shield: 3000, score: 0,
  };
  game.players.push(player);
  return player;
}

export function loadLevel(game) {
  const settings = LEVELS[game.level];
  game.grid = makeMaze(settings.seed);
  game.sparks = new Set();
  for (let y = 1; y < 16; y++) {
    for (let x = 1; x < 22; x++) {
      if (!game.grid[y][x] && (x !== 1 || y !== 1)) game.sparks.add(key(x, y));
    }
  }
  game.powers = new Set(['21,1', '1,15', '21,15', '11,7']);
  for (const point of game.powers) game.sparks.delete(point);
  game.ghosts = Array.from({ length: settings.ghosts }, (_, i) => ({
    x: 21 - (i % 3) * 2, y: 15 - Math.floor(i / 3) * 2, homeX: 21 - (i % 3) * 2,
    homeY: 15 - Math.floor(i / 3) * 2, rest: 1500, previous: null,
  }));
  for (const player of game.players) {
    player.x = 1;
    player.y = 1;
    player.direction = null;
    player.shield = 3000;
    // Completing a level brings eliminated teammates back into the run.
    player.lives = Math.min(3, player.lives + 1);
  }
  game.remaining = 120000;
  game.overdrive = 0;
  game.combo = 0;
  game.ghostClock = 0;
  game.message = `Level ${game.level + 1}: ${settings.name}`;
}

export function startGame(game) {
  game.level = 0;
  game.score = 0;
  game.elapsed = 0;
  game.transition = 0;
  for (const player of game.players) {
    player.lives = 3;
    player.score = 0;
  }
  loadLevel(game);
  game.status = 'playing';
}

function hit(game, player, ghost) {
  if (ghost.rest > 0 || !player.lives) return;
  if (game.overdrive > 0) {
    const points = 200 * Math.min(4, ++game.combo);
    game.score += points;
    player.score += points;
    ghost.x = ghost.homeX;
    ghost.y = ghost.homeY;
    ghost.rest = 2500;
    ghost.previous = null;
    game.message = `${player.name} remixed a drone! +${points}`;
  } else if (player.shield <= 0) {
    player.lives--;
    player.x = 1;
    player.y = 1;
    player.direction = null;
    player.shield = 3000;
    game.message = player.lives ? `${player.name} is back at base. Keep going!` :
      `${player.name} is cheering you on. Clear the level to revive them!`;
  }
}

export function tick(game, dt = 120) {
  if (game.status !== 'playing') return;
  if (game.transition > 0) {
    game.transition -= dt;
    if (game.transition <= 0) {
      game.level++;
      loadLevel(game);
    }
    return;
  }
  game.elapsed += dt;
  game.remaining = Math.max(0, game.remaining - dt);
  game.overdrive = Math.max(0, game.overdrive - dt);
  for (const ghost of game.ghosts) ghost.rest = Math.max(0, ghost.rest - dt);
  for (const player of game.players) {
    player.shield = Math.max(0, player.shield - dt);
    if (!player.lives) continue;
    const [dx, dy] = DIRECTIONS[player.direction] || [0, 0];
    if (game.grid[player.y + dy]?.[player.x + dx] === 0) {
      player.x += dx;
      player.y += dy;
    }
    const point = key(player.x, player.y);
    if (game.sparks.delete(point)) {
      game.score += 10;
      player.score += 10;
    }
    if (game.powers.delete(point)) {
      game.overdrive = 8000;
      game.combo = 0;
      game.score += 50;
      player.score += 50;
      game.message = 'OVERDRIVE! Every player can remix drones for 8 seconds.';
    }
    for (const ghost of game.ghosts) {
      if (ghost.x === player.x && ghost.y === player.y) hit(game, player, ghost);
    }
  }
  game.ghostClock += dt;
  if (game.ghostClock >= LEVELS[game.level].speed) {
    game.ghostClock = 0;
    for (const [index, ghost] of game.ghosts.entries()) {
      if (ghost.rest > 0) continue;
      const targets = game.players.filter(p => p.lives > 0);
      if (!targets.length) break;
      const target = targets.reduce((a, b) => distance(a, ghost) < distance(b, ghost) ? a : b);
      let options = Object.values(DIRECTIONS).map(([dx, dy]) =>
        ({ x: ghost.x + dx, y: ghost.y + dy })).filter(p => game.grid[p.y]?.[p.x] === 0);
      const forward = options.filter(p => key(p.x, p.y) !== ghost.previous);
      if (forward.length) options = forward;
      options.sort((a, b) => (distance(a, target) - distance(b, target)) * (game.overdrive ? -1 : 1));
      // Occasionally take a side path instead of making every drone perfectly predictable.
      const next = options[(Math.floor(game.elapsed / 1000) + index) % 7 === 0 ? options.length - 1 : 0];
      if (next) {
        ghost.previous = key(ghost.x, ghost.y);
        ghost.x = next.x;
        ghost.y = next.y;
      }
    }
  }
  for (const player of game.players) {
    for (const ghost of game.ghosts) {
      if (ghost.x === player.x && ghost.y === player.y) hit(game, player, ghost);
    }
  }
  if (!game.players.some(p => p.lives > 0) || game.remaining <= 0) {
    game.status = 'gameover';
    game.message = game.remaining <= 0 ? 'Out of time. One more run?' : 'The crew is out of hearts. One more run?';
  } else if (!game.sparks.size && !game.powers.size) {
    game.score += 500 + Math.floor(game.remaining / 1000) * 5;
    if (game.level === LEVELS.length - 1) {
      game.status = 'won';
      game.message = 'You brought the Neon Heart back to life. Legendary run!';
    } else {
      game.transition = 2400;
      game.message = 'Circuit cleared! +1 heart for everyone. Next stop…';
    }
  }
}

export function snapshot(game) {
  return {
    ...game, sparks: [...game.sparks], powers: [...game.powers],
    levelName: LEVELS[game.level].name, totalLevels: LEVELS.length,
  };
}
