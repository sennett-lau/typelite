"""Quantize the pinned MLX FP16 conversion locally, without a second download."""

import argparse
import json
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
from mlx.utils import tree_flatten
from mlx_whisper.load_models import load_model


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("destination", type=Path)
args = parser.parse_args()
config = json.loads((args.source / "config.json").read_text())
if "quantization" in config:
    parser.error("source must be the FP16 model, not an already quantized model")
args.destination.mkdir(parents=True, exist_ok=False)
model = load_model(str(args.source), dtype=mx.float16)
# Same group size and bit count as the upstream mlx-examples Whisper converter.
nn.quantize(model, group_size=64, bits=4)
weights = dict(tree_flatten(model.parameters()))
mx.eval(weights)
mx.save_safetensors(str(args.destination / "weights.safetensors"), weights)
config["quantization"] = dict(group_size=64, bits=4)
(args.destination / "config.json").write_text(json.dumps(config, indent=2) + "\n")
