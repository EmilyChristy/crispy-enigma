import { makeMaze } from '/game.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const preview = {
  grid: makeMaze(17), sparks: [], powers: ['21,1', '1,15', '21,15', '11,7'],
  players: [{ id: 'preview', x: 1, y: 1, color: '#b6f5ce', avatar: '✦', lives: 3, shield: 0 }],
  ghosts: [{ x: 17, y: 11, rest: 0 }, { x: 9, y: 5, rest: 0 }], overdrive: 0,
};
preview.grid.forEach((row, y) => row.forEach((cell, x) => { if (!cell) preview.sparks.push(`${x},${y}`); }));
let game = null;
let session = null;
let events = null;
let selectedAvatar = '✦';
let busy = false;
let connected = false;
let lastAnnouncement = '';
let lastDirection = null;
let inputSequence = 0;
let errorTimer;
const avatarImages = new Map();
const TILE = 40;
const ghostColors = ['#fa9dbf', '#b2a1ff', '#ffca80', '#83d7f0', '#e7a7f6', '#e5e980'];

class ArcadeAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.beat = 0;
    this.timer = null;
  }
  async toggle() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio isn’t available in this browser.');
      this.context = new AudioContext();
      this.volume = this.context.createGain();
      this.volume.gain.value = 0.12;
      this.volume.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.timer = setInterval(() => this.step(), 160);
      this.step();
    } else {
      clearInterval(this.timer);
      // Suspending also stops any notes that are still ringing out.
      await this.context.suspend();
    }
    return this.enabled;
  }
  tone(frequency, duration, type = 'triangle', volume = 0.4) {
    if (!this.enabled || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, this.context.currentTime);
    envelope.gain.linearRampToValueAtTime(volume, this.context.currentTime + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(this.volume);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  step() {
    if (document.hidden || game?.status === 'paused') return;
    // An original, looping A-minor chiptune; no audio assets or tracking.
    const melody = [69, 76, 72, 76, 71, 76, 72, 79, 69, 76, 72, 76, 67, 74, 71, 74,
      65, 72, 69, 72, 67, 74, 71, 74, 64, 71, 68, 71, 68, 76, 71, 68];
    const n = this.beat++ % melody.length;
    const shift = game?.overdrive > 0 ? 12 : 0;
    this.tone(440 * 2 ** ((melody[n] + shift - 69) / 12), 0.13, 'square', 0.12);
    if (n % 4 === 0) {
      const bass = [45, 45, 43, 43, 41, 43, 40, 40][Math.floor(n / 4)];
      this.tone(440 * 2 ** ((bass - 69) / 12), 0.43, 'triangle', 0.65);
      this.tone(65, 0.08, 'sine', 0.5);
    }
  }
}
const audio = new ArcadeAudio();

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = false;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { $('error').hidden = true; }, 6500);
}

async function api(path, body = {}, authenticated = true) {
  const response = await fetch(`/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(authenticated ? session : {}), ...body }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function roundedRect(x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function render(time = 0) {
  const state = game?.grid.length ? game : preview;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0c1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < state.grid.length; y++) {
    for (let x = 0; x < state.grid[y].length; x++) {
      if (!state.grid[y][x]) continue;
      ctx.fillStyle = '#211c3b';
      ctx.strokeStyle = state.overdrive > 0 ? '#82618d' : '#514276';
      ctx.lineWidth = 1.6;
      roundedRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8, 7);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#e6dcb4';
  for (const point of state.sparks) {
    const [x, y] = point.split(',').map(Number);
    ctx.beginPath();
    ctx.arc(x * TILE + 20, y * TILE + 20, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  const pulse = reducedMotion ? 1 : 1 + Math.sin(time / 230) * 0.13;
  for (const point of state.powers) {
    const [x, y] = point.split(',').map(Number);
    ctx.fillStyle = '#b6f5ce';
    ctx.shadowColor = '#b6f5ce';
    ctx.shadowBlur = 16;
    ctx.save();
    ctx.translate(x * TILE + 20, y * TILE + 20);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6 * pulse, -6 * pulse, 12 * pulse, 12 * pulse);
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  state.ghosts.forEach((ghost, i) => {
    const x = ghost.x * TILE + 20;
    const y = ghost.y * TILE + 20 + (reducedMotion ? 0 : Math.sin(time / 210 + i) * 2);
    ctx.globalAlpha = ghost.rest > 0 ? 0.3 : 1;
    ctx.fillStyle = state.overdrive > 0 ? '#b6f5ce' : ghostColors[i];
    ctx.beginPath();
    ctx.arc(x, y - 2, 13, Math.PI, 0);
    ctx.lineTo(x + 13, y + 13);
    ctx.lineTo(x + 6, y + 8);
    ctx.lineTo(x, y + 13);
    ctx.lineTo(x - 6, y + 8);
    ctx.lineTo(x - 13, y + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#16152a';
    ctx.fillRect(x - 7, y - 3, 4, 6);
    ctx.fillRect(x + 3, y - 3, 4, 6);
    if (state.overdrive > 0) ctx.fillRect(x - 4, y + 6, 8, 2);
    ctx.globalAlpha = 1;
  });
  for (const player of state.players) {
    if (!player.lives) continue;
    const x = player.x * TILE + 20;
    const y = player.y * TILE + 20;
    ctx.save();
    if (player.shield > 0) {
      ctx.strokeStyle = player.color;
      ctx.globalAlpha = reducedMotion ? 0.8 : 0.5 + Math.sin(time / 100) * 0.3;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = player.id === session?.id ? 14 : 4;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (player.avatar.startsWith('data:')) {
      if (!avatarImages.has(player.avatar)) {
        const image = new Image();
        image.src = player.avatar;
        avatarImages.set(player.avatar, image);
      }
      const image = avatarImages.get(player.avatar);
      if (image.complete && image.naturalWidth) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(image, x - 12, y - 12, 24, 24);
      }
    } else {
      ctx.fillStyle = '#15271f';
      ctx.font = '20px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.avatar, x, y + 1);
    }
    ctx.restore();
    if (player.id === session?.id) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x - 4, y - 26);
      ctx.lineTo(x + 4, y - 26);
      ctx.fill();
    }
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

let rosterSignature = '';
function updateUI() {
  if (!game) return;
  const host = game.host === session?.id;
  const playing = ['playing', 'paused'].includes(game.status);
  const ended = ['won', 'gameover'].includes(game.status);
  $('setup').hidden = true;
  $('room-panel').hidden = false;
  document.body.classList.add('in-room');
  $('code-display').textContent = game.code;
  $('room-title').textContent = playing ? 'Keep the relay alive.' : 'Better together.';
  $('start').hidden = !host || playing;
  $('start').textContent = ended ? 'Run it back ↗' : 'Start the run ↗';
  $('pause').hidden = !host || !playing;
  $('pause').textContent = game.status === 'paused' ? 'Resume run ▷' : 'Pause run Ⅱ';
  $('lobby').hidden = !host || !ended;
  $('host-note').textContent = host ? 'You’re the host. You control the start and pause buttons.' :
    'Your host controls the run. Get ready to make some sparks.';
  $('score').textContent = String(game.score).padStart(6, '0');
  const seconds = Math.ceil(game.remaining / 1000);
  $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('timer-label').textContent = 'TIME LEFT';
  $('level-number').textContent = String(game.level + 1).padStart(2, '0');
  $('stage-label').textContent = game.status === 'lobby' ? 'CREW ASSEMBLING' : game.status === 'paused' ? 'TAKING A BREATHER' : 'LIVE CIRCUIT';
  $('level-label').textContent = `${String(game.level + 1).padStart(2, '0')} / ${game.levelName.toUpperCase()}`;
  $('sparks-left').textContent = `✦ ${game.sparks.length + game.powers.length} SPARKS & CORES LEFT`;
  const me = game.players.find(p => p.id === session?.id);
  $('hearts').textContent = me ? '♥'.repeat(me.lives) + '♡'.repeat(3 - me.lives) : '';
  $('overdrive').hidden = !game.overdrive || game.status !== 'playing' || game.transition > 0;
  $('overdrive-time').textContent = ` ${Math.ceil(game.overdrive / 1000)}s`;
  const signature = JSON.stringify(game.players.map(p => [p.id, p.lives, p.score, p.connected]).concat([game.host]));
  if (signature !== rosterSignature) {
    rosterSignature = signature;
    $('players').replaceChildren(...game.players.map(player => {
      const li = document.createElement('li');
      const icon = document.createElement('span');
      icon.className = 'player-icon';
      if (player.avatar.startsWith('data:')) {
        const image = document.createElement('img');
        image.src = player.avatar;
        image.alt = '';
        icon.append(image);
      } else icon.textContent = player.avatar;
      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = player.name + (player.id === session?.id ? ' (you)' : '') + (player.id === game.host ? ' · host' : '');
      const detail = document.createElement('span');
      detail.className = 'player-detail';
      detail.textContent = !player.connected ? 'reconnecting…' : game.status === 'lobby' ? 'READY' :
        `${'♥'.repeat(player.lives) || 'watching'} · ${player.score}`;
      li.append(icon, name, detail);
      return li;
    }));
  }
  const overlay = $('overlay');
  overlay.hidden = game.status === 'playing' && game.transition <= 0;
  if (!overlay.hidden) {
    const labels = game.status === 'lobby' ? ['✳', 'THE CREW IS COMING TOGETHER', 'Ready, player?', host ? 'Invite your friends, or start a solo adventure.' : 'Waiting for your host to start the run.', `${game.players.length} / 10 PILOTS CHECKED IN`] :
      game.status === 'paused' ? ['Ⅱ', 'A LITTLE BREATHER', 'Take your time.', host ? 'Resume when you’re ready. Your sparks can wait.' : 'Your host has paused the run.', 'CLOCK PAUSED · GOOD VIBES INTACT'] :
      game.status === 'won' ? ['✦', 'FIVE CIRCUITS. ONE INCREDIBLE CREW.', 'You are electric.', game.message, `FINAL SCORE · ${game.score.toLocaleString()}`] :
      game.status === 'gameover' ? ['♡', 'EVERY END IS A NEW START', 'One more go?', game.message, `CREW SCORE · ${game.score.toLocaleString()}`] :
      ['↗', 'CIRCUIT COMPLETE', 'Keep that glow.', game.message, `UP NEXT · CIRCUIT ${game.level + 2}`];
    ['overlay-icon', 'overlay-kicker', 'overlay-title', 'overlay-copy', 'overlay-tag'].forEach((id, i) => { $(id).textContent = labels[i]; });
  }
  if (game.message !== lastAnnouncement) {
    lastAnnouncement = game.message;
    $('announcement').textContent = game.message;
  }
}

function connect() {
  events?.close();
  connected = false;
  events = new EventSource(`/api/events?id=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`);
  events.onmessage = event => {
    const next = JSON.parse(event.data);
    if (!next.players.some(p => p.id === session?.id)) {
      reset();
      showError('You left the room. Create or join a new one.');
      return;
    }
    if (game && next.overdrive > game.overdrive) audio.tone(880, 0.25, 'triangle', 0.6);
    if (game && next.level > game.level) audio.tone(1046.5, 0.6, 'triangle', 0.5);
    game = next;
    connected = true;
    $('connection').textContent = 'CONNECTED';
    updateUI();
  };
  events.onerror = () => {
    connected = false;
    lastDirection = null;
    $('connection').textContent = 'RECONNECTING';
    $('announcement').textContent = 'Connection lost. Reconnecting… If the room expired, leave and join again.';
  };
}

async function join(mode) {
  if (busy) return;
  if (!$('pilot-form').reportValidity()) return;
  if (mode === 'join' && !/^[a-f0-9]{6}$/i.test($('room-code').value.trim())) {
    showError('Enter the six-character room code from your host.');
    return;
  }
  busy = true;
  for (const id of ['solo', 'create', 'join']) $(id).disabled = true;
  try {
    session = await api('join', {
      name: $('name').value, avatar: selectedAvatar,
      code: mode === 'join' ? $('room-code').value.trim() : '',
    }, false);
    connect();
    if (mode === 'solo') await api('action', { action: 'start' });
    canvas.focus({ preventScroll: true });
  } catch (error) {
    showError(error.message);
  } finally {
    busy = false;
    for (const id of ['solo', 'create', 'join']) $(id).disabled = false;
  }
}

function reset() {
  events?.close();
  events = null;
  session = null;
  game = null;
  connected = false;
  lastDirection = null;
  rosterSignature = '';
  avatarImages.clear();
  held.length = 0;
  document.body.classList.remove('in-room');
  $('setup').hidden = false;
  $('room-panel').hidden = true;
  $('overdrive').hidden = true;
  $('overlay').hidden = false;
  $('overlay-icon').textContent = '✳';
  $('overlay-kicker').textContent = 'WELCOME TO THE NIGHT SHIFT';
  $('overlay-title').textContent = 'Small sparks. Big adventures.';
  $('overlay-copy').textContent = 'Your next high score is a click away.';
  $('overlay-tag').textContent = 'READY WHEN YOU ARE';
  $('score').textContent = '000000';
  $('timer').textContent = '02:00';
  $('timer-label').textContent = 'TIME PER LEVEL';
  $('level-number').textContent = '01';
  $('stage-label').textContent = 'ATTRACT MODE';
  $('level-label').textContent = '01 / MIDNIGHT MARKET';
  $('sparks-left').textContent = '✦ COLLECT EVERY SPARK TO ADVANCE';
  $('hearts').textContent = '♡ ♡ ♡';
  lastAnnouncement = '';
  $('announcement').textContent = 'A familiar feeling. An entirely new adventure.';
}

async function action(name) {
  try {
    await api('action', { action: name });
    if (name === 'leave') reset();
    else canvas.focus({ preventScroll: true });
  } catch (error) { showError(error.message); }
}
$('pilot-form').addEventListener('submit', event => { event.preventDefault(); join('solo'); });
$('create').addEventListener('click', () => join('party'));
$('join').addEventListener('click', () => join('join'));
$('room-code').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); join('join'); }
});
for (const name of ['start', 'pause', 'lobby', 'leave']) $(name).addEventListener('click', () => action(name));
$('sound').addEventListener('click', async () => {
  try {
    const enabled = await audio.toggle();
    $('sound').textContent = enabled ? '♫ Sound on' : '♫ Sound off';
    $('sound').setAttribute('aria-pressed', String(enabled));
  } catch (error) { showError(error.message); }
});
$('copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(session.code);
    $('copy-label').textContent = 'COPIED ✓';
    setTimeout(() => { $('copy-label').textContent = 'COPY CODE ↗'; }, 1800);
  } catch { showError('Select and share the room code above. Clipboard access requires localhost or HTTPS.'); }
});
document.querySelectorAll('[data-avatar]').forEach(button => button.addEventListener('click', () => {
  selectedAvatar = button.dataset.avatar;
  document.querySelectorAll('[data-avatar]').forEach(other => {
    const active = other === button;
    other.classList.toggle('selected', active);
    other.setAttribute('aria-pressed', String(active));
  });
  $('photo').value = '';
  $('photo-label').textContent = '↥ Or use your own photo';
}));
$('photo').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showError('Choose a JPG, PNG, or WebP under 5 MB.'); return;
  }
  try {
    const image = await createImageBitmap(file);
    if (image.width > 10000 || image.height > 10000) { image.close(); throw new Error('Please use a smaller photo.'); }
    const thumbnail = document.createElement('canvas');
    thumbnail.width = thumbnail.height = 64;
    const context = thumbnail.getContext('2d');
    const size = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 64, 64);
    image.close();
    selectedAvatar = thumbnail.toDataURL('image/jpeg', 0.7);
    document.querySelectorAll('[data-avatar]').forEach(button => {
      button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false');
    });
    $('photo-label').textContent = '✓ Your photo is ready';
  } catch { showError('That photo couldn’t be read. Try a different image.'); }
});

const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
const held = [];
function move(direction) {
  if (!session || !connected || game?.status !== 'playing' || lastDirection === direction) return;
  lastDirection = direction;
  api('input', { direction, sequence: ++inputSequence }).catch(() => { lastDirection = null; });
}
document.addEventListener('keydown', event => {
  if (!session || ['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape' && game?.host === session.id && ['playing', 'paused'].includes(game.status)) {
    event.preventDefault();
    if (!event.repeat) action('pause');
    return;
  }
  const direction = keys[event.key] || keys[event.key.toLowerCase()];
  if (!direction) return;
  event.preventDefault();
  if (!held.includes(event.code)) held.push(event.code);
  move(direction);
});
document.addEventListener('keyup', event => {
  const index = held.indexOf(event.code);
  if (index >= 0) {
    held.splice(index, 1);
    const last = held.at(-1);
    const fallback = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    move(last ? fallback[last] : null);
  }
});
function stopMoving() {
  held.length = 0;
  move(null);
}
window.addEventListener('blur', stopMoving);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMoving(); });
document.querySelectorAll('[data-direction]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    move(button.dataset.direction);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => move(null));
});
