from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.monitor import Monitor

from eval_utils import (
    build_eval_reports_dir,
    compare_eval_summaries,
    evaluate_agent,
    print_report,
    resolve_map_ids,
    save_training_curve,
    write_csv,
    write_json,
)
from stoneage_env import StoneAgeEnv


TRAINING_PRESETS: Dict[str, Dict[str, int]] = {
    "debug": {"timesteps": 12000, "eval_freq": 4000, "eval_episodes": 8},
    "50k": {"timesteps": 50_000, "eval_freq": 5_000, "eval_episodes": 12},
    "100k": {"timesteps": 100_000, "eval_freq": 10_000, "eval_episodes": 16},
    "300k": {"timesteps": 300_000, "eval_freq": 25_000, "eval_episodes": 20},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train PPO against the StoneAge TypeScript simulator.")
    parser.add_argument("--map-id", default="map01", help="Default training map. For this phase, keep map01.")
    parser.add_argument("--map-ids", default="", help="Optional comma-separated map list. Leave empty to train only on map01.")
    parser.add_argument("--curriculum", choices=("single", "rotation"), default="single")
    parser.add_argument("--preset", choices=tuple(TRAINING_PRESETS.keys()), default="50k")
    parser.add_argument("--timesteps", type=int, default=0, help="Optional override for preset timesteps.")
    parser.add_argument("--eval-freq", type=int, default=0, help="Optional override for evaluation frequency.")
    parser.add_argument("--eval-episodes", type=int, default=0, help="Optional override for evaluation episodes.")
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--decision-repeat", type=int, default=4)
    parser.add_argument("--max-decision-steps", type=int, default=600)
    parser.add_argument("--smoke-steps", type=int, default=8)
    parser.add_argument("--model-name", default="")
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--n-steps", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--gamma", type=float, default=0.99)
    parser.add_argument("--gae-lambda", type=float, default=0.95)
    parser.add_argument("--clip-range", type=float, default=0.2)
    parser.add_argument("--ent-coef", type=float, default=0.01)
    parser.add_argument("--skip-random-baseline", action=argparse.BooleanOptionalAction, default=False)
    return parser.parse_args()


def resolve_training_counts(args: argparse.Namespace) -> tuple[int, int, int]:
    preset = TRAINING_PRESETS[args.preset]
    timesteps = args.timesteps if args.timesteps > 0 else preset["timesteps"]
    eval_freq = args.eval_freq if args.eval_freq > 0 else preset["eval_freq"]
    eval_episodes = args.eval_episodes if args.eval_episodes > 0 else preset["eval_episodes"]
    return timesteps, eval_freq, eval_episodes


def build_model_name(map_ids: Sequence[str], curriculum: str, explicit_name: str, preset: str) -> str:
    if explicit_name.strip():
        return explicit_name.strip()

    joined_maps = "_".join(map_ids)
    return f"ppo_stoneage_{curriculum}_{joined_maps}_{preset}"


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
                "[smoke] map=%s step=%s action=%s reward=%.2f terminated=%s truncated=%s kills=%s raw_score=%s visits=%s"
                % (
                    map_id,
                    step_index,
                    action,
                    reward,
                    terminated,
                    truncated,
                    info["kills"],
                    info["raw_score"],
                    info["state_visit_count"],
                )
            )
            if terminated or truncated:
                break


def model_output_path(base_dir: Path, base_name: str) -> Path:
    return base_dir / base_name


class PeriodicEvaluationCallback(BaseCallback):
    def __init__(
        self,
        *,
        run_name: str,
        models_dir: Path,
        reports_dir: Path,
        map_ids: Sequence[str],
        curriculum: str,
        decision_repeat: int,
        max_decision_steps: int,
        eval_freq: int,
        eval_episodes: int,
        seed: int,
        device: str,
    ) -> None:
        super().__init__(verbose=0)
        self.run_name = run_name
        self.models_dir = models_dir
        self.reports_dir = reports_dir
        self.map_ids = list(map_ids)
        self.curriculum = curriculum
        self.decision_repeat = decision_repeat
        self.max_decision_steps = max_decision_steps
        self.eval_freq = eval_freq
        self.eval_episodes = eval_episodes
        self.seed = seed
        self.device = device
        self.records: list[Dict[str, Any]] = []
        self.best_summary: Optional[Dict[str, Any]] = None
        self.best_checkpoint_path: Optional[str] = None
        self.best_report: Optional[Dict[str, Any]] = None
        self.metrics_json_path = reports_dir / f"{run_name}_metrics.json"
        self.metrics_csv_path = reports_dir / f"{run_name}_metrics.csv"
        self.plot_path = reports_dir / f"{run_name}_curve.png"
        self.best_model_base = model_output_path(models_dir, f"{run_name}_best")

    def _on_training_start(self) -> None:
        self._evaluate_and_record(0)

    def _on_step(self) -> bool:
        if self.eval_freq > 0 and self.num_timesteps > 0 and self.num_timesteps % self.eval_freq == 0:
            self._evaluate_and_record(self.num_timesteps)
        return True

    def _on_training_end(self) -> None:
        if not self.records or self.records[-1]["timesteps"] != self.num_timesteps:
            self._evaluate_and_record(self.num_timesteps)

    def _evaluate_and_record(self, timesteps: int) -> None:
        checkpoint_base = model_output_path(self.models_dir, f"{self.run_name}_step{timesteps:07d}")
        self.model.save(str(checkpoint_base))
        checkpoint_path = f"{checkpoint_base}.zip"

        report = evaluate_agent(
            agent="ppo",
            map_ids=self.map_ids,
            curriculum=self.curriculum,
            episodes=self.eval_episodes,
            decision_repeat=self.decision_repeat,
            max_decision_steps=self.max_decision_steps,
            seed=self.seed + timesteps,
            device=self.device,
            model=self.model,
        )
        summary = report["summary"]

        is_best = self.best_summary is None or compare_eval_summaries(summary, self.best_summary) > 0
        if is_best:
            self.best_summary = dict(summary)
            self.best_checkpoint_path = checkpoint_path
            self.best_report = report
            self.model.save(str(self.best_model_base))

        record = {
            "timesteps": timesteps,
            "completion_rate": float(summary["completion_rate"]),
            "death_rate": float(summary["death_rate"]),
            "average_kills": float(summary["average_kills"]),
            "average_reward": float(summary["average_reward"]),
            "average_raw_score": float(summary["average_raw_score"]),
            "average_decision_steps": float(summary["average_decision_steps"]),
            "average_sim_steps": float(summary["average_sim_steps"]),
            "checkpoint_path": checkpoint_path,
            "is_best": is_best,
        }
        self.records.append(record)
        self._persist_reports()
        print(
            "[train-eval] step=%s completion_rate=%.3f death_rate=%.3f avg_reward=%.2f avg_kills=%.2f%s"
            % (
                timesteps,
                summary["completion_rate"],
                summary["death_rate"],
                summary["average_reward"],
                summary["average_kills"],
                " [best]" if is_best else "",
            )
        )

    def _persist_reports(self) -> None:
        write_json(
            self.metrics_json_path,
            {
                "run_name": self.run_name,
                "map_ids": self.map_ids,
                "curriculum": self.curriculum,
                "eval_episodes": self.eval_episodes,
                "records": self.records,
                "best_checkpoint_path": self.best_checkpoint_path,
                "best_summary": self.best_summary,
            },
        )
        write_csv(
            self.metrics_csv_path,
            fieldnames=[
                "timesteps",
                "completion_rate",
                "death_rate",
                "average_kills",
                "average_reward",
                "average_raw_score",
                "average_decision_steps",
                "average_sim_steps",
                "checkpoint_path",
                "is_best",
            ],
            rows=self.records,
        )
        save_training_curve(self.records, self.plot_path)


def main() -> None:
    args = parse_args()
    map_ids = resolve_map_ids(args.map_id, args.map_ids, args.curriculum)
    timesteps, eval_freq, eval_episodes = resolve_training_counts(args)

    trainer_root = Path(__file__).resolve().parent
    models_dir = trainer_root / "models"
    logs_dir = trainer_root / "logs" / "ppo_stoneage"
    reports_dir = build_eval_reports_dir()
    models_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    env = StoneAgeEnv(
        map_id=map_ids[0],
        map_ids=map_ids,
        curriculum_mode=args.curriculum,
        max_decision_steps=args.max_decision_steps,
        decision_repeat=args.decision_repeat,
        seed=args.seed,
    )

    try:
        print(
            "[train] maps=%s curriculum=%s preset=%s timesteps=%s eval_freq=%s eval_episodes=%s"
            % (",".join(map_ids), args.curriculum, args.preset, timesteps, eval_freq, eval_episodes)
        )
        run_smoke_test(env, args.smoke_steps, map_ids)

        if not args.skip_random_baseline:
            random_report = evaluate_agent(
                agent="random",
                map_ids=map_ids,
                curriculum=args.curriculum,
                episodes=eval_episodes,
                decision_repeat=args.decision_repeat,
                max_decision_steps=args.max_decision_steps,
                seed=args.seed,
            )
            print_report(random_report, prefix="baseline")
        else:
            random_report = None

        monitored_env = Monitor(env)
        model = PPO(
            policy="MlpPolicy",
            env=monitored_env,
            learning_rate=args.learning_rate,
            n_steps=args.n_steps,
            batch_size=args.batch_size,
            gamma=args.gamma,
            gae_lambda=args.gae_lambda,
            clip_range=args.clip_range,
            ent_coef=args.ent_coef,
            verbose=1,
            tensorboard_log=str(logs_dir),
            seed=args.seed,
            device=args.device,
        )

        run_name = build_model_name(map_ids, args.curriculum, args.model_name, args.preset)
        checkpoint_callback = CheckpointCallback(
            save_freq=max(1, eval_freq),
            save_path=str(models_dir),
            name_prefix=f"{run_name}_raw",
        )
        eval_callback = PeriodicEvaluationCallback(
            run_name=run_name,
            models_dir=models_dir,
            reports_dir=reports_dir,
            map_ids=map_ids,
            curriculum=args.curriculum,
            decision_repeat=args.decision_repeat,
            max_decision_steps=args.max_decision_steps,
            eval_freq=eval_freq,
            eval_episodes=eval_episodes,
            seed=args.seed,
            device=args.device,
        )

        model.learn(total_timesteps=timesteps, callback=[checkpoint_callback, eval_callback], progress_bar=False)

        final_model_path = model_output_path(models_dir, run_name)
        model.save(str(final_model_path))
        print(f"[train] saved final model to {final_model_path}")

        final_report = evaluate_agent(
            agent="ppo",
            map_ids=map_ids,
            curriculum=args.curriculum,
            episodes=eval_episodes,
            decision_repeat=args.decision_repeat,
            max_decision_steps=args.max_decision_steps,
            seed=args.seed + timesteps + 7,
            device=args.device,
            model=model,
        )
        print_report(final_report, prefix="final")

        summary_path = reports_dir / f"{run_name}_summary.json"
        write_json(
            summary_path,
            {
                "run_name": run_name,
                "preset": args.preset,
                "map_ids": map_ids,
                "curriculum": args.curriculum,
                "timesteps": timesteps,
                "eval_freq": eval_freq,
                "eval_episodes": eval_episodes,
                "hyperparameters": {
                    "learning_rate": args.learning_rate,
                    "n_steps": args.n_steps,
                    "batch_size": args.batch_size,
                    "gamma": args.gamma,
                    "gae_lambda": args.gae_lambda,
                    "clip_range": args.clip_range,
                    "ent_coef": args.ent_coef,
                    "device": args.device,
                },
                "random_baseline": random_report,
                "best_checkpoint_path": eval_callback.best_checkpoint_path,
                "best_checkpoint_report": eval_callback.best_report,
                "metrics_json_path": str(eval_callback.metrics_json_path),
                "metrics_csv_path": str(eval_callback.metrics_csv_path),
                "plot_path": str(eval_callback.plot_path),
                "final_report": final_report,
            },
        )
        print(f"[train] saved training summary to {summary_path}")
        if eval_callback.best_checkpoint_path:
            print(f"[train] best checkpoint: {eval_callback.best_checkpoint_path}")
    finally:
        env.close()


if __name__ == "__main__":
    main()
