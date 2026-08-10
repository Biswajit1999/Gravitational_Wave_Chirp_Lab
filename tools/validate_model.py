"""Validate leading-order inspiral invariants for Gravitational Wave Chirp Lab."""

from __future__ import annotations

import csv
import math
from dataclasses import replace
from pathlib import Path

from generate_chirp import Source, amplitude_plus, chirp_mass_solar, generate, isco_frequency_hz


def main() -> None:
    source = Source()
    track = generate(source)
    far_source = replace(source, distance_mpc=source.distance_mpc * 2.0)
    mass_forward = chirp_mass_solar(source.mass1_solar, source.mass2_solar)
    mass_reverse = chirp_mass_solar(source.mass2_solar, source.mass1_solar)
    frequencies = [row["frequency_hz"] for row in track]
    rows = [
        {
            "check": "chirp_mass_symmetry",
            "value": mass_forward - mass_reverse,
            "expected": 0.0,
            "passed": math.isclose(mass_forward, mass_reverse, abs_tol=1e-14),
        },
        {
            "check": "positive_frequency_derivative",
            "value": min(row["dfdt_hz_per_second"] for row in track),
            "expected": "> 0",
            "passed": all(row["dfdt_hz_per_second"] > 0 for row in track),
        },
        {
            "check": "frequency_monotonic",
            "value": frequencies[-1] - frequencies[0],
            "expected": ">= 0",
            "passed": all(b >= a for a, b in zip(frequencies, frequencies[1:])),
        },
        {
            "check": "isco_not_exceeded",
            "value": max(frequencies),
            "expected": isco_frequency_hz(source),
            "passed": max(frequencies) <= isco_frequency_hz(source),
        },
        {
            "check": "inverse_distance_amplitude",
            "value": amplitude_plus(30.0, far_source) / amplitude_plus(30.0, source),
            "expected": 0.5,
            "passed": math.isclose(
                amplitude_plus(30.0, far_source) / amplitude_plus(30.0, source),
                0.5,
                rel_tol=1e-12,
            ),
        },
    ]
    output = Path(__file__).resolve().parents[1] / "data" / "validation_summary.csv"
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["check", "value", "expected", "passed"])
        writer.writeheader()
        writer.writerows(rows)
    failures = [row["check"] for row in rows if not row["passed"]]
    if failures:
        raise SystemExit(f"Validation failed: {', '.join(str(name) for name in failures)}")
    print(f"Validated {len(rows)} inspiral invariants; wrote {output}")


if __name__ == "__main__":
    main()
