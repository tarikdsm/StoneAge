from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict

import numpy as np

from eval_utils import build_eval_reports_dir, write_json
from stoneage_env import StoneAgeEnv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect map01 behavior-cloning data from the heuristic StoneAge bot.")
    parser.add_argument("--map-id", default="map01")
    parser.add_argument("--episodes", type=int, default=400)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--decision-repeat", type=int, default=4)
    parser.add_argument("--max-decision-steps", type=int, default=600)
    parser.add_argument("--deterministic-teacher", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--output-name", default="heuristic_map01")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    trainer_root = Path(__file__).resolve().parent
    datasets_dir = trainer_root / "datasets"
    datasets_dir.mkdir(parents=True, exist_ok=True)

    env = StoneAgeEnv(
        map_id=args.map_id,
        curriculum_mode="single",
        max_decision_steps=args.max_decision_steps,
        decision_repeat=args.decision_repeat,
        seed=args.seed,
    )

    observations: list[np.ndarray] = []
    actions: list[int] = []
    action_counts = np.zeros(10, dtype=np.int64)
    cleared = 0
    dead = 0
    total_steps = 0

    try:
        for episode_index in range(args.episodes):
            observation, _ = env.reset(seed=args.seed + episode_index)
            while True:
                action = env.get_heuristic_action(deterministic=args.deterministic_teacher)
                observations.append(observation.copy())
                actions.append(action)
                action_counts[action] += 1
                total_steps += 1

                observation, _, terminated, truncated, info = env.step(action)
                if terminated or truncated:
                    cleared += int(info["cleared"])
                    dead += int(info["dead"])
                    break
    finally:
        env.close()

    observations_array = np.asarray(observations, dtype=np.float32)
    actions_array = np.asarray(actions, dtype=np.int64)

    output_base = datasets_dir / args.output_name
    np.savez_compressed(
        f"{output_base}.npz",
        observations=observations_array,
        actions=actions_array,
        action_counts=action_counts,
    )

    report: Dict[str, Any] = {
        "map_id": args.map_id,
        "episodes": args.episodes,
        "samples": int(actions_array.shape[0]),
        "observation_shape": list(observations_array.shape),
        "deterministic_teacher": bool(args.deterministic_teacher),
        "decision_repeat": args.decision_repeat,
        "max_decision_steps": args.max_decision_steps,
        "clear_rate": float(cleared / args.episodes),
        "death_rate": float(dead / args.episodes),
        "action_counts": action_counts.tolist(),
        "dataset_path": f"{output_base}.npz",
    }

    report_path = build_eval_reports_dir() / f"{args.output_name}_dataset.json"
    write_json(report_path, report)
    print(
        "[dataset] samples=%s clear_rate=%.3f death_rate=%.3f saved=%s"
        % (report["samples"], report["clear_rate"], report["death_rate"], output_base.with_suffix(".npz"))
    )
    print(f"[dataset] report={report_path}")


if __name__ == "__main__":
    main()
