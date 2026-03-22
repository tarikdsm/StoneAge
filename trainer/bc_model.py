from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Sequence

import numpy as np
import torch
from torch import nn


class BehaviorCloningNetwork(nn.Module):
    def __init__(self, input_dim: int, hidden_dims: Sequence[int] = (256, 128), output_dim: int = 10) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        previous_dim = input_dim
        for hidden_dim in hidden_dims:
            layers.append(nn.Linear(previous_dim, hidden_dim))
            layers.append(nn.ReLU())
            previous_dim = hidden_dim
        layers.append(nn.Linear(previous_dim, output_dim))
        self.network = nn.Sequential(*layers)

    def forward(self, observations: torch.Tensor) -> torch.Tensor:
        return self.network(observations)


class BehaviorCloningPolicy:
    def __init__(self, payload: Dict[str, Any], device: str = "cpu") -> None:
        self.device = torch.device(device)
        self.input_dim = int(payload["input_dim"])
        self.hidden_dims = tuple(int(value) for value in payload["hidden_dims"])
        self.output_dim = int(payload.get("output_dim", 10))
        self.model = BehaviorCloningNetwork(
            input_dim=self.input_dim,
            hidden_dims=self.hidden_dims,
            output_dim=self.output_dim,
        ).to(self.device)
        self.model.load_state_dict(payload["state_dict"])
        self.model.eval()

    def predict(self, observation: np.ndarray) -> int:
        probabilities = self.predict_probabilities(observation)
        return int(np.argmax(probabilities))

    def predict_probabilities(self, observation: np.ndarray) -> np.ndarray:
        with torch.no_grad():
            tensor = torch.as_tensor(observation, dtype=torch.float32, device=self.device).unsqueeze(0)
            logits = self.model(tensor)
            probabilities = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()
            return probabilities.astype(np.float32, copy=False)

    @classmethod
    def load(cls, path: str | Path, device: str = "cpu") -> "BehaviorCloningPolicy":
        payload = load_behavior_cloning_payload(path, map_location=device)
        return cls(payload, device=device)

    def linear_layers(self) -> list[nn.Linear]:
        return [module for module in self.model.network if isinstance(module, nn.Linear)]


def load_behavior_cloning_payload(path: str | Path, map_location: str | torch.device = "cpu") -> Dict[str, Any]:
    return torch.load(Path(path), map_location=map_location)


def save_behavior_cloning_model(
    path: str | Path,
    model: BehaviorCloningNetwork,
    *,
    input_dim: int,
    hidden_dims: Sequence[int],
    output_dim: int = 10,
    metadata: Dict[str, Any] | None = None,
) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "input_dim": int(input_dim),
            "hidden_dims": [int(value) for value in hidden_dims],
            "output_dim": int(output_dim),
            "state_dict": model.state_dict(),
            "metadata": metadata or {},
        },
        output_path,
    )
    return output_path
