from __future__ import annotations

import argparse
from typing import Any, Dict

from eval_utils import (
    build_eval_reports_dir,
    default_timestamp,
    evaluate_agent,
    print_report,
    resolve_map_ids,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate StoneAge RL policies against the TypeScript simulator.")
    parser.add_argument("--agents", default="random", help="Comma-separated list: random,heuristic,bc,ppo")
    parser.add_argument("--model-path", default="", help="Backward-compatible alias for PPO model path.")
    parser.add_argument("--ppo-model-path", default="")
    parser.add_argument("--bc-model-path", default="")
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


def resolve_agents(raw_agents: str) -> list[str]:
    agents = [candidate.strip().lower() for candidate in raw_agents.split(",") if candidate.strip()]
    if not agents:
        raise ValueError("At least one agent must be specified.")

    supported_agents = {"random", "heuristic", "bc", "ppo"}
    unsupported_agents = [agent for agent in agents if agent not in supported_agents]
    if unsupported_agents:
        raise ValueError(f"Unsupported agents: {', '.join(unsupported_agents)}")

    return agents


def main() -> None:
    args = parse_args()
    map_ids = resolve_map_ids(args.map_id, args.map_ids, args.curriculum)
    agents = resolve_agents(args.agents)

    results: Dict[str, Any] = {
        "generated_at": default_timestamp(),
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
            model_path=args.bc_model_path if agent == "bc" else (args.ppo_model_path or args.model_path),
            device=args.device,
            deterministic=args.deterministic,
        )
        results["results"][agent] = report
        print_report(report)

    output_path = build_eval_reports_dir() / f"stoneage_eval_{'-'.join(agents)}_{default_timestamp()}.json"
    write_json(output_path, results)
    print(f"[eval] saved report to {output_path}")


if __name__ == "__main__":
    main()
