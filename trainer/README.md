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
- evaluate trained policies across multiple published maps with JSON reports
- support a first curriculum step with single-map or rotating-map training

Current files:

- `smoke_test.py`
  Torch/CUDA smoke test for the trainer environment
- `ts_bridge.py`
  JSON-lines bridge to the local TypeScript simulator subprocess
- `stoneage_env.py`
  Gymnasium environment backed by the real TypeScript simulation
- `train_ppo.py`
  PPO entrypoint with smoke test, checkpoints, TensorBoard logs, and simple
  map rotation
- `evaluate_policy.py`
  Multi-episode evaluation for random or PPO agents, with terminal summaries
  and JSON reports under `eval_reports/`

Planned next training files:

- `stoneage_env_wrappers.py`
- `export_policy.py`
- `replay_dataset.py`
- `curriculum_runner.py`
