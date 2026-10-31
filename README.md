# LiveSight

A mobile 3D hero shooter in the style of Apex Legends Mobile and Blood Strike. It runs in Android phone browsers, and friends join over a WiFi hotspot like Mini Militia.

- **Engine:** three.js (client), Node.js + Express + WebSockets (server)
- **Modes:** Squad Battle (up to 10 players: Team Deathmatch, Capture Posts), Battle Royale (later)
- **Heroes:** Xavier, Phantom, Kentaro, Franklin, Surprise, Esú, Hector
- **Base spec:** 2 GB RAM, Android 9+, 1.6 GHz processor

## Run it on the host phone (Termux)

Install **Termux from F-Droid** (not the Play Store), then:

```sh
pkg update && pkg upgrade
pkg install nodejs git
git clone https://github.com/Hashi-devs/livesight.git
cd livesight
npm install
npm start
```

1. Turn on your phone's hotspot.
2. Open `http://localhost:3000` in Chrome on your phone.
3. Friends join your hotspot and open the **For friends** address that Termux prints (usually `http://192.168.43.1:3000` or similar).

Next time, just `cd livesight && git pull && npm start`.

## Project layout

```
server/   game server (referee): loop, combat, skills, bots
shared/   data used by server and client: heroes.json, weapons.json
client/   the game in the browser: rendering, camera, controls, HUD
assets/   models (.glb), sounds, fonts (Garet)
```

## Status

Phase 0: connection test. Open the page on two phones and tap **Ping everyone** to check they see each other.
