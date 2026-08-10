"""Generate an SI-scaled leading-order gravitational-wave inspiral reference series."""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path

G = 6.67430e-11
C = 299792458.0
SOLAR_MASS_KG = 1.98847e30
MPC_METRES = 3.085677581491367e22


@dataclass(frozen=True)
class Source:
    mass1_solar: float = 36.0
    mass2_solar: float = 29.0
    distance_mpc: float = 410.0
    inclination_degrees: float = 30.0
    start_frequency_hz: float = 20.0
    duration_seconds: float = 8.0
    sample_rate_hz: int = 4096


def chirp_mass_solar(mass1_solar: float, mass2_solar: float) -> float:
    return (mass1_solar * mass2_solar) ** (3.0 / 5.0) / (
        mass1_solar + mass2_solar
    ) ** (1.0 / 5.0)


def isco_frequency_hz(source: Source) -> float:
    total_mass_kg = (source.mass1_solar + source.mass2_solar) * SOLAR_MASS_KG
    return C**3 / (6.0**1.5 * math.pi * G * total_mass_kg)


def chirp_rate_hz_per_second(frequency_hz: float, chirp_mass_kg: float) -> float:
    return (
        96.0
        / 5.0
        * math.pi ** (8.0 / 3.0)
        * (G * chirp_mass_kg / C**3) ** (5.0 / 3.0)
        * frequency_hz ** (11.0 / 3.0)
    )


def amplitude_plus(frequency_hz: float, source: Source) -> float:
    chirp_mass_kg = chirp_mass_solar(source.mass1_solar, source.mass2_solar) * SOLAR_MASS_KG
    distance_metres = source.distance_mpc * MPC_METRES
    inclination = math.radians(source.inclination_degrees)
    orientation = (1.0 + math.cos(inclination) ** 2) / 2.0
    return (
        orientation
        * 4.0
        * (G * chirp_mass_kg) ** (5.0 / 3.0)
        * (math.pi * frequency_hz) ** (2.0 / 3.0)
        / (C**4 * distance_metres)
    )


def rk4_step(frequency_hz: float, dt: float, chirp_mass_kg: float) -> float:
    k1 = chirp_rate_hz_per_second(frequency_hz, chirp_mass_kg)
    k2 = chirp_rate_hz_per_second(frequency_hz + dt * k1 / 2.0, chirp_mass_kg)
    k3 = chirp_rate_hz_per_second(frequency_hz + dt * k2 / 2.0, chirp_mass_kg)
    k4 = chirp_rate_hz_per_second(frequency_hz + dt * k3, chirp_mass_kg)
    return frequency_hz + dt * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0


def generate(source: Source = Source()) -> list[dict[str, float]]:
    chirp_mass_kg = chirp_mass_solar(source.mass1_solar, source.mass2_solar) * SOLAR_MASS_KG
    isco = isco_frequency_hz(source)
    frequency = min(source.start_frequency_hz, isco * 0.995)
    dt = 1.0 / source.sample_rate_hz
    phase = 0.0
    rows: list[dict[str, float]] = []
    for index in range(math.floor(source.duration_seconds * source.sample_rate_hz) + 1):
        derivative = chirp_rate_hz_per_second(frequency, chirp_mass_kg)
        amplitude = amplitude_plus(frequency, source)
        rows.append(
            {
                "time_seconds": index * dt,
                "strain_plus": amplitude * math.cos(phase),
                "frequency_hz": frequency,
                "dfdt_hz_per_second": derivative,
                "amplitude": amplitude,
            }
        )
        if frequency >= isco * 0.999999:
            break
        next_frequency = min(isco, rk4_step(frequency, dt, chirp_mass_kg))
        phase += math.pi * (frequency + next_frequency) * dt
        frequency = next_frequency
    return rows


def main() -> None:
    output = Path(__file__).resolve().parents[1] / "data" / "synthetic_chirp.csv"
    rows = generate()
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} SI strain samples to {output}")


if __name__ == "__main__":
    main()
