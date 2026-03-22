from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset, random_split

from bc_model import BehaviorCloningNetwork, save_behavior_cloning_model
from eval_utils import build_eval_reports_dir, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a behavior-cloning baseline on StoneAge heuristic data.")
    parser.add_argument("--dataset-path", required=True)
    parser.add_argument("--output-name", default="bc_map01_heuristic")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--hidden-dims", default="256,128")
    parser.add_argument("--val-split", type=float, default=0.1)
    return parser.parse_args()


def parse_hidden_dims(raw_hidden_dims: str) -> tuple[int, ...]:
    values = tuple(int(value.strip()) for value in raw_hidden_dims.split(",") if value.strip())
    if not values:
        raise ValueError("At least one hidden dimension is required.")
    return values


def evaluate_accuracy(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[float, float]:
    model.eval()
    total_loss = 0.0
    total_correct = 0
    total_examples = 0
    criterion = nn.CrossEntropyLoss()
    with torch.no_grad():
        for observations, actions in loader:
            observations = observations.to(device)
            actions = actions.to(device)
            logits = model(observations)
            loss = criterion(logits, actions)
            total_loss += float(loss.item()) * observations.shape[0]
            total_correct += int((torch.argmax(logits, dim=1) == actions).sum().item())
            total_examples += int(observations.shape[0])

    if total_examples == 0:
        return 0.0, 0.0

    return total_loss / total_examples, total_correct / total_examples


def main() -> None:
    args = parse_args()
    hidden_dims = parse_hidden_dims(args.hidden_dims)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    dataset_payload = np.load(args.dataset_path)
    observations = torch.as_tensor(dataset_payload["observations"], dtype=torch.float32)
    actions = torch.as_tensor(dataset_payload["actions"], dtype=torch.long)

    dataset = TensorDataset(observations, actions)
    val_size = max(1, int(len(dataset) * args.val_split))
    train_size = len(dataset) - val_size
    train_dataset, val_dataset = random_split(
        dataset,
        [train_size, val_size],
        generator=torch.Generator().manual_seed(args.seed),
    )

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False)

    device = torch.device(args.device)
    model = BehaviorCloningNetwork(input_dim=observations.shape[1], hidden_dims=hidden_dims).to(device)

    class_counts = torch.bincount(actions, minlength=10).float()
    class_weights = class_counts.sum() / torch.clamp(class_counts, min=1.0)
    class_weights = class_weights / class_weights.mean()

    criterion = nn.CrossEntropyLoss(weight=class_weights.to(device))
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)

    history: list[Dict[str, Any]] = []
    best_val_accuracy = -1.0
    best_state_dict = None

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        total_correct = 0
        total_examples = 0

        for batch_observations, batch_actions in train_loader:
            batch_observations = batch_observations.to(device)
            batch_actions = batch_actions.to(device)

            optimizer.zero_grad(set_to_none=True)
            logits = model(batch_observations)
            loss = criterion(logits, batch_actions)
            loss.backward()
            optimizer.step()

            total_loss += float(loss.item()) * batch_observations.shape[0]
            total_correct += int((torch.argmax(logits, dim=1) == batch_actions).sum().item())
            total_examples += int(batch_observations.shape[0])

        train_loss = total_loss / max(total_examples, 1)
        train_accuracy = total_correct / max(total_examples, 1)
        val_loss, val_accuracy = evaluate_accuracy(model, val_loader, device)

        history.append(
            {
                "epoch": epoch,
                "train_loss": train_loss,
                "train_accuracy": train_accuracy,
                "val_loss": val_loss,
                "val_accuracy": val_accuracy,
            }
        )

        if val_accuracy > best_val_accuracy:
            best_val_accuracy = val_accuracy
            best_state_dict = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}

        print(
            "[bc] epoch=%s train_loss=%.4f train_acc=%.4f val_loss=%.4f val_acc=%.4f"
            % (epoch, train_loss, train_accuracy, val_loss, val_accuracy)
        )

    if best_state_dict is not None:
        model.load_state_dict(best_state_dict)

    trainer_root = Path(__file__).resolve().parent
    models_dir = trainer_root / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    output_path = models_dir / f"{args.output_name}.pt"
    save_behavior_cloning_model(
        output_path,
        model,
        input_dim=observations.shape[1],
        hidden_dims=hidden_dims,
        metadata={
            "dataset_path": args.dataset_path,
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.learning_rate,
            "val_split": args.val_split,
        },
    )

    report = {
        "dataset_path": args.dataset_path,
        "model_path": str(output_path),
        "input_dim": int(observations.shape[1]),
        "hidden_dims": list(hidden_dims),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "best_val_accuracy": best_val_accuracy,
        "class_counts": class_counts.tolist(),
        "history": history,
    }
    report_path = build_eval_reports_dir() / f"{args.output_name}_training.json"
    write_json(report_path, report)
    print(f"[bc] saved model to {output_path}")
    print(f"[bc] saved report to {report_path}")


if __name__ == "__main__":
    main()
