# StoneAge Trainer Workspace

This folder is reserved for reinforcement-learning tooling and experiments.

Current scope:

- keep the Python training stack separate from the Phaser/Vite frontend
- use a local `.venv` so training dependencies do not leak into the game app
- validate CUDA/PyTorch readiness with `smoke_test.py`

Planned next training files:

- `stoneage_env.py`
- `train_ppo.py`
- `evaluate_policy.py`
- `export_policy.py`
- `replay_dataset.py`
