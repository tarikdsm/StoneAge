# RL Training Bridge

## Goal

The first RL stack for StoneAge keeps the TypeScript gameplay core as the
source of truth.

- TypeScript owns the deterministic headless simulation
- Python owns Gymnasium, rewards, PPO training, evaluation, and checkpoints
- the two sides communicate through a local Node subprocess over JSON lines on
  `stdin/stdout`

This avoids reimplementing gameplay rules in Python.

## Current architecture

### TypeScript side

- `src/game/simulation/headless/StoneAgeHeadlessSimulator.ts`
  Pure wrapper around `StageState.ts` and `RunProgress.ts`
- `trainer_bridge/stoneage_sim_server.ts`
  Local Node bridge that loads `map01`, accepts JSON-line commands, and returns
  structured simulation results

### Python side

- `trainer/ts_bridge.py`
  Subprocess management and JSON-line request/response handling
- `trainer/stoneage_env.py`
  Gymnasium environment backed by the TypeScript simulator process
- `trainer/train_ppo.py`
  PPO smoke test and first training entrypoint

## Protocol

Supported request types:

- `ping`
- `init`
- `create_env`
- `reset`
- `step`
- `close`

Example reset request:

```json
{"type":"reset","mapId":"map01","seed":123}
```

Example step request:

```json
{"type":"step","action":4,"decisionRepeat":4}
```

Example successful response:

```json
{
  "ok": true,
  "observation": {
    "grid": [0, 0, 0],
    "player_position": [4, 7],
    "player_facing": 3
  },
  "raw_score": 0,
  "terminated": false,
  "truncated": false,
  "info": {
    "map_id": "map01",
    "decision_steps": 1,
    "sim_steps": 4
  }
}
```

## Action space

The Python environment exposes `Discrete(10)`:

- `0`: none
- `1`: up
- `2`: down
- `3`: left
- `4`: right
- `5`: up + space
- `6`: down + space
- `7`: left + space
- `8`: right + space
- `9`: space

Action `9` currently means "attempt launch in the current facing direction."

## Observation model

The TypeScript simulator returns a structured numeric observation containing:

- flattened 10x10 playable grid
- player position
- player facing
- player motion flag
- push cooldown
- enemies alive
- active/original/respawned block counts
- block respawn timer
- elapsed stage time
- raw score

The Gymnasium environment converts that structure into a fixed `numpy` vector
of length `114`.

## Reward model

The PPO environment does not train directly on the visible game score.

Current reward:

- `+1000` on clear
- `-1000` on death
- `+120` per enemy kill
- `-1` per decision
- `-0.05` per substep
- `-5` for repeated useless action loops

## Determinism

`createStageState(level, { seed })` now accepts a seed override.

The headless simulator is deterministic relative to:

- map content
- seed
- action sequence
- fixed substep delta
- fixed decision repeat

## Current limitations

- the bridge currently loads only `map01`
- the Node bridge uses a lightweight published-map validation path instead of
  the full browser repository loader
- the observation is intentionally simple and vector-first; it is not yet a
  richer multi-channel tensor
- PPO currently defaults to `device=cpu` in `train_ppo.py` because this first
  baseline uses `MlpPolicy`, which Stable-Baselines3 generally handles better
  on CPU

## Local commands

CUDA / torch smoke:

```bash
trainer/.venv/Scripts/python.exe trainer/smoke_test.py
```

Headless bridge via Node:

```bash
npm run sim:server
```

Short PPO smoke run:

```bash
trainer/.venv/Scripts/python.exe trainer/train_ppo.py --timesteps 2048 --device cpu
```
