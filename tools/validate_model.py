"""Validate leading-order chirp relationships used by the browser lab."""

from __future__ import annotations

import csv
import math
from pathlib import Path

from generate_chirp import chirp_mass, generate


def main() -> None:
    mc = chirp_mass(36.0, 29.0)
    mc_swapped = chirp_mass(29.0, 36.0)
    track = generate()
    frequencies = [row["frequency_hz"] for row in track]
    strain_near = max(abs(row["relative_strain"]) for row in generate(distance=410.0))
    strain_far = max(abs(row["relative_strain"]) for row in generate(distance=820.0))

    output = Path(__file__).resolve().parents[1] / "data" / "validation_summary.csv"
    rows = [
        {"check": "chirp_mass_symmetry", "value": abs(mc - mc_swapped), "expected": 0.0, "passed": math.isclose(mc, mc_swapped, rel_tol=1e-12)},
        {"check": "gw150914_like_chirp_mass_msun", "value": mc, "expected": "about 28", "passed": 26.0 < mc < 31.0},
        {"check": "frequency_monotonic", "value": min(b - a for a, b in zip(frequencies, frequencies[1:])), "expected": ">= 0", "passed": all(b >= a for a, b in zip(frequencies, frequencies[1:]))},
        {"check": "distance_halving_ratio", "value": strain_far / strain_near, "expected": 0.5, "passed": math.isclose(strain_far / strain_near, 0.5, rel_tol=1e-3)},
    ]
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["check", "value", "expected", "passed"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
