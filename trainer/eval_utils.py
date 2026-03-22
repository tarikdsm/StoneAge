from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, DefaultDict, Dict, Iterable, Optional, Sequence

import matplotlib
import numpy as np
from stable_baselines3 import PPO

from stoneage_env import StoneAgeEnv


matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def resolve_map_ids(map_id: str, map_ids: str, curriculum: str) -> list[str]:
    resolved = [candidate.strip() for candidate in map_ids.split(",") if candidate.strip()] if map_ids.strip() else [map_id]
    if not resolved:
        raise ValueError("At least one map id is required.")

    if curriculum == "single" and len(resolved) > 1:
        raise ValueError("Curriculum 'single' expects exactly one map. Use 'rotation' for multiple maps.")

    return resolved


def create_env(
    map_ids: Sequence[str],
    curriculum: str,
    decision_repeat: int,
    max_decision_steps: int,
    seed: int,
) -> StoneAgeEnv:
    return StoneAgeEnv(
        map_id=map_ids[0],
        map_ids=map_ids,
        curriculum_mode=curriculum,
        max_decision_steps=max_decision_steps,
        decision_repeat=decision_repeat,
        seed=seed,
    )


def load_model(agent: str, model_path: str, device: str, model: Optional[PPO]) -> Optional[PPO]:
    if agent != "ppo":
        return None

    if model is not None:
        return model

    if not model_path.strip():
        raise ValueError("PPO evaluation requires a model instance or --model-path.")

    return PPO.load(model_path, device=device)


def select_action(
    agent: str,
    observation: np.ndarray,
    env: StoneAgeEnv,
    model: Optional[PPO],
    deterministic: bool,
) -> int:
    if agent == "random":
        return int(env.action_space.sample())

    if agent == "ppo":
        if model is None:
            raise ValueError("PPO agent requested without a loaded model.")
        action, _ = model.predict(observation, deterministic=deterministic)
        return int(action)

    raise ValueError(f"Unsupported agent {agent}.")


def summarize_episode_results(episodes: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    if not episodes:
        raise ValueError("Cannot summarize an empty evaluation set.")

    completed = sum(1 for episode in episodes if episode["cleared"])
    dead = sum(1 for episode in episodes if episode["dead"])

    def average(key: str) -> float:
        return float(sum(float(episode[key]) for episode in episodes) / len(episodes))

    return {
        "episodes": len(episodes),
        "completion_rate": completed / len(episodes),
        "death_rate": dead / len(episodes),
        "average_kills": average("kills"),
        "average_reward": average("reward"),
        "average_raw_score": average("raw_score"),
        "average_decision_steps": average("decision_steps"),
        "average_sim_steps": average("sim_steps"),
    }


def compare_eval_summaries(left: Dict[str, Any], right: Dict[str, Any]) -> int:
    left_key = (
        float(left["completion_rate"]),
        -float(left["death_rate"]),
        float(left["average_kills"]),
        float(left["average_reward"]),
        float(left["average_raw_score"]),
        -float(left["average_decision_steps"]),
        -float(left["average_sim_steps"]),
    )
    right_key = (
        float(right["completion_rate"]),
        -float(right["death_rate"]),
        float(right["average_kills"]),
        float(right["average_reward"]),
        float(right["average_raw_score"]),
        -float(right["average_decision_steps"]),
        -float(right["average_sim_steps"]),
    )
    if left_key == right_key:
        return 0
    return 1 if left_key > right_key else -1


def evaluate_agent(
    agent: str,
    map_ids: Sequence[str],
    curriculum: str,
    episodes: int,
    decision_repeat: int,
    max_decision_steps: int,
    seed: int,
    model_path: str = "",
    device: str = "cpu",
    deterministic: bool = True,
    model: Optional[PPO] = None,
) -> Dict[str, Any]:
    env = create_env(map_ids, curriculum, decision_repeat, max_decision_steps, seed)
    loaded_model = load_model(agent, model_path, device, model)
    per_map_episodes: DefaultDict[str, list[Dict[str, Any]]] = defaultdict(list)
    all_episodes: list[Dict[str, Any]] = []

    try:
        for episode_index in range(episodes):
            observation, reset_info = env.reset(seed=seed + episode_index)
            episode_map_id = str(reset_info["map_id"])
            total_reward = 0.0

            while True:
                action = select_action(agent, observation, env, loaded_model, deterministic)
                observation, reward, terminated, truncated, info = env.step(action)
                total_reward += reward

                if terminated or truncated:
                    episode_result = {
                        "episode_index": episode_index,
                        "map_id": episode_map_id,
                        "cleared": bool(info["cleared"]),
                        "dead": bool(info["dead"]),
                        "kills": int(info["kills"]),
                        "reward": float(total_reward),
                        "raw_score": int(info["raw_score"]),
                        "decision_steps": int(info["decision_steps"]),
                        "sim_steps": int(info["sim_steps"]),
                        "truncated": bool(truncated),
                    }
                    all_episodes.append(episode_result)
                    per_map_episodes[episode_map_id].append(episode_result)
                    break
    finally:
        env.close()

    per_map = {map_id: summarize_episode_results(results) for map_id, results in per_map_episodes.items()}
    summary = summarize_episode_results(all_episodes)

    return {
        "agent": agent,
        "model_path": model_path or None,
        "curriculum": curriculum,
        "map_ids": list(map_ids),
        "summary": summary,
        "per_map": per_map,
        "episodes": all_episodes,
    }


def print_report(report: Dict[str, Any], prefix: str = "eval") -> None:
    summary = report["summary"]
    print(
        "[%s:%s] completion_rate=%.3f death_rate=%.3f avg_kills=%.2f avg_reward=%.2f avg_raw_score=%.2f avg_decision_steps=%.2f avg_sim_steps=%.2f"
        % (
            prefix,
            report["agent"],
            summary["completion_rate"],
            summary["death_rate"],
            summary["average_kills"],
            summary["average_reward"],
            summary["average_raw_score"],
            summary["average_decision_steps"],
            summary["average_sim_steps"],
        )
    )

    for map_id, map_summary in sorted(report["per_map"].items()):
        print(
            "[%s:%s:%s] completion_rate=%.3f death_rate=%.3f avg_reward=%.2f avg_raw_score=%.2f"
            % (
                prefix,
                report["agent"],
                map_id,
                map_summary["completion_rate"],
                map_summary["death_rate"],
                map_summary["average_reward"],
                map_summary["average_raw_score"],
            )
        )


def write_json(path: Path, payload: Dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")
    return path


def write_csv(path: Path, fieldnames: Sequence[str], rows: Iterable[Dict[str, Any]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return path


def save_training_curve(records: Sequence[Dict[str, Any]], output_path: Path) -> Optional[Path]:
    if not records:
        return None

    timesteps = [int(record["timesteps"]) for record in records]
    avg_rewards = [float(record["average_reward"]) for record in records]
    completion_rates = [float(record["completion_rate"]) for record in records]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure, axes = plt.subplots(2, 1, figsize=(9, 7), sharex=True)

    axes[0].plot(timesteps, avg_rewards, marker="o", color="#1d4ed8")
    axes[0].set_ylabel("Average Reward")
    axes[0].set_title("StoneAge RL Training Progress")
    axes[0].grid(True, alpha=0.3)

    axes[1].plot(timesteps, completion_rates, marker="o", color="#15803d")
    axes[1].set_xlabel("Timesteps")
    axes[1].set_ylabel("Completion Rate")
    axes[1].set_ylim(0.0, 1.0)
    axes[1].grid(True, alpha=0.3)

    figure.tight_layout()
    figure.savefig(output_path, dpi=150)
    plt.close(figure)
    return output_path


def build_eval_reports_dir() -> Path:
    return Path(__file__).resolve().parent / "eval_reports"


def default_timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def to_serializable_float(value: float) -> float:
    if math.isfinite(value):
        return float(value)
    return 0.0
