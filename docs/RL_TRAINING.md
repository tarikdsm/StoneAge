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
  Local Node bridge that loads the current headless training rollout maps
  (`map01`, `map02`, `map03`), accepts JSON-line commands, and returns
  structured simulation results
- `src/game/data/mapSlotCodec.ts`
  Shared slot-file parser/validator reused by both the browser repository and
  the Node bridge
- `src/game/data/publishedMapLoader.ts`
  Shared published-map loader used by the RL bridge to turn `public/maps/*.json`
  into validated runtime `LevelData`

### Python side

- `trainer/ts_bridge.py`
  Subprocess management and JSON-line request/response handling
- `trainer/stoneage_env.py`
  Gymnasium environment backed by the TypeScript simulator process, with
  single-map or rotating-map curriculum support and a richer flattened
  observation layout for `MlpPolicy`
- `trainer/train_ppo.py`
  PPO smoke test and training entrypoint for one map or a simple rotation,
  including periodic evaluation, checkpoint metrics, and curve plots
- `trainer/evaluate_policy.py`
  Formal multi-episode evaluation for `random`, `heuristic`, `bc`, and `ppo`
  agents, including JSON reports under `trainer/eval_reports/`
- `trainer/eval_utils.py`
  Shared evaluation/reporting helpers used by both training and standalone
  evaluation
- `trainer/affordance_features.py`
  Derived tactical features extracted from the structured headless observation
  without changing gameplay rules
- `trainer/collect_heuristic_dataset.py`
  Dataset collector for the heuristic teacher on `map01`
- `trainer/train_behavior_cloning.py`
  First supervised imitation baseline for `map01`
- `trainer/bc_model.py`
  Simple PyTorch classifier used by the behavior-cloning baseline

## Protocol

Supported request types:

- `ping`
- `init`
- `create_env`
- `reset`
- `step`
- `heuristic_action`
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

The TypeScript simulator still returns the same structured numeric payload:

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

The Gymnasium environment now converts that payload into a richer fixed
`numpy` vector of length `955`, still compatible with `MlpPolicy`.

Current layout:

- `9 x 100` one-hot grid channels, flattened channel-first:
  - empty
  - player
  - original block
  - respawned block
  - active enemy
  - spawning enemy
  - digging enemy
  - column / wall
  - player caught
- auxiliary features:
  - player position
  - player facing one-hot
  - motion active
  - push cooldown
  - enemies alive
  - block counts
  - block respawn timer
  - elapsed stage time
  - raw score (scaled auxiliary feature)
- derived affordance / threat features:
  - free movement by direction
  - adjacent pushable blocks by direction
  - useful launch opportunities by direction
  - immediate enemy-lane threats
  - immediate escape-route availability
  - trapped-state flag
  - counts of productive / safe / legal actions
  - minimum enemy distance

This keeps the policy on `MlpPolicy` while giving it a much clearer spatial
signal than the original compact scalar grid encoding.

The per-step `info` payload also exposes:

- `map_id`
- `kills`
- `enemies_alive`
- `blocks_active`
- `raw_score`
- `decision_steps`
- `sim_steps`
- `cleared`
- `dead`
- `action_effective`
- `state_signature`

## Reward model

The PPO environment does not train directly on the visible game score.

Current reward base:

- `+1000` on clear
- `-1000` on death
- `+120` per enemy kill
- `-1` per decision
- `-0.05` per substep

Light diagnostic shaping added for the early learning phase:

- small novelty bonus on the first visit to a state signature
- gentle penalty for excessive repeated visits to the same state signature

Inference:
this keeps the objective anchored to clear/death/kill/time, but adds enough
signal to diagnose whether the agent is merely looping or exploring.

The older hard `-5` repeated-useless-action penalty was removed from this RL
phase so the reward stays closer to the objective definition above.

Per-step `info` now also exposes:

- `state_visit_count`
- `reward_novelty_bonus`
- `reward_repeat_state_penalty`
- `reward_repeated_useless_action_penalty`
- `repeated_useless_action`

## Behavior cloning baseline

To increase the amount of useful learning signal on `map01`, the trainer now
supports a first imitation-learning baseline:

- collect heuristic-teacher rollouts with `collect_heuristic_dataset.py`
- train a simple classifier with `train_behavior_cloning.py`
- evaluate it with the same `evaluate_policy.py` pipeline used for PPO

This gives the project three directly comparable baselines on `map01`:

- `random`
- `bc`
- `ppo`

The bridge exposes `heuristic_action` so Python can query the same
TypeScript-side teacher policy used by the browser simulator.

Evaluation reports now also include:

- action counts and frequencies
- no-op ratio
- space-action ratio
- empirical action entropy

These metrics are used to detect policy collapse, degenerate action loops, and
loss of launch usage.

## Determinism

`createStageState(level, { seed })` now accepts a seed override.

The headless simulator is deterministic relative to:

- map content
- seed
- action sequence
- fixed substep delta
- fixed decision repeat

## Current limitations

- the bridge currently supports only the first training rollout set:
  `map01`, `map02`, and `map03`
- the active learning phase is intentionally focused on `map01`
- the Node bridge uses a lightweight published-map validation path instead of
  the browser repository loader itself, but it now reuses the same authoritative
  slot-file parser and structural validation contract
- the observation is richer than before, but it is still a flattened vector
  rather than a CNN-style tensor or a `Dict` policy input
- the behavior-cloning baseline improves on `random` in map-clear terms, but it
  is still far below the direct heuristic teacher because of rollout
  distribution shift
- PPO currently defaults to `device=cpu` in `train_ppo.py` because this first
  baseline uses `MlpPolicy`, which Stable-Baselines3 generally handles better
  on CPU
- the current PPO experiments on `map01` still do not show successful clears,
  and action-distribution reports show policy collapse toward single-direction
  movement, so the new reporting infrastructure is currently being used to
  diagnose learning failure rather than confirm mastery

## Training presets

`train_ppo.py` now exposes simple long-run presets:

- `debug`
- `50k`
- `100k`
- `300k`

The current default is `map01` + `single` + `50k`.

Each run produces:

- periodic checkpoint `.zip` files in `trainer/models/`
- checkpoint metrics JSON in `trainer/eval_reports/`
- checkpoint metrics CSV in `trainer/eval_reports/`
- a reward/completion curve PNG in `trainer/eval_reports/`
- a run summary JSON with the random baseline, best checkpoint, and final report

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
trainer/.venv/Scripts/python.exe trainer/train_ppo.py --map-id map01 --curriculum single --preset debug --device cpu
```

Longer map01 run:

```bash
trainer/.venv/Scripts/python.exe trainer/train_ppo.py --map-id map01 --curriculum single --preset 50k --device cpu
```

Formal evaluation:

```bash
trainer/.venv/Scripts/python.exe trainer/evaluate_policy.py --agents random,bc,ppo --map-id map01 --curriculum single --episodes 20 --bc-model-path trainer/models/bc_map01_heuristic.pt --ppo-model-path trainer/models/ppo_stoneage_map01_affordance_debug_step0004000.zip
```

Collect heuristic-teacher dataset:

```bash
trainer/.venv/Scripts/python.exe trainer/collect_heuristic_dataset.py --map-id map01 --episodes 400 --output-name heuristic_map01_bc
```

Train behavior cloning:

```bash
trainer/.venv/Scripts/python.exe trainer/train_behavior_cloning.py --dataset-path trainer/datasets/heuristic_map01_bc.npz --output-name bc_map01_heuristic --device cpu --epochs 20
```
