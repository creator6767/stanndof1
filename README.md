# 🎮 TACTICAL ARENA 8.0 — ELITE SQUAD

A 3D tactical first-person shooter built with HTML, CSS, JavaScript and Three.js.

## 🚀 Features

- 3D first-person shooter gameplay.
- Four difficulty levels: Recruit, Operative, Veteran and Nightmare.
- Two round durations: 2 minutes and 5 minutes.
- Three friendly squadmates: Raven, Ghost and Nova.
- Enemy AI with different accuracy, damage and movement speeds.
- Health regeneration after avoiding damage.
- Armor and stamina systems.
- Three selectable weapons.
- Fictional C4 objective with an interactive countdown.
- Team score and round statistics.
- FPS counter.
- Pause and restart system.
- Procedurally generated 3D arena and lighting.

## 🛠️ Technologies

- HTML5
- CSS3
- JavaScript (ES6+)
- Three.js

## 📁 Project Structure

```text
Tactical-Arena/
│
├── index.html
├── style.css
├── script.js
└── README.md
```

## 🎮 Controls

| Key | Action |
|---|---|
| W A S D | Move |
| SHIFT | Sprint |
| Mouse | Look around |
| Left Mouse Button | Shoot |
| Right Mouse Button | Aim |
| R | Reload |
| 1 / 2 / 3 | Switch weapons |
| E | Plant C4 in Area A |
| ESC | Pause |

## ⚔️ Difficulty Levels

**Recruit**
- 4 enemies
- Lower enemy accuracy
- Faster health regeneration

**Operative**
- 5 enemies
- Balanced enemy AI
- Standard health regeneration

**Veteran**
- 6 enemies
- Faster and more accurate enemies
- Slower health regeneration

**Nightmare**
- 7 enemies
- High enemy damage and accuracy
- Slowest health regeneration

## ❤️ Health System

Player health regenerates automatically after avoiding damage for a certain period.

Regeneration depends on the selected difficulty.

Armor absorbs part of incoming damage.

## 👥 Squad System

Your Alpha team includes:

- **RAVEN** — Rifleman
- **GHOST** — Support
- **NOVA** — Scout

Squadmates follow the player, search for visible enemies and provide combat support. They have their own health and can return to the fight after being taken out.

## 💣 C4 Objective

Reach Area A and press E to begin the fictional in-game C4 objective.

Complete the animation and protect the area until the game countdown finishes.

Completing the objective awards points to Team Alpha.

## ⏱️ Match System

Choose between:

- 2-minute quick match
- 5-minute full match

The round ends when the match timer reaches zero. The winner is determined by the team score.

## 📊 Performance

The game displays FPS in real time.

PING is displayed as OFFLINE because this version does not use an online multiplayer server.

## ▶️ How to Run

1. Download or
