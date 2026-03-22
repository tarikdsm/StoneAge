# StoneAge Trainer Workspace

This folder is reserved for reinforcement-learning tooling and experiments.

Current scope:

- keep the Python training stack separate from the Phaser/Vite frontend
- use a local `.venv` so training dependencies do not leak into the game app
- validate CUDA/PyTorch readiness with `smoke_test.py`
- expose the TypeScript gameplay simulation to Python through a local Node
  subprocess
- provide a first Gymnasium + PPO baseline without reimplementing rules in
  Python
- focus the current learning phase on `map01` before expanding map coverage
- evaluate trained policies with JSON reports, CSV checkpoint metrics, and
  training-curve plots
- enrich the learning signal on `map01` with affordance and threat features
- measure action distributions during evaluation so policy collapse is easy to
  spot
- support heuristic-dataset collection and a first behavior-cloning baseline
- support a first curriculum step with single-map or rotating-map training

Current files:

- `smoke_test.py`
  Torch/CUDA smoke test for the trainer environment
- `ts_bridge.py`
  JSON-lines bridge to the local TypeScript simulator subprocess
- `stoneage_env.py`
  Gymnasium environment backed by the real TypeScript simulation, now with a
  richer flattened observation layout, explicit affordance/threat features, and
  light diagnostic reward shaping for novelty / loop detection
- `train_ppo.py`
  PPO entrypoint focused on `map01` by default, with presets for `50k`, `100k`,
  and `300k`, periodic checkpoint evaluation, JSON/CSV reports, curve plots,
  and optional warm start from a behavior-cloning checkpoint
- `evaluate_policy.py`
  Multi-episode evaluation for `random`, `heuristic`, behavior-cloned (`bc`),
  or `ppo` agents, including action-distribution summaries and JSON reports
  under `eval_reports/`
- `eval_utils.py`
  Shared evaluation, reporting, and curve-generation helpers used by training
  and standalone evaluation
- `affordance_features.py`
  Derived tactical features such as free moves, useful launches, immediate
  threats, escape routes, and trapped-state signals
- `collect_heuristic_dataset.py`
  Rollout collector that records `observation -> action` pairs from the
  heuristic teacher on `map01`
- `train_behavior_cloning.py`
  Supervised baseline trainer that learns to imitate the heuristic teacher
- `bc_model.py`
  Lightweight PyTorch MLP used to save/load the behavior-cloning baseline

Best-checkpoint priority:

1. completion rate
2. lower death rate
3. average kills
4. average raw score
5. average reward

Warm-start note:

- `train_ppo.py` aligns the PPO MLP with the BC network by using `ReLU` and the
  same hidden sizes before copying the actor weights

Planned next training files:

- `stoneage_env_wrappers.py`
- `export_policy.py`
- `replay_dataset.py`
- `curriculum_runner.py`
