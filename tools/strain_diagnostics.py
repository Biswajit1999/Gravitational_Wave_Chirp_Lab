"""Independent, limited-scope diagnostics for GWOSC calibrated strain.

No detection significance, PSD calibration or waveform-parameter inference is claimed.
All FFT operations require NumPy; the leading-order inspiral expressions use SI.
"""
from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

G = 6.67430e-11
C = 299792458.0
SOLAR_MASS_KG = 1.98847e30


def _positive_finite(value: float, name: str) -> None:
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be positive and finite")


def chirp_time_between(f_start_hz: float, f_end_hz: float, chirp_mass_solar: float) -> float:
    """Quadrupole-order time in seconds to evolve between two GW frequencies."""
    for value, name in ((f_start_hz, "f_start"), (f_end_hz, "f_end"),
                        (chirp_mass_solar, "chirp mass")):
        _positive_finite(value, name)
    if f_end_hz <= f_start_hz:
        raise ValueError("f_end must exceed f_start")
    tau = G * chirp_mass_solar * SOLAR_MASS_KG / C**3
    return 5 / 256 * tau ** (-5 / 3) * math.pi ** (-8 / 3) * (
        f_start_hz ** (-8 / 3) - f_end_hz ** (-8 / 3))


def chirp_mass_from_rate(frequency_hz: float, dfdt_hz_per_s: float) -> float:
    """Infer a *quadrupole-order* chirp mass from instantaneous frequency and slope."""
    _positive_finite(frequency_hz, "frequency")
    _positive_finite(dfdt_hz_per_s, "dfdt")
    coefficient = 96 / 5 * math.pi ** (8 / 3) * frequency_hz ** (11 / 3)
    return (dfdt_hz_per_s / coefficient) ** (3 / 5) * C**3 / G / SOLAR_MASS_KG


def _validate_series(series: np.ndarray, fs: float) -> np.ndarray:
    _positive_finite(fs, "sample rate")
    x = np.asarray(series, dtype=float)
    if x.ndim != 1 or x.size < 8 or not np.all(np.isfinite(x)):
        raise ValueError("series must be a finite 1D array of >=8 samples")
    return x


def welch_psd(series: np.ndarray, sample_rate_hz: float, segment_samples: int,
              overlap_fraction: float = 0.5) -> tuple[np.ndarray, np.ndarray, int]:
    """One-sided Hann Welch PSD [strain^2/Hz] with DC/Nyquist handled correctly."""
    x = _validate_series(series, sample_rate_hz)
    if not isinstance(segment_samples, int) or segment_samples < 8 or segment_samples > len(x):
        raise ValueError("invalid segment length")
    if not 0 <= overlap_fraction < 1:
        raise ValueError("overlap must lie in [0,1)")
    step = max(1, int(round(segment_samples * (1 - overlap_fraction))))
    starts = range(0, len(x) - segment_samples + 1, step)
    window = np.hanning(segment_samples)
    scale = sample_rate_hz * np.sum(window**2)
    accum = np.zeros(segment_samples // 2 + 1)
    count = 0
    for start in starts:
        chunk = x[start:start + segment_samples]
        spectrum = np.fft.rfft((chunk - chunk.mean()) * window)
        power = np.abs(spectrum)**2 / scale
        if segment_samples % 2 == 0:
            power[1:-1] *= 2
        else:
            power[1:] *= 2
        accum += power
        count += 1
    return np.fft.rfftfreq(segment_samples, 1 / sample_rate_hz), accum / count, count


def band_variance(freq_hz: np.ndarray, psd: np.ndarray, low_hz: float,
                  high_hz: float) -> float:
    """Integrate PSD over complete Fourier bins in the requested band."""
    f = np.asarray(freq_hz, dtype=float)
    p = np.asarray(psd, dtype=float)
    if (f.ndim != 1 or p.shape != f.shape or len(f) < 2
            or not np.all(np.isfinite(f)) or not np.all(np.isfinite(p))
            or np.any(p < 0) or np.any(np.diff(f) <= 0)
            or low_hz < 0 or high_hz <= low_hz):
        raise ValueError("invalid PSD grid or band")
    selected = (f >= low_hz) & (f <= high_hz)
    if np.count_nonzero(selected) < 2:
        raise ValueError("band contains fewer than two PSD bins")
    return float(np.trapezoid(p[selected], f[selected]))


@dataclass(frozen=True)
class LagDiagnostic:
    lag_seconds: float
    correlation: float
    lags_seconds: np.ndarray
    correlations: np.ndarray


def _bandpass(x: np.ndarray, fs: float, low_hz: float, high_hz: float) -> np.ndarray:
    if low_hz <= 0 or high_hz <= low_hz or high_hz >= fs / 2:
        raise ValueError("band must lie strictly inside (0, Nyquist)")
    f = np.fft.rfftfreq(len(x), 1 / fs)
    # Cosine shoulders reduce ringing from an abrupt rectangular band edge.
    width = min((high_hz - low_hz) / 8, low_hz / 3)
    response = np.zeros_like(f)
    inside = (f >= low_hz) & (f <= high_hz)
    response[inside] = 1
    lo = (f >= low_hz - width) & (f < low_hz)
    hi = (f > high_hz) & (f <= high_hz + width)
    response[lo] = 0.5 * (1 - np.cos(np.pi * (f[lo] - (low_hz - width)) / width))
    response[hi] = 0.5 * (1 + np.cos(np.pi * (f[hi] - high_hz) / width))
    return np.fft.irfft(np.fft.rfft(x - x.mean()) * response, n=len(x))


def detector_lag(a: np.ndarray, b: np.ndarray, sample_rate_hz: float,
                 max_lag_seconds: float = 0.012, low_hz: float = 35,
                 high_hz: float = 350) -> LagDiagnostic:
    """Absolute-peak, band-limited lagged Pearson correlation.

    Positive lag means `a` is delayed relative to `b`. Sign of the correlation
    is preserved (detector antenna responses can differ in sign). No trials-factor
    correction, significance estimate or detector-response fit is performed.
    """
    x = _validate_series(a, sample_rate_hz)
    y = _validate_series(b, sample_rate_hz)
    if x.shape != y.shape:
        raise ValueError("detector segments must have the same sample count")
    if not 0 <= max_lag_seconds < (len(x) - 3) / sample_rate_hz:
        raise ValueError("invalid lag window")
    x = _bandpass(x, sample_rate_hz, low_hz, high_hz)
    y = _bandpass(y, sample_rate_hz, low_hz, high_hz)
    limit = int(math.floor(max_lag_seconds * sample_rate_hz))
    lags = np.arange(-limit, limit + 1, dtype=int)
    values = np.empty(len(lags))
    for j, k in enumerate(lags):
        if k >= 0:
            aa, bb = x[k:], y[:len(y) - k]
        else:
            aa, bb = x[:len(x) + k], y[-k:]
        aa = aa - aa.mean()
        bb = bb - bb.mean()
        denominator = np.linalg.norm(aa) * np.linalg.norm(bb)
        values[j] = np.dot(aa, bb) / denominator if denominator > 0 else 0.0
    index = int(np.argmax(np.abs(values)))
    return LagDiagnostic(float(lags[index] / sample_rate_hz),
                         float(values[index]), lags / sample_rate_hz, values)
