#!/usr/bin/env python3
"""Validate locally retained official GWOSC GW150914 strain products."""

from __future__ import annotations

import gzip
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OBSERVATIONS = ROOT / "data" / "observations"
METADATA = OBSERVATIONS / "gwosc_GW150914_metadata.json"
EXPECTED_SAMPLES = 32 * 4096


def count_numeric_samples(path: Path) -> int:
    count = 0
    with gzip.open(path, "rt", encoding="ascii") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                value = float(stripped.split()[-1])
                if not math.isfinite(value):
                    raise ValueError(f"Non-finite strain in {path.name}")
                count += 1
    return count


def main() -> None:
    metadata = json.loads(METADATA.read_text(encoding="utf-8"))
    if metadata["sampleRateHz"] != 4096 or metadata["durationSeconds"] != 32:
        raise ValueError("GWOSC sample-grid provenance is inconsistent")
    report = []
    for detector in ("H1", "L1"):
        product = metadata["products"][detector]
        path = OBSERVATIONS / product["file"]
        if count_numeric_samples(path) != EXPECTED_SAMPLES:
            raise ValueError(f"{detector} does not contain a complete 32-second strain segment")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != product["sha256"]:
            raise ValueError(f"{detector} SHA-256 differs from acquired metadata")
        report.append(f"{detector}={EXPECTED_SAMPLES} samples")
    print("Validated local GWOSC products: " + "; ".join(report))


if __name__ == "__main__":
    main()
