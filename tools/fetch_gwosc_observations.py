#!/usr/bin/env python3
"""Retrieve and validate official GWOSC GW150914-v3 calibrated strain products."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
OBSERVATIONS = ROOT / "data" / "observations"
SOURCE_API = "https://gwosc.org/api/v2/event-versions/GW150914-v3/strain-files?format=api"
FILES = {
    "H1": "H-H1_GWOSC_4KHZ_R1-1126259447-32.txt.gz",
    "L1": "L-L1_GWOSC_4KHZ_R1-1126259447-32.txt.gz",
}
BASE = "https://gwosc.org/eventapi/json/GWTC-1-confident/GW150914/v3/"
EXPECTED_SAMPLES = 32 * 4096


def download(url: str, path: Path) -> None:
    request = Request(url, headers={"User-Agent": "GW-Chirp-Lab observation builder/1.0"})
    with urlopen(request, timeout=120) as response:
        path.write_bytes(response.read())


def count_samples(path: Path) -> int:
    count = 0
    with gzip.open(path, "rt", encoding="ascii") as handle:
        for line in handle:
            value = line.strip()
            if value and not value.startswith("#"):
                float(value.split()[-1])
                count += 1
    return count


def main() -> None:
    OBSERVATIONS.mkdir(parents=True, exist_ok=True)
    products = {}
    for detector, filename in FILES.items():
        destination = OBSERVATIONS / filename
        download(BASE + filename, destination)
        samples = count_samples(destination)
        if samples != EXPECTED_SAMPLES:
            raise ValueError(f"{detector} sample count {samples} differs from {EXPECTED_SAMPLES}")
        products[detector] = {
            "file": filename,
            "officialUrl": BASE + filename,
            "bytes": destination.stat().st_size,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            "samples": samples,
        }
        print(f"Retrieved {detector}: {samples} calibrated strain samples / {destination.stat().st_size} bytes")
    metadata = {
        "dataset": "GWOSC GW150914-v3 calibrated detector strain",
        "event": "GW150914",
        "eventGpsSeconds": 1126259462.423,
        "segmentStartGpsSeconds": 1126259447,
        "durationSeconds": 32,
        "sampleRateHz": 4096,
        "sourceApi": SOURCE_API,
        "products": products,
        "displayProcessing": {
            "conditioning": "Worker removes the selected event-window mean, applies an edge taper and a 35-350 Hz FFT-domain band pass.",
            "spectrogram": "Worker STFT of the conditioned released detector strain.",
            "comparison": "Leading-order PN strain is an optional amber overlay only.",
        },
        "interpretation": "The cyan waveform and spectrogram originate from GWOSC measured strain. The amber PN trace is an optional computed comparison.",
        "citation": "Abbott, B.P. et al., 2021. Open data from the first and second observing runs of Advanced LIGO and Advanced Virgo. SoftwareX, 13, 100658.",
    }
    (OBSERVATIONS / "gwosc_GW150914_metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
