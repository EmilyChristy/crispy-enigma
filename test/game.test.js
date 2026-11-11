import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startGame, tick, makeMaze, LEVELS, snapshot } from '../game.js';

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

test('walls block movement, sparks score once, and snapshots serialize collections', () => {
  const game = run();
  const player = game.players[0];
  player.direction = 'left';
  tick(game);
  assert.equal(player.x, 1);
  game.sparks.add('1,1');
  tick(game);
  assert.equal(game.score, 10);
  tick(game);
  assert.equal(game.score, 10);
  assert.equal(player.score, 10);
  assert.ok(Array.isArray(JSON.parse(JSON.stringify(snapshot(game))).sparks));
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
  game.sparks.delete('3,1');
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
    game.sparks.clear();
    game.powers.clear();
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
