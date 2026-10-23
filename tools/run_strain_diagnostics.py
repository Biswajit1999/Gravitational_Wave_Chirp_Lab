"""Reproducible descriptive diagnostics on locally retained GWOSC GW150914 strain."""
from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np

from strain_diagnostics import band_variance, detector_lag, welch_psd

ROOT = Path(__file__).resolve().parents[1]
OBS = ROOT / "data" / "observations"


def main() -> None:
    metadata = json.loads((OBS / "gwosc_GW150914_metadata.json").read_text())
    fs = metadata["sampleRateHz"]
    streams = {}
    for detector in ("H1", "L1"):
        path = OBS / metadata["products"][detector]["file"]
        with gzip.open(path, "rt", encoding="ascii") as handle:
            values = np.loadtxt(handle)
        if len(values) != fs * metadata["durationSeconds"] or not np.all(np.isfinite(values)):
            raise ValueError(f"Unexpected GWOSC strain segment: {detector}")
        streams[detector] = values
    offset = metadata["eventGpsSeconds"] - metadata["segmentStartGpsSeconds"]
    midpoint = int(round(offset * fs))
    half = fs // 2
    event_h = streams["H1"][midpoint - half:midpoint + half]
    event_l = streams["L1"][midpoint - half:midpoint + half]
    control_h = streams["H1"][2 * fs:3 * fs]
    control_l = streams["L1"][2 * fs:3 * fs]
    summary = {"dataset": metadata["dataset"], "interpretation":
               "Descriptive PSD and band-limited correlation only; no detection significance."}
    for detector, stream in streams.items():
        f, psd, nseg = welch_psd(stream[:8 * fs], fs, fs)
        summary[detector] = {"off_event_welch_segments": nseg,
                             "off_event_35_350_hz_rms_strain":
                             float(np.sqrt(band_variance(f, psd, 35, 350)))}
    for name, a, b in (("event", event_h, event_l), ("control", control_h, control_l)):
        d = detector_lag(a, b, fs)
        summary[name] = {"peak_abs_correlation_lag_seconds": d.lag_seconds,
                         "signed_correlation_at_peak": d.correlation}
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
