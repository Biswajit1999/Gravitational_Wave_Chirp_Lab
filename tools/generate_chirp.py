"""Generate a simple synthetic gravitational-wave chirp CSV."""

from __future__ import annotations

import csv
import math
from pathlib import Path


def chirp_mass(m1: float, m2: float) -> float:
    return (m1 * m2) ** (3 / 5) / (m1 + m2) ** (1 / 5)


def generate(m1: float = 36.0, m2: float = 29.0, distance: float = 410.0) -> list[dict[str, float]]:
    mc = chirp_mass(m1, m2)
    f_isco = 4400.0 / (m1 + m2)
    duration = 6.0
    phase = 0.0
    frequency = 28.0
    solar_mass_time = 4.92549095e-6
    mc_seconds = mc * solar_mass_time
    dt = duration / 900
    rows = []
    for index in range(900):
        x = index / 899
        time = -duration + x * duration
        dfdt = (96 / 5) * math.pi ** (8 / 3) * mc_seconds ** (5 / 3) * frequency ** (11 / 3)
        frequency = min(f_isco, frequency + dfdt * dt)
        phase += 2.0 * math.pi * frequency * dt
        amp = (mc / 26.1) ** (5 / 3) * (410.0 / distance) * (frequency / 120.0) ** (2 / 3)
        rows.append({"time_s": time, "frequency_hz": frequency, "relative_strain": amp * math.sin(phase)})
    return rows


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "data" / "synthetic_chirp.csv"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["time_s", "frequency_hz", "relative_strain"])
        writer.writeheader()
        writer.writerows(generate())
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
