# crispy-enigma

## Neon Relay

An original, browser-based cooperative arcade puzzle adventure: carry energy through
mazes, decode signal routes, and push batteries into place to restore a sleeping city.
No accounts, external assets, or runtime dependencies.

### Play locally — Windows, WSL, macOS, or Linux

Install **Node.js 22 or newer**, open a terminal in this repository, then run:

```sh
npm start
```

Open **http://localhost:3000** in a modern browser. No `npm install` is needed.
Stop the server with Ctrl+C. To use a different port:

```powershell
# Windows PowerShell
$env:PORT=8080; npm start
```

```sh
# WSL / macOS / Linux
PORT=8080 npm start
```

### Solo or a crew of up to 10

- Choose a callsign and an icon, or upload a JPG, PNG, or WebP under 5 MB.
  Photos are cropped to a tiny avatar in your browser; the original isn't uploaded.
- **Let's play solo** starts immediately. **Start a party** creates a lobby with a
  six-character room code. Friends open the same server address and enter that code.
- Multiple tabs at `localhost` work for local testing. For separate devices on your
  trusted LAN, use the host computer's local IP, such as `http://192.168.1.20:3000`.
  Allow Node.js through the Windows firewall **on private networks only**.
- For LAN play from WSL, Windows' `localhost` forwarding alone doesn't expose the
  app to other devices. Run Node on Windows for the simplest setup, or configure
  WSL networking and firewall access yourself.
- The host starts and pauses the whole crew's run. Join before starting; late
  joins wait until the host returns to the lobby after the run. Leaving transfers
  hosting to the next player.

### How to play

Move with **WASD**, **arrow keys**, or the on-screen directional pad on touch devices.
Hold a direction to move; release to stop. A white triangle marks your pilot.
Press **Escape** to pause/resume if you're the host.

Each circuit has a **two-minute timer**, a visible mission briefing, shared objective
progress, and an exit marked **OUT** (shown as × until unlocked). Finish the objective,
then send any living pilot to OUT. Walking every corridor or collecting power-ups
is **not** required.

| Circuit | Challenge |
| --- | --- |
| 1 — Midnight Delivery | Navigate a maze, pick up three **E** energy cells, and deliver each to **H**. Carry only one at a time; each delivery scores 300. |
| 2 — Signal Garden | Navigate a drone-free maze and enter numbered pads in the displayed order. A wrong unsolved pad resets the sequence; completed pads are safe to cross. |
| 3 — Battery Workshop | Push three **B** batteries onto **+** sockets in a service-lane puzzle room. Batteries cannot pass through walls or each other, and lock when docked. |
| 4 — Cross-town Relay | Four maze deliveries with more, faster drones. Split delivery routes with your crew. |
| 5 — The Neon Heart | A drone-free finale combining battery docking AND a new signal sequence. Complete both to unlock OUT. |

Movement automatically picks up/delivers cells, activates pads on entry, and pushes
batteries; no additional interaction key is needed. Signal progress and cargo are
shared, so one pilot can finish what another started. A completed signal scores 600
once per level. All puzzles are solvable solo: no simultaneous switches or minimum
crew size. Teammates can overlap and don't obstruct pushes.

On courier circuits, a drone hit drops your carried cell at the collision location
and costs a heart. A disconnect releases carried cargo at its last position once
the pilot leaves/expires. Optional diamond cores activate **eight seconds of Overdrive
for the entire crew**, during which drones can be remixed for escalating
200/400/600/800-point bonuses. Mint drones are vulnerable; faded drones are temporarily
inactive. Each pilot starts with three hearts and has a three-second respawn shield.

On signal, cargo, and finale circuits, the host can use **Reset puzzle (−10 seconds)**
to restore pads, batteries, and pilot positions without restoring hearts or score.
Use it if a battery becomes stuck against an edge. Docked batteries deliberately
cannot be pulled back off sockets. Resetting cannot earn another signal score.

Clearing a circuit earns a time-based score bonus, resets the timer, and restores
one heart (maximum three), reviving eliminated teammates. The run ends when the
clock expires or the whole crew runs out of hearts. Clear all five to win.
A full run fits roughly ten minutes; earn the next circuit to continue.

**Sound off/on** toggles an original synthesized chiptune with an Overdrive variation.
It starts only after you click, never on page load. No copyrighted game art or
music is included. Respect reduced-motion preferences and take breaks!

### Development and checks

```sh
npm run check
npm test
```

- `game.js`: deterministic mazes, courier cargo, signal order, battery pushing,
  exit conditions, scoring, collisions, and five levels.
- `server.js`: Node HTTP server, room management, validated commands, authoritative
  simulation, and Server-Sent Events shared state.
- `public/`: responsive UI, canvas rendering, touch/keyboard controls, avatar processing,
  and Web Audio music.
- `test/`: Node's built-in unit and HTTP integration tests.

Rooms, photos, and scores are **in memory only** and disappear on server restart.
Disconnected pilots have 30 seconds to reconnect; the run freezes when every
connection is offline. Leaving a room removes that pilot's avatar from server state.
The host can restart after a loss or victory, or return to the lobby to invite more
people. There is no persistent leaderboard, public matchmaking, or save system.

This is a trusted-local-network first version, not a hardened public hosting service.
For internet deployment, use HTTPS and a reverse proxy that supports unbuffered SSE,
plus appropriate rate limiting and access controls. Don't expose your development
machine directly to the internet. Avatars are shared with the current room; use an
icon if you'd rather not share a photo.

### Possible next rounds

Possible next stages: branching courier routes, rotating-mirror signal puzzles,
weekly seeded challenges, optional accessibility speed settings, and a persistent
local leaderboard. The current version includes complete courier, signal-order,
and battery-docking modes rather than a dot-clearing chase loop.