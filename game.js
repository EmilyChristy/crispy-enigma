export const LEVELS = [
  { name: 'Midnight Delivery', mode: 'courier', seed: 17, ghosts: 2, speed: 440,
    brief: 'Carry one cell at a time to the H hub. Deliver all three, then reach OUT. A hit drops your cargo.' },
  { name: 'Signal Garden', mode: 'signal', seed: 83, ghosts: 0, speed: 400,
    brief: 'Step onto numbered pads in the displayed order, then reach OUT. Wrong pads reset the sequence; completed pads are safe.' },
  { name: 'Battery Workshop', mode: 'cargo', seed: 137, ghosts: 0, speed: 360,
    brief: 'Push each square battery onto a + socket. Docked batteries lock in place. Fill all sockets, then reach OUT.' },
  { name: 'Cross-town Relay', mode: 'courier', seed: 251, ghosts: 4, speed: 320,
    brief: 'Four deliveries, one shared hub. Split the routes with friends; protect your cargo with Overdrive. Then reach OUT.' },
  { name: 'The Neon Heart', mode: 'finale', seed: 419, ghosts: 0, speed: 280,
    brief: 'Restore the Heart: dock all batteries AND solve the numbered signal sequence. Then send a pilot to OUT.' },
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
    status: 'lobby', level: 0, players: [], grid: [],
    cells: [], delivered: 0, switches: [], sequence: [], progress: 0,
    crates: [], sockets: [], hub: { x: 11, y: 7 }, exit: { x: 21, y: 15 },
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
  if (['cargo', 'finale'].includes(settings.mode)) {
    // Wide service lanes make every battery recoverable with the rewind control.
    game.grid = Array.from({ length: 17 }, (_, y) =>
      Array.from({ length: 23 }, (_, x) => +(x === 0 || y === 0 || x === 22 || y === 16)));
    for (const x of [7, 15]) {
      for (let y = 4; y <= 12; y++) if (y !== 8) game.grid[y][x] = 1;
    }
  }
  resetObjectives(game);
  game.signalRewarded = false;
  game.powers = new Set(settings.mode === 'courier' ? ['9,1', '1,9', '19,15'] : []);
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

function resetObjectives(game) {
  const { mode } = LEVELS[game.level];
  game.delivered = 0;
  game.cells = mode === 'courier' ?
    [{ x: 21, y: 1 }, { x: 1, y: 15 }, { x: 19, y: 13 },
      ...(game.level === 3 ? [{ x: 5, y: 9 }] : [])].map(p => ({ ...p, carrier: null, delivered: false })) : [];
  game.switches = ['signal', 'finale'].includes(mode) ?
    [{ x: 5, y: 3 }, { x: 17, y: 3 }, { x: 5, y: 13 }, { x: 17, y: 13 }] : [];
  game.sequence = game.switches.length ? (mode === 'finale' ? [3, 0, 2, 1] : [1, 2, 0, 3]) : [];
  game.progress = 0;
  game.crates = ['cargo', 'finale'].includes(mode) ?
    [{ x: 4, y: 5 }, { x: 11, y: 11 }, { x: 18, y: 5 }] : [];
  game.sockets = game.crates.length ? [{ x: 4, y: 9 }, { x: 11, y: 5 }, { x: 18, y: 9 }] : [];
}

export function objectivesComplete(game) {
  return game.grid.length > 0 && game.delivered === game.cells.length && game.progress === game.sequence.length &&
    game.sockets.every(socket => game.crates.some(crate => distance(crate, socket) === 0));
}

export function rewindPuzzle(game) {
  if (game.status !== 'playing' || game.transition > 0 || LEVELS[game.level].mode === 'courier') return false;
  resetObjectives(game);
  for (const player of game.players) {
    player.x = player.y = 1;
    player.direction = null;
  }
  game.remaining = Math.max(0, game.remaining - 10000);
  game.message = 'Puzzle rewound. −10 seconds. Hearts and score unchanged.';
  return true;
}

function award(game, player, points) {
  game.score += points;
  player.score += points;
}

function interact(game, player, moved) {
  const carried = game.cells.find(cell => cell.carrier === player.id);
  if (carried) {
    carried.x = player.x;
    carried.y = player.y;
    if (distance(player, game.hub) === 0) {
      carried.carrier = null;
      carried.delivered = true;
      game.delivered++;
      award(game, player, 300);
      game.message = `${player.name} delivered a cell! ${game.delivered}/${game.cells.length} at the hub.`;
    }
  } else {
    const cell = game.cells.find(cell => !cell.carrier && !cell.delivered && distance(player, cell) === 0);
    if (cell) {
      cell.carrier = player.id;
      game.message = `${player.name} has cargo. Bring it to H!`;
    }
  }
  if (!moved || game.progress === game.sequence.length) return;
  const pad = game.switches.findIndex(point => distance(player, point) === 0);
  if (pad < 0 || game.sequence.slice(0, game.progress).includes(pad)) return;
  if (pad === game.sequence[game.progress]) {
    game.progress++;
    // Score only a finished circuit so repeated resets cannot farm points.
    if (game.progress === game.sequence.length && !game.signalRewarded) {
      award(game, player, 600);
      game.signalRewarded = true;
    }
    game.message = `Signal ${game.progress}/${game.sequence.length} connected.`;
  } else {
    game.progress = 0;
    game.message = 'Signal crossed! Sequence reset. Follow the displayed order.';
  }
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
    for (const cell of game.cells) {
      if (cell.carrier === player.id) {
        cell.x = player.x;
        cell.y = player.y;
        cell.carrier = null;
      }
    }
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
  for (const cell of game.cells) {
    if (cell.carrier && !game.players.some(player => player.id === cell.carrier && player.lives > 0)) cell.carrier = null;
  }
  for (const ghost of game.ghosts) ghost.rest = Math.max(0, ghost.rest - dt);
  for (const player of game.players) {
    player.shield = Math.max(0, player.shield - dt);
    if (!player.lives) continue;
    const [dx, dy] = DIRECTIONS[player.direction] || [0, 0];
    const next = { x: player.x + dx, y: player.y + dy };
    const crate = game.crates.find(box => distance(box, next) === 0);
    let blocked = false;
    if (crate && (dx || dy)) {
      const pushed = { x: crate.x + dx, y: crate.y + dy };
      blocked = game.sockets.some(socket => distance(socket, crate) === 0) ||
        game.grid[pushed.y]?.[pushed.x] !== 0 ||
        game.crates.some(box => distance(box, pushed) === 0);
      if (!blocked) Object.assign(crate, pushed);
    }
    let moved = false;
    if (!blocked && game.grid[next.y]?.[next.x] === 0 && (dx || dy)) {
      player.x += dx;
      player.y += dy;
      moved = true;
    }
    interact(game, player, moved);
    const point = key(player.x, player.y);
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
  } else if (objectivesComplete(game) && game.players.some(player => player.lives > 0 && distance(player, game.exit) === 0)) {
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
    ...game, powers: [...game.powers], exitOpen: objectivesComplete(game),
    mode: LEVELS[game.level].mode, brief: LEVELS[game.level].brief,
    levelName: LEVELS[game.level].name, totalLevels: LEVELS.length,
  };
}
