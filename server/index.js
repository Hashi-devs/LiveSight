// LiveSight server — Phase 0: serves the game files and opens a WebSocket hub.
// Run with `npm start` inside Termux on the host phone, then open the address it prints.

import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
app.use(express.static(path.join(root, 'client')));
app.use('/shared', express.static(path.join(root, 'shared')));
app.use('/assets', express.static(path.join(root, 'assets')));
// three.js comes from npm, so the game also works offline on the hotspot.
app.use('/vendor/fonts', express.static(path.join(root, 'node_modules', '@fontsource', 'barlow-semi-condensed', 'files')));
app.use('/vendor', express.static(path.join(root, 'node_modules', 'three', 'build')));

const server = createServer(app);
const wss = new WebSocketServer({ server });

let nextId = 1;
const players = new Map(); // id -> { ws, name }

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const { ws } of players.values()) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

function roster() {
  return [...players.entries()].map(([id, p]) => ({ id, name: p.name }));
}

wss.on('connection', (ws) => {
  const id = nextId++;
  players.set(id, { ws, name: `Player ${id}` });
  ws.send(JSON.stringify({ type: 'welcome', id }));
  broadcast({ type: 'roster', players: roster() });
  console.log(`+ Player ${id} joined (${players.size} online)`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = players.get(id);
    if (!p) return;
    if (msg.type === 'name' && typeof msg.name === 'string') {
      p.name = msg.name.trim().slice(0, 16) || p.name;
      broadcast({ type: 'roster', players: roster() });
    } else if (msg.type === 'ping') {
      // Test message: everyone sees who tapped "Ping".
      broadcast({ type: 'pinged', from: p.name, at: Date.now() });
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type: 'roster', players: roster() });
    console.log(`- Player ${id} left (${players.size} online)`);
  });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nLiveSight server is running.');
  console.log(`  On this phone:   http://localhost:${PORT}`);
  const addrs = lanAddresses();
  if (addrs.length) {
    for (const a of addrs) console.log(`  For friends:     http://${a}:${PORT}`);
  } else {
    console.log('  Turn on your hotspot to get an address for friends.');
  }
  console.log('Press Ctrl+C to stop.\n');
});
