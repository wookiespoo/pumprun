# PumpRun — Get Rich or Get Rugged

A Subway-style endless runner in the browser. Scoop **$BAGS**, dodge buses and hurdles, and don't let the 5-0 catch you.

**Play:** [https://playpumprun.fun](https://playpumprun.fun)

## Controls

| Input | Action |
| --- | --- |
| **A / D** or swipe | Change lane |
| **SPACE** | Jump |
| **S** | Slide |
| **Esc / P** | Pause |

First hit starts the chase. Second hit while the cop is on you = **rugged**.

## Run locally

Static site — no build, no API keys.

```bash
python -m http.server 8081
```

Open http://localhost:8081

## Stack

- Three.js r170 (ESM / import map)
- GLB characters, cops, city, and obstacles
- Client-only — no backend, no wallets, no secrets

## License / art

Game code is yours to run. 3D/audio assets are pipeline-processed stand-ins or processed source models. See `assets/audio/CREDITS.txt` for audio notes.
