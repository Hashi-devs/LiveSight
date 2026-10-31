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

**Phase 1: solo prototype.** Play at https://hashi-devs.github.io/LiveSight/ (or `http://localhost:3000` when running the server).

- Team Deathmatch: you + 4 bots vs 5 bots, first to 25 kills, 8-minute limit
- Shooting Range: dummies standing, crouching and prone at different distances
- Movement: walk, sprint, jump, crouch, slide, prone, dive roll, mantle
- Camera: first person, third person, adaptive
- Guns: assault rifle, SMG, pistol · HP + blue shield · med kits and shield cells
- Graphics: Low / Medium / High picked from the phone's memory, lowered automatically if the frame rate drops

The connection test from Phase 0 is at `/client/test.html`.

## Fonts

| Use | Font | Licence | Where |
| --- | --- | --- | --- |
| Headers | Garet (Book, Heavy) | Free for commercial use (Spacetype) | Put `Garet-Heavy` and `Garet-Book` (.otf, .ttf or .woff2) in `assets/fonts/` |
| Numbers | Danson | Free version is personal use only; buy a licence before selling | Put `Danson` (.otf, .ttf or .woff2) in `assets/fonts/` |
| Body | Barlow Semi Condensed | SIL OFL, free for commercial use | Installed automatically from npm |

Until the Garet and Danson files are added, the game falls back to Barlow Semi Condensed.

## Phones

- **Android:** Chrome. Tap the menu → *Install app* / *Add to Home screen* to play full screen.
- **iPhone / iPad:** Safari → Share → *Add to Home Screen*, then open LiveSight from the home screen for full screen (iPhone Safari can't go full screen from a normal tab).
- **Hosting a hotspot match** needs an Android phone running Termux. iPhones can join as players.

