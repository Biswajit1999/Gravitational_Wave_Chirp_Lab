"""Leading-order inspiral diagnostics, not a merger/ringdown waveform."""
import math

G = 6.67430e-11
C = 299792458.0
MSUN = 1.98847e30


def chirp_mass(m1_solar, m2_solar):
    if not all(map(math.isfinite, (m1_solar, m2_solar))) or min(m1_solar, m2_solar) <= 0:
        raise ValueError("component masses must be finite and positive")
    return (m1_solar * m2_solar) ** (3 / 5) / (m1_solar + m2_solar) ** (1 / 5)


def frequency_derivative(f_hz, mc_solar):
    """Newtonian df/dt, in Hz/s; assumes circular orbit and detector-frame mass."""
    if not all(map(math.isfinite, (f_hz, mc_solar))) or min(f_hz, mc_solar) <= 0:
        raise ValueError("frequency and chirp mass must be positive")
    return (96 / 5) * math.pi ** (8 / 3) * (G * mc_solar * MSUN / C**3) ** (5 / 3) * f_hz ** (11 / 3)


def time_to_coalescence(f_hz, mc_solar):
    """Formal Newtonian time to infinite frequency, not a physical merger time."""
    if not all(map(math.isfinite, (f_hz, mc_solar))) or min(f_hz, mc_solar) <= 0:
        raise ValueError("frequency and chirp mass must be positive")
    return 5 / 256 * (G * mc_solar * MSUN / C**3) ** (-5 / 3) * (math.pi * f_hz) ** (-8 / 3)


def infer_chirp_mass(f_hz, fdot_hz_s):
    """Invert quadrupole chirp equation; only valid in the early inspiral."""
    if not all(map(math.isfinite, (f_hz, fdot_hz_s))) or min(f_hz, fdot_hz_s) <= 0:
        raise ValueError("positive finite frequency and derivative required")
    factor = fdot_hz_s / ((96 / 5) * math.pi ** (8 / 3) * f_hz ** (11 / 3))
    return C**3 / (G * MSUN) * factor ** (3 / 5)


def chirp_mass_relative_uncertainty(f_hz, fdot_hz_s, sigma_f, sigma_fdot, correlation=0):
    """First-order relative 1-sigma uncertainty, including f/fdot correlation."""
    if not all(map(math.isfinite, (sigma_f, sigma_fdot, correlation))) or min(sigma_f, sigma_fdot) < 0 or abs(correlation) > 1:
        raise ValueError("invalid uncertainty or correlation")
    if f_hz <= 0 or fdot_hz_s <= 0:
        raise ValueError("frequency and derivative must be positive")
    x = 11 * sigma_f / (5 * f_hz)
    y = 3 * sigma_fdot / (5 * fdot_hz_s)
    return math.sqrt(max(0.0, x*x + y*y - 2*correlation*x*y))
