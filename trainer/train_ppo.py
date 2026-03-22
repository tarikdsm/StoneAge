from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.monitor import Monitor

from stoneage_env import StoneAgeEnv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train PPO against the StoneAge TypeScript simulator.")
    parser.add_argument("--map-id", default="map01")
    parser.add_argument("--map-ids", default="")
    parser.add_argument("--curriculum", choices=("single", "rotation"), default="single")
    parser.add_argument("--timesteps", type=int, default=2048)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--decision-repeat", type=int, default=4)
    parser.add_argument("--max-decision-steps", type=int, default=600)
    parser.add_argument("--smoke-steps", type=int, default=8)
    parser.add_argument("--model-name", default="")
    return parser.parse_args()


def resolve_map_ids(args: argparse.Namespace) -> list[str]:
    if args.map_ids.strip():
        map_ids = [candidate.strip() for candidate in args.map_ids.split(",") if candidate.strip()]
    else:
        map_ids = [args.map_id]

    if not map_ids:
        raise ValueError("At least one map id is required for training.")

    if args.curriculum == "single" and len(map_ids) > 1:
        raise ValueError("Curriculum 'single' expects exactly one training map. Use --curriculum rotation for multiple maps.")

    return map_ids


def build_model_name(map_ids: Sequence[str], curriculum: str, explicit_name: str) -> str:
    if explicit_name.strip():
        return explicit_name.strip()

    joined_maps = "_".join(map_ids)
    return f"ppo_stoneage_{curriculum}_{joined_maps}"


def run_smoke_test(env: StoneAgeEnv, smoke_steps: int, map_ids: Sequence[str]) -> None:
    for map_id in map_ids:
        observation, info = env.reset(seed=123, options={"map_id": map_id})
        assert isinstance(observation, np.ndarray)
        assert observation.shape == env.observation_space.shape
        assert observation.dtype == np.float32
        print(f"[smoke] reset ok: shape={observation.shape}, map={info['map_id']}, raw_score={info['raw_score']}")

        for step_index in range(smoke_steps):
            action = env.action_space.sample()
            observation, reward, terminated, truncated, info = env.step(action)
            assert isinstance(observation, np.ndarray)
            assert observation.shape == env.observation_space.shape
            assert isinstance(reward, float)
            print(
                "[smoke] map=%s step=%s action=%s reward=%.2f terminated=%s truncated=%s kills=%s raw_score=%s"
                % (
                    map_id,
                    step_index,
                    action,
                    reward,
                    terminated,
                    truncated,
                    info["kills"],
                    info["raw_score"],
                )
            )
            if terminated or truncated:
                break


def evaluate_trained_policy(env: StoneAgeEnv, model: PPO, map_ids: Sequence[str]) -> None:
    for map_id in map_ids:
        observation, _ = env.reset(seed=321, options={"map_id": map_id})
        total_reward = 0.0
        for _ in range(env.max_decision_steps):
            action, _ = model.predict(observation, deterministic=True)
            observation, reward, terminated, truncated, info = env.step(int(action))
            total_reward += reward
            if terminated or truncated:
                print(
                    "[eval] map=%s reward=%.2f cleared=%s dead=%s raw_score=%s decision_steps=%s sim_steps=%s"
                    % (
                        map_id,
                        total_reward,
                        info["cleared"],
                        info["dead"],
                        info["raw_score"],
                        info["decision_steps"],
                        info["sim_steps"],
                    )
                )
                break
        else:
            print(f"[eval] map={map_id} reward={total_reward:.2f} reached the decision limit without termination")


def main() -> None:
    args = parse_args()
    map_ids = resolve_map_ids(args)

    trainer_root = Path(__file__).resolve().parent
    models_dir = trainer_root / "models"
    logs_dir = trainer_root / "logs" / "ppo_stoneage"
    models_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    env = StoneAgeEnv(
        map_id=map_ids[0],
        map_ids=map_ids,
        curriculum_mode=args.curriculum,
        max_decision_steps=args.max_decision_steps,
        decision_repeat=args.decision_repeat,
        seed=args.seed,
    )

    try:
        print(f"[train] maps={','.join(map_ids)} curriculum={args.curriculum}")
        run_smoke_test(env, args.smoke_steps, map_ids)

        monitored_env = Monitor(env)
        model = PPO(
            policy="MlpPolicy",
            env=monitored_env,
            learning_rate=3e-4,
            n_steps=2048,
            batch_size=256,
            gamma=0.99,
            gae_lambda=0.95,
            clip_range=0.2,
            ent_coef=0.01,
            verbose=1,
            tensorboard_log=str(logs_dir),
            seed=args.seed,
            device=args.device,
        )

        model_name = build_model_name(map_ids, args.curriculum, args.model_name)
        checkpoint_callback = CheckpointCallback(
            save_freq=1024,
            save_path=str(models_dir),
            name_prefix=model_name,
        )

        model.learn(total_timesteps=args.timesteps, callback=checkpoint_callback, progress_bar=False)
        final_model_path = models_dir / model_name
        model.save(str(final_model_path))
        print(f"[train] saved final model to {final_model_path}")

        evaluate_trained_policy(env, model, map_ids)
    finally:
        env.close()


if __name__ == "__main__":
    main()
