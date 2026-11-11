# crispy-enigma

## Neon Relay

An original, browser-based cooperative arcade game inspired by the chase-and-power-up
rhythm of 1980s arcades. No accounts, external assets, or runtime dependencies.

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

Collect every spark and diamond-shaped power core before the **two-minute level
timer** runs out. Avoid the drones! A core activates **eight seconds of Overdrive
for the entire crew**, during which drones can be remixed for escalating
200/400/600/800-point bonuses. Mint drones are edible; faded drones are temporarily
inactive. Each pilot starts with three hearts, and has a three-second shield after
respawning.

There are **five distinct circuits**, with more drones and faster pursuit as you
advance. Clearing a circuit earns a score bonus, resets the timer, and restores
one heart (maximum three), bringing eliminated teammates back. Split the maze
with friends to cover more ground! The run ends when the clock expires or the
whole crew runs out of hearts. Clear all five to win, then chase a new high score.
A full run fits roughly ten minutes; keep earning the next circuit to continue.

**Sound off/on** toggles an original synthesized chiptune with an Overdrive variation.
It starts only after you click, never on page load. No copyrighted game art or
music is included. Respect reduced-motion preferences and take breaks!

### Development and checks

```sh
npm run check
npm test
```

- `game.js`: deterministic maze generation, movement, scoring, collisions, five levels.
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

Fun additions to build in stages: weekly seeded challenges, optional accessibility
speed settings, a persistent local leaderboard, and a cooperative “rescue a friend”
pickup. The current version keeps the core loop and shared five-level run complete.