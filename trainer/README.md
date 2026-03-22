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
- support a first curriculum step with single-map or rotating-map training

Current files:

- `smoke_test.py`
  Torch/CUDA smoke test for the trainer environment
- `ts_bridge.py`
  JSON-lines bridge to the local TypeScript simulator subprocess
- `stoneage_env.py`
  Gymnasium environment backed by the real TypeScript simulation, now with a
  richer flattened observation layout and light diagnostic reward shaping for
  novelty / loop detection
- `train_ppo.py`
  PPO entrypoint focused on `map01` by default, with presets for `50k`, `100k`,
  and `300k`, periodic checkpoint evaluation, JSON/CSV reports, and curve plots
- `evaluate_policy.py`
  Multi-episode evaluation for random or PPO agents, with terminal summaries
  and JSON reports under `eval_reports/`
- `eval_utils.py`
  Shared evaluation, reporting, and curve-generation helpers used by training
  and standalone evaluation

Planned next training files:

- `stoneage_env_wrappers.py`
- `export_policy.py`
- `replay_dataset.py`
- `curriculum_runner.py`
