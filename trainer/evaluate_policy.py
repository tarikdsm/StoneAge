from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, DefaultDict, Dict, Optional, Sequence

import numpy as np
from stable_baselines3 import PPO

from stoneage_env import StoneAgeEnv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate StoneAge RL policies against the TypeScript simulator.")
    parser.add_argument("--agents", default="random", help="Comma-separated list: random,ppo")
    parser.add_argument("--model-path", default="")
    parser.add_argument("--map-id", default="map01")
    parser.add_argument("--map-ids", default="")
    parser.add_argument("--curriculum", choices=("single", "rotation"), default="single")
    parser.add_argument("--episodes", type=int, default=12)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--decision-repeat", type=int, default=4)
    parser.add_argument("--max-decision-steps", type=int, default=600)
    parser.add_argument("--deterministic", action=argparse.BooleanOptionalAction, default=True)
    return parser.parse_args()


def resolve_map_ids(args: argparse.Namespace) -> list[str]:
    if args.map_ids.strip():
        map_ids = [candidate.strip() for candidate in args.map_ids.split(",") if candidate.strip()]
    else:
        map_ids = [args.map_id]

    if not map_ids:
        raise ValueError("At least one map id is required for evaluation.")

    if args.curriculum == "single" and len(map_ids) > 1:
        raise ValueError("Curriculum 'single' expects exactly one map. Use --curriculum rotation for multiple maps.")

    return map_ids


def resolve_agents(raw_agents: str) -> list[str]:
    agents = [candidate.strip().lower() for candidate in raw_agents.split(",") if candidate.strip()]
    if not agents:
        raise ValueError("At least one agent must be specified.")

    supported_agents = {"random", "ppo"}
    unsupported_agents = [agent for agent in agents if agent not in supported_agents]
    if unsupported_agents:
        raise ValueError(f"Unsupported agents: {', '.join(unsupported_agents)}")

    return agents


def create_env(map_ids: Sequence[str], curriculum: str, decision_repeat: int, max_decision_steps: int, seed: int) -> StoneAgeEnv:
    return StoneAgeEnv(
        map_id=map_ids[0],
        map_ids=map_ids,
        curriculum_mode=curriculum,
        max_decision_steps=max_decision_steps,
        decision_repeat=decision_repeat,
        seed=seed,
    )


def load_model(agent: str, model_path: str, device: str) -> Optional[PPO]:
    if agent != "ppo":
        return None

    if not model_path.strip():
        raise ValueError("PPO evaluation requires --model-path pointing to a saved Stable-Baselines3 model.")

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


def evaluate_agent(
    agent: str,
    map_ids: Sequence[str],
    curriculum: str,
    episodes: int,
    decision_repeat: int,
    max_decision_steps: int,
    seed: int,
    model_path: str,
    device: str,
    deterministic: bool,
) -> Dict[str, Any]:
    env = create_env(map_ids, curriculum, decision_repeat, max_decision_steps, seed)
    model = load_model(agent, model_path, device)
    per_map_episodes: DefaultDict[str, list[Dict[str, Any]]] = defaultdict(list)
    all_episodes: list[Dict[str, Any]] = []

    try:
        for episode_index in range(episodes):
            observation, reset_info = env.reset(seed=seed + episode_index)
            episode_map_id = str(reset_info["map_id"])
            total_reward = 0.0

            while True:
                action = select_action(agent, observation, env, model, deterministic)
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

    return {
        "agent": agent,
        "model_path": model_path or None,
        "curriculum": curriculum,
        "map_ids": list(map_ids),
        "summary": summarize_episode_results(all_episodes),
        "per_map": per_map,
        "episodes": all_episodes,
    }


def print_report(report: Dict[str, Any]) -> None:
    summary = report["summary"]
    print(
        "[eval:%s] completion_rate=%.3f death_rate=%.3f avg_kills=%.2f avg_reward=%.2f avg_raw_score=%.2f avg_decision_steps=%.2f avg_sim_steps=%.2f"
        % (
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
            "[eval:%s:%s] completion_rate=%.3f death_rate=%.3f avg_reward=%.2f avg_raw_score=%.2f"
            % (
                report["agent"],
                map_id,
                map_summary["completion_rate"],
                map_summary["death_rate"],
                map_summary["average_reward"],
                map_summary["average_raw_score"],
            )
        )


def save_report(results: Dict[str, Any], agents: Sequence[str]) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    trainer_root = Path(__file__).resolve().parent
    reports_dir = trainer_root / "eval_reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    output_path = reports_dir / f"stoneage_eval_{'-'.join(agents)}_{timestamp}.json"
    output_path.write_text(f"{json.dumps(results, indent=2)}\n", encoding="utf-8")
    return output_path


def main() -> None:
    args = parse_args()
    map_ids = resolve_map_ids(args)
    agents = resolve_agents(args.agents)

    results = {
        "generated_at": datetime.now().isoformat(),
        "map_ids": map_ids,
        "curriculum": args.curriculum,
        "episodes_per_agent": args.episodes,
        "results": {},
    }

    for agent in agents:
        report = evaluate_agent(
            agent=agent,
            map_ids=map_ids,
            curriculum=args.curriculum,
            episodes=args.episodes,
            decision_repeat=args.decision_repeat,
            max_decision_steps=args.max_decision_steps,
            seed=args.seed,
            model_path=args.model_path,
            device=args.device,
            deterministic=args.deterministic,
        )
        results["results"][agent] = report
        print_report(report)

    output_path = save_report(results, agents)
    print(f"[eval] saved report to {output_path}")


if __name__ == "__main__":
    main()
