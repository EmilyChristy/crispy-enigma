import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startGame, tick, makeMaze, LEVELS, snapshot, loadLevel, objectivesComplete, rewindPuzzle, DIRECTIONS } from '../game.js';

function run() {
  const game = createGame();
  addPlayer(game, 'one', 'Player one', '✦');
  startGame(game);
  return game;
}

test('all five distinct mazes and their power cores are reachable from spawn', () => {
  const layouts = new Set();
  assert.equal(LEVELS.length, 5);
  for (const { seed } of LEVELS) {
    const grid = makeMaze(seed);
    layouts.add(JSON.stringify(grid));
    const seen = new Set(['1,1']);
    const queue = [[1, 1]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const point = `${x + dx},${y + dy}`;
        if (grid[y + dy]?.[x + dx] === 0 && !seen.has(point)) {
          seen.add(point);
          queue.push([x + dx, y + dy]);
        }
      }
    }
    const open = grid.flat().filter(cell => cell === 0).length;
    assert.equal(seen.size, open);
    for (const point of ['21,1', '1,15', '21,15', '11,7']) assert.ok(seen.has(point));
    assert.ok(grid[0].every(Boolean) && grid[16].every(Boolean));
  }
  assert.equal(layouts.size, 5);
});

test('a room supports 1–10 distinct players but not an eleventh or mid-run joins', () => {
  const game = createGame();
  for (let i = 0; i < 10; i++) addPlayer(game, `${i}`, `Player ${i}`, '✦');
  assert.equal(new Set(game.players.map(p => p.color)).size, 10);
  assert.throws(() => addPlayer(game, '11', 'Extra', '✦'), /full/);
  startGame(game);
  game.players.pop();
  assert.throws(() => addPlayer(game, '11', 'Late', '✦'), /started/);
});

test('walls block movement, empty corridors do not score, and snapshots serialize collections', () => {
  assert.equal(snapshot(createGame()).exitOpen, false);
  const game = run();
  const player = game.players[0];
  player.direction = 'left';
  tick(game);
  assert.equal(player.x, 1);
  tick(game);
  assert.equal(game.score, 0);
  tick(game);
  assert.equal(player.score, 0);
  assert.ok(Array.isArray(JSON.parse(JSON.stringify(snapshot(game))).powers));
});

test('a power core gives the whole crew eight seconds of edible drones and combo points', () => {
  const game = createGame();
  addPlayer(game, 'one', 'One', '✦');
  addPlayer(game, 'two', 'Two', '🌙');
  startGame(game);
  game.powers.add('1,1');
  const ghost = game.ghosts[0];
  ghost.x = ghost.y = 1;
  ghost.rest = 0;
  tick(game);
  assert.equal(game.overdrive, 8000);
  assert.equal(game.score, 250);
  assert.equal(ghost.rest, 2500);
  assert.equal(game.players[0].lives, 3);
  ghost.x = ghost.y = 1;
  ghost.rest = 0;
  game.players[0].x = 3;
  tick(game);
  assert.equal(game.players[1].score, 400);
  assert.equal(game.score, 650);
  game.ghosts = [];
  tick(game, 8000);
  assert.equal(game.overdrive, 0);
});

test('dangerous drones cost a heart, shield respawns, and all players out ends the run', () => {
  const game = run();
  const player = game.players[0];
  const ghost = game.ghosts[0];
  player.shield = 0;
  ghost.x = ghost.y = 1;
  ghost.rest = 0;
  tick(game);
  assert.equal(player.lives, 2);
  assert.equal(player.shield, 3000);
  tick(game);
  assert.equal(player.lives, 2);
  player.shield = 0;
  player.lives = 1;
  ghost.x = ghost.y = 1;
  tick(game);
  assert.equal(game.status, 'gameover');
});

test('a drone that moves onto a player also damages them', () => {
  const game = run();
  game.grid = [[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]];
  const player = game.players[0];
  player.shield = 0;
  game.ghosts = [{ x: 2, y: 1, homeX: 3, homeY: 1, rest: 0, previous: null }];
  game.ghostClock = 440;
  game.elapsed = 1000;
  tick(game);
  assert.equal(player.lives, 2);
});

test('five cleared circuits refresh the clock, revive teammates, then finish the game', () => {
  const game = createGame();
  addPlayer(game, 'one', 'One', '✦');
  addPlayer(game, 'two', 'Two', '🌙');
  startGame(game);
  for (let level = 0; level < 5; level++) {
    assert.equal(game.level, level);
    assert.equal(game.remaining, 120000);
    game.cells.forEach(cell => { cell.delivered = true; });
    game.delivered = game.cells.length;
    game.progress = game.sequence.length;
    game.crates = game.sockets.map(socket => ({ ...socket }));
    game.players[0].x = game.exit.x;
    game.players[0].y = game.exit.y;
    game.ghosts = [];
    game.remaining = 10000;
    game.players[1].lives = 0;
    tick(game);
    if (level < 4) {
      assert.equal(game.transition, 2400);
      tick(game, 2400);
      assert.equal(game.players[1].lives, 1);
    }
  }
  assert.equal(game.status, 'won');
  assert.ok(game.score > 2500);
  startGame(game);
  assert.equal(game.level, 0);
  assert.equal(game.score, 0);
  assert.equal(game.players[1].lives, 3);
});

test('timeout ends the game; pause freezes clocks and movement', () => {
  const game = run();
  game.status = 'paused';
  tick(game, 200000);
  assert.equal(game.remaining, 120000);
  game.status = 'playing';
  game.remaining = 100;
  tick(game);
  assert.equal(game.status, 'gameover');
  assert.equal(game.remaining, 0);
});

function walk(game, x, y, player = game.players[0]) {
  const queue = [{ x: player.x, y: player.y, path: [] }];
  const seen = new Set([`${player.x},${player.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.x === x && current.y === y) {
      for (const direction of current.path) {
        player.direction = direction;
        tick(game);
        assert.ok(game.status === 'playing' || game.status === 'won' && x === game.exit.x && y === game.exit.y);
      }
      player.direction = null;
      assert.equal(player.x, x);
      assert.equal(player.y, y);
      return;
    }
    for (const [direction, [dx, dy]] of Object.entries(DIRECTIONS)) {
      const next = { x: current.x + dx, y: current.y + dy };
      const point = `${next.x},${next.y}`;
      if (game.grid[next.y]?.[next.x] !== 0 || seen.has(point) ||
          game.crates.some(crate => crate.x === next.x && crate.y === next.y) ||
          game.switches.some((pad, index) => pad.x === next.x && pad.y === next.y &&
            (pad.x !== x || pad.y !== y) && !game.sequence.slice(0, game.progress).includes(index))) continue;
      seen.add(point);
      queue.push({ ...next, path: [...current.path, direction] });
    }
  }
  assert.fail(`No route to ${x},${y}`);
}

test('courier cargo is exclusive, limited to one per pilot, delivered once, and dropped on damage or departure', () => {
  const game = run();
  addGuest(game);
  const [pilot, guest] = game.players;
  game.ghosts = [];
  game.powers.clear();
  game.cells[0].x = game.cells[1].x = guest.x = pilot.x = 3;
  game.cells[0].y = game.cells[1].y = guest.y = pilot.y = 1;
  tick(game);
  assert.equal(game.cells[0].carrier, pilot.id);
  assert.equal(game.cells[1].carrier, guest.id);
  tick(game);
  assert.equal(game.cells.filter(cell => cell.carrier === pilot.id).length, 1);
  assert.equal(game.cells.filter(cell => cell.carrier === guest.id).length, 1);
  game.players.pop();
  tick(game);
  assert.equal(game.cells[1].carrier, null);
  // Damage drops cargo at the hit location, not at the respawn base.
  pilot.shield = 0;
  game.ghosts = [{ x: 3, y: 1, homeX: 21, homeY: 15, rest: 0 }];
  tick(game);
  assert.equal(game.cells[0].carrier, null);
  assert.equal(game.cells[0].x, 3);
  assert.equal(pilot.x, 1);
  game.ghosts = [];
  walk(game, 3, 1);
  assert.equal(game.cells[0].carrier, pilot.id);
  walk(game, game.hub.x, game.hub.y);
  assert.equal(game.delivered, 1);
  assert.equal(game.score, 300);
  tick(game);
  assert.equal(game.delivered, 1);
});

function addGuest(game) {
  const status = game.status;
  game.status = 'lobby';
  addPlayer(game, 'two', 'Teammate', '🌙');
  game.status = status;
}

test('signal pads require entry, reject wrong order, and share progress without repeat scoring', () => {
  const game = run();
  game.level = 1;
  loadLevel(game);
  const player = game.players[0];
  const enter = index => {
    const pad = game.switches[index];
    player.x = pad.x - 1;
    player.y = pad.y;
    game.grid[pad.y][pad.x - 1] = 0;
    player.direction = 'right';
    tick(game);
    player.direction = null;
  };
  enter(0);
  assert.equal(game.progress, 0);
  enter(1);
  assert.equal(game.progress, 1);
  tick(game);
  assert.equal(game.progress, 1);
  enter(3);
  assert.equal(game.progress, 0);
  addGuest(game);
  for (const pad of game.sequence) enter(pad);
  assert.equal(game.progress, 4);
  assert.equal(game.score, 600);
  assert.ok(snapshot(game).exitOpen);
  enter(3);
  assert.equal(game.score, 600);
  const remaining = game.remaining;
  assert.ok(rewindPuzzle(game));
  assert.equal(game.remaining, remaining - 10000);
  assert.equal(game.progress, 0);
  for (const pad of game.sequence) enter(pad);
  assert.equal(game.score, 600);
});

test('batteries cannot be pushed through walls, each other, or off sockets; reset recovers a deadlock', () => {
  const game = run();
  game.level = 2;
  loadLevel(game);
  const player = game.players[0];
  game.crates[0] = { x: 1, y: 4 };
  player.x = 2;
  player.y = 4;
  player.direction = 'left';
  tick(game);
  assert.equal(player.x, 2);
  assert.equal(game.crates[0].x, 1);
  game.crates[1] = { x: 2, y: 3 };
  player.y = 3;
  player.x = 3;
  tick(game);
  assert.equal(game.crates[1].x, 1);
  player.x = 3;
  game.crates[2] = { x: 2, y: 3 };
  tick(game);
  assert.equal(game.crates[2].x, 2);
  assert.ok(rewindPuzzle(game));
  assert.deepEqual(game.crates[0], { x: 4, y: 5 });
  assert.equal(player.x, 1);
  assert.equal(player.direction, null);
  game.crates[0] = { ...game.sockets[0] };
  player.x = 4;
  player.y = 8;
  player.direction = 'down';
  tick(game);
  assert.equal(player.y, 8);
  assert.equal(game.crates[0].y, 9);
});

test('all five objectives can be solved via movement alone, solo or by a shared crew', () => {
  for (const count of [1, 10]) {
    const game = createGame();
    for (let i = 0; i < count; i++) addPlayer(game, `p${i}`, `Pilot ${i}`, '✦');
    startGame(game);
    for (let level = 0; level < 5; level++) {
      assert.equal(game.level, level);
      game.ghosts = []; // Isolate objective solvability from pursuit and lives.
      assert.equal(objectivesComplete(game), false);
      const optionalPowers = game.powers.size;
      if (game.cells.length) {
        for (const [index, cell] of game.cells.entries()) {
          const pilot = game.players[index % count];
          walk(game, cell.x, cell.y, pilot);
          walk(game, game.hub.x, game.hub.y, pilot);
        }
      }
      if (game.crates.length) {
        for (const [index, [x, y, direction, steps]] of [[4, 4, 'down', 4], [11, 12, 'up', 6], [18, 4, 'down', 4]].entries()) {
          const pilot = game.players[index % count];
          walk(game, x, y, pilot);
          pilot.direction = direction;
          for (let step = 0; step < steps; step++) tick(game);
          pilot.direction = null;
        }
      }
      // Avoid unsolved pads while travelling to the next signal.
      if (game.sequence.length) {
        for (let attempt = 0; attempt < 10 && game.progress < game.sequence.length; attempt++) {
          const pad = game.switches[game.sequence[game.progress]];
          walk(game, pad.x, pad.y, game.players[attempt % count]);
        }
      }
      assert.equal(objectivesComplete(game), true, `${count} pilots, level ${level + 1}`);
      assert.equal(game.transition, 0, 'must reach the exit, not just finish objectives');
      walk(game, game.exit.x, game.exit.y);
      assert.ok(game.powers.size <= optionalPowers, 'power pickups are not required to exit');
      if (level < 4) {
        assert.equal(game.transition, 2400);
        tick(game, 2400);
      } else assert.equal(game.status, 'won');
    }
  }
});

test('rewind is unavailable outside an active puzzle, and does not restore hearts or extend time', () => {
  const game = run();
  assert.equal(rewindPuzzle(game), false);
  game.level = 2;
  loadLevel(game);
  game.status = 'paused';
  assert.equal(rewindPuzzle(game), false);
  game.status = 'playing';
  game.players[0].lives = 1;
  game.remaining = 5000;
  assert.ok(rewindPuzzle(game));
  assert.equal(game.players[0].lives, 1);
  assert.equal(game.remaining, 0);
  tick(game);
  assert.equal(game.status, 'gameover');
});
