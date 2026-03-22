from __future__ import annotations

from typing import Any, Dict, Optional, Sequence, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from ts_bridge import StoneAgeBridgeError, StoneAgeTSBridge


GRID_WIDTH = 10
GRID_HEIGHT = 10
GRID_VECTOR_SIZE = GRID_WIDTH * GRID_HEIGHT
GRID_CELL_CODE_COUNT = 9
GRID_CHANNEL_VECTOR_SIZE = GRID_VECTOR_SIZE * GRID_CELL_CODE_COUNT
AUXILIARY_FEATURE_COUNT = 15
OBSERVATION_SIZE = GRID_CHANNEL_VECTOR_SIZE + AUXILIARY_FEATURE_COUNT
NOVELTY_BONUS = 0.05
MAX_REPEAT_STATE_PENALTY = 1.0

# Mirrors the authoritative headless grid encoding returned by
# `StoneAgeHeadlessSimulator.buildObservation`.
GRID_CODE_EMPTY = 0
GRID_CODE_PLAYER = 1
GRID_CODE_BLOCK_ORIGINAL = 2
GRID_CODE_BLOCK_RESPAWNED = 3
GRID_CODE_ENEMY_ACTIVE = 4
GRID_CODE_ENEMY_SPAWNING = 5
GRID_CODE_ENEMY_DIGGING = 6
GRID_CODE_COLUMN = 7
GRID_CODE_PLAYER_CAUGHT = 8


class StoneAgeEnv(gym.Env[np.ndarray, int]):
    metadata = {"render_modes": []}

    def __init__(
        self,
        map_id: str = "map01",
        map_ids: Optional[Sequence[str]] = None,
        curriculum_mode: str = "single",
        max_decision_steps: int = 600,
        decision_repeat: int = 4,
        seed: Optional[int] = None,
    ) -> None:
        super().__init__()
        self.map_ids = self._resolve_map_ids(map_id, map_ids)
        self.curriculum_mode = self._normalize_curriculum_mode(curriculum_mode)
        self.map_id = self.map_ids[0]
        self.current_map_id = self.map_id
        self.max_decision_steps = max_decision_steps
        self.decision_repeat = decision_repeat
        self._rotation_index = 0
        self.bridge = StoneAgeTSBridge(
            map_id=self.current_map_id,
            max_decision_steps=max_decision_steps,
            seed=seed,
        )
        self.action_space = spaces.Discrete(10)
        self.observation_space = spaces.Box(
            low=0.0,
            high=1.0,
            shape=(OBSERVATION_SIZE,),
            dtype=np.float32,
        )
        self._last_kills = 0
        self._last_sim_steps = 0
        self._last_action: Optional[int] = None
        self._last_state_signature = ""
        self._state_visit_counts: Dict[str, int] = {}

    def reset(
        self,
        *,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)
        map_id = self._resolve_reset_map_id(options)
        self.current_map_id = map_id
        response = self.bridge.request(
            {
                "type": "reset",
                "mapId": map_id,
                "seed": seed,
                "maxDecisionSteps": self.max_decision_steps,
            }
        )
        info = self._extract_info(response["info"])
        self._last_kills = info["kills"]
        self._last_sim_steps = info["sim_steps"]
        self._last_action = None
        self._last_state_signature = info["state_signature"]
        self._state_visit_counts = {self._last_state_signature: 1}
        return self._vectorize_observation(response["observation"]), info

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        if not self.action_space.contains(action):
            raise StoneAgeBridgeError(f"Action {action} is outside Discrete(10).")

        response = self.bridge.request(
            {
                "type": "step",
                "action": int(action),
                "decisionRepeat": self.decision_repeat,
            }
        )
        info = self._extract_info(response["info"])
        observation = self._vectorize_observation(response["observation"])
        reward, reward_details = self._compute_reward(action, info)
        info.update(reward_details)

        self._last_kills = info["kills"]
        self._last_sim_steps = info["sim_steps"]
        self._last_action = int(action)
        self._last_state_signature = info["state_signature"]

        return (
            observation,
            float(reward),
            bool(response["terminated"]),
            bool(response["truncated"]),
            info,
        )

    def close(self) -> None:
        self.bridge.close()

    def _vectorize_observation(self, observation: Dict[str, Any]) -> np.ndarray:
        grid_codes = np.asarray(observation["grid"], dtype=np.int32)
        grid_channels = np.zeros((GRID_CELL_CODE_COUNT, GRID_VECTOR_SIZE), dtype=np.float32)
        for code in range(GRID_CELL_CODE_COUNT):
            grid_channels[code] = (grid_codes == code).astype(np.float32)

        player_position = np.asarray(observation["player_position"], dtype=np.float32) / 9.0
        facing_one_hot = np.zeros(4, dtype=np.float32)
        facing_one_hot[int(observation["player_facing"])] = 1.0

        extras = np.asarray(
            [
                float(observation["player_motion_active"]),
                min(float(observation["push_cooldown_ms"]) / 1000.0, 1.0),
                min(float(observation["enemies_alive"]) / 12.0, 1.0),
                min(float(observation["blocks_active"]) / 20.0, 1.0),
                min(float(observation["original_blocks_active"]) / 20.0, 1.0),
                min(float(observation["respawned_blocks_active"]) / 20.0, 1.0),
                min(float(observation["block_respawn_timer_ms"]) / 10000.0, 1.0),
                min(float(observation["elapsed_ms"]) / 30000.0, 1.0),
                np.tanh(float(observation["raw_score"]) / 2000.0),
            ],
            dtype=np.float32,
        )

        vector = np.concatenate([grid_channels.reshape(-1), player_position, facing_one_hot, extras], dtype=np.float32)
        if vector.shape != self.observation_space.shape:
            raise StoneAgeBridgeError(
                f"Observation vector shape mismatch. Expected {self.observation_space.shape}, got {vector.shape}."
            )
        return vector

    def _extract_info(self, raw_info: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "cleared": bool(raw_info["cleared"]),
            "dead": bool(raw_info["dead"]),
            "kills": int(raw_info["kills"]),
            "enemies_alive": int(raw_info["enemies_alive"]),
            "blocks_active": int(raw_info["blocks_active"]),
            "raw_score": int(raw_info["raw_score"]),
            "decision_steps": int(raw_info["decision_steps"]),
            "sim_steps": int(raw_info["sim_steps"]),
            "map_id": str(raw_info["map_id"]),
            "action_effective": bool(raw_info["action_effective"]),
            "state_signature": str(raw_info["state_signature"]),
            "stage_status": str(raw_info["stage_status"]),
            "stage_elapsed_ms": int(raw_info["stage_elapsed_ms"]),
        }

    def _compute_reward(self, action: int, info: Dict[str, Any]) -> Tuple[float, Dict[str, float | int]]:
        reward = 0.0
        reward -= 1.0

        delta_kills = info["kills"] - self._last_kills
        delta_sim_steps = info["sim_steps"] - self._last_sim_steps

        reward += 120.0 * float(delta_kills)
        reward -= 0.05 * float(delta_sim_steps)

        if info["cleared"]:
            reward += 1000.0
        if info["dead"]:
            reward -= 1000.0

        state_visit_count = self._state_visit_counts.get(info["state_signature"], 0)
        novelty_bonus = NOVELTY_BONUS if state_visit_count == 0 else 0.0
        repeat_state_penalty = 0.0
        if state_visit_count >= 2:
            repeat_state_penalty = min(MAX_REPEAT_STATE_PENALTY, 0.25 * float(state_visit_count - 1))

        reward += novelty_bonus
        reward -= repeat_state_penalty

        repeated_useless_action = (
            self._last_action is not None
            and action == self._last_action
            and not info["action_effective"]
            and info["state_signature"] == self._last_state_signature
        )
        self._state_visit_counts[info["state_signature"]] = state_visit_count + 1

        return reward, {
            "state_visit_count": state_visit_count + 1,
            "reward_novelty_bonus": novelty_bonus,
            "reward_repeat_state_penalty": repeat_state_penalty,
            "reward_repeated_useless_action_penalty": 0.0,
            "repeated_useless_action": 1 if repeated_useless_action else 0,
        }

    def _resolve_map_ids(self, map_id: str, map_ids: Optional[Sequence[str]]) -> list[str]:
        candidates = [str(candidate).strip() for candidate in (map_ids or [map_id]) if str(candidate).strip()]
        if not candidates:
            raise StoneAgeBridgeError("StoneAgeEnv requires at least one map id.")
        return candidates

    def _normalize_curriculum_mode(self, curriculum_mode: str) -> str:
        normalized = curriculum_mode.strip().lower()
        if normalized not in {"single", "rotation"}:
            raise StoneAgeBridgeError(
                f"Unsupported curriculum mode '{curriculum_mode}'. Expected 'single' or 'rotation'."
            )
        return normalized

    def _resolve_reset_map_id(self, options: Optional[Dict[str, Any]]) -> str:
        if options is not None and options.get("map_id") is not None:
            return str(options["map_id"])

        if self.curriculum_mode == "rotation" and len(self.map_ids) > 1:
            map_id = self.map_ids[self._rotation_index % len(self.map_ids)]
            self._rotation_index += 1
            return map_id

        return self.map_ids[0]
