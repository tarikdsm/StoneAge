from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional


class StoneAgeBridgeError(RuntimeError):
    """Raised when the TypeScript simulator bridge fails."""


class StoneAgeTSBridge:
    def __init__(
        self,
        map_id: str = "map01",
        max_decision_steps: int = 600,
        seed: Optional[int] = None,
    ) -> None:
        self.repo_root = Path(__file__).resolve().parents[1]
        self.server_script = self.repo_root / "trainer_bridge" / "stoneage_sim_server.ts"
        self.process = self._spawn_process()
        self.request(
            {
                "type": "init",
                "mapId": map_id,
                "seed": seed,
                "maxDecisionSteps": max_decision_steps,
            }
        )

    def request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if self.process.poll() is not None:
            raise StoneAgeBridgeError(self._build_process_exit_message())

        assert self.process.stdin is not None
        assert self.process.stdout is not None

        try:
            self.process.stdin.write(json.dumps(payload) + "\n")
            self.process.stdin.flush()
        except OSError as error:
            raise StoneAgeBridgeError(f"Failed to write to the StoneAge simulator bridge: {error}") from error

        response_line = self.process.stdout.readline()
        if not response_line:
            raise StoneAgeBridgeError(self._build_process_exit_message())

        try:
            response = json.loads(response_line)
        except json.JSONDecodeError as error:
            raise StoneAgeBridgeError(f"Bridge returned invalid JSON: {response_line!r}") from error

        if not response.get("ok", False):
            raise StoneAgeBridgeError(str(response.get("error", "Unknown simulator bridge error.")))

        return response

    def close(self) -> None:
        if self.process.poll() is not None:
            return

        try:
            self.request({"type": "close"})
        except StoneAgeBridgeError:
            pass
        finally:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)

    def _spawn_process(self) -> subprocess.Popen[str]:
        tsx_path = self._resolve_tsx_path()
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

        return subprocess.Popen(
            [str(tsx_path), str(self.server_script)],
            cwd=self.repo_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
            creationflags=creationflags,
        )

    def _resolve_tsx_path(self) -> Path:
        if os.name == "nt":
            candidate = self.repo_root / "node_modules" / ".bin" / "tsx.cmd"
        else:
            candidate = self.repo_root / "node_modules" / ".bin" / "tsx"

        if candidate.exists():
            return candidate

        raise StoneAgeBridgeError(
            "tsx was not found under node_modules/.bin. Run `npm install` in the repository before using the RL bridge."
        )

    def _build_process_exit_message(self) -> str:
        stderr_output = ""
        if self.process.stderr is not None:
            try:
                stderr_output = self.process.stderr.read().strip()
            except OSError:
                stderr_output = ""

        if stderr_output:
            return f"StoneAge simulator bridge exited unexpectedly: {stderr_output}"

        return "StoneAge simulator bridge exited unexpectedly without stderr output."
