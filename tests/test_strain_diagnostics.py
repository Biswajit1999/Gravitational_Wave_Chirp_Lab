"""Numerical and physics-aware regression checks; all injected data are synthetic."""
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from generate_chirp import chirp_mass_solar, chirp_rate_hz_per_second, rk4_step
from strain_diagnostics import (SOLAR_MASS_KG, band_variance, chirp_mass_from_rate,
                                chirp_time_between, detector_lag, welch_psd)


class InspiralTests(unittest.TestCase):
    def test_inverse_chirp_mass(self):
        mass = chirp_mass_solar(36, 29)
        for frequency in (20., 35., 50.):
            rate = chirp_rate_hz_per_second(frequency, mass * SOLAR_MASS_KG)
            self.assertAlmostEqual(chirp_mass_from_rate(frequency, rate), mass, places=11)

    def test_analytic_time_vs_rk4(self):
        mass = chirp_mass_solar(36, 29)
        target = 26.
        exact = chirp_time_between(20, target, mass)
        # Compare the RK4 solution with the exact 0PN frequency evolution
        # at a fixed time away from the merger singularity.
        t = 0.06
        k = (20 ** (-8 / 3) - target ** (-8 / 3)) / exact
        analytic_f = (20 ** (-8 / 3) - k * t) ** (-3 / 8)
        errors = []
        for steps in (4, 8, 16):
            f = 20.
            for _ in range(steps):
                f = rk4_step(f, t / steps, mass * SOLAR_MASS_KG)
            errors.append(abs(f - analytic_f))
        self.assertLess(errors[-1], errors[0] / 40)
        self.assertLess(errors[-1], 1e-7)

    def test_invalid_physics(self):
        for args in ((0, 50, 20), (40, 20, 20), (20, 50, -1)):
            with self.assertRaises(ValueError):
                chirp_time_between(*args)
        with self.assertRaises(ValueError):
            chirp_mass_from_rate(20, 0)


class SpectralTests(unittest.TestCase):
    def test_white_noise_psd_normalization(self):
        rng = np.random.default_rng(17)
        fs = 1024
        x = rng.normal(0, 3, 64 * fs)
        f, p, count = welch_psd(x, fs, 1024)
        self.assertGreater(count, 100)
        self.assertAlmostEqual(np.mean(p[30:400]), 2 * 9 / fs, delta=0.0015)
        self.assertAlmostEqual(band_variance(f, p, 1, 511), 9, delta=0.6)

    def test_sinusoidal_power(self):
        fs = 1024
        x = 0.8 * np.sin(2 * np.pi * 64 * np.arange(fs * 8) / fs)
        f, p, _ = welch_psd(x, fs, 1024)
        self.assertEqual(float(f[np.argmax(p)]), 64.)
        self.assertAlmostEqual(band_variance(f, p, 60, 68), 0.8**2 / 2, delta=0.01)

    def test_reject_bad_spectral_inputs(self):
        with self.assertRaises(ValueError):
            welch_psd(np.ones(8), 1024, 16)
        with self.assertRaises(ValueError):
            band_variance(np.array([0, 2]), np.array([1, -1]), 0, 2)


class CoincidenceTests(unittest.TestCase):
    def test_known_lag_and_antenna_sign(self):
        fs = 1024
        rng = np.random.default_rng(8)
        n = 4096
        t = np.arange(n) / fs
        pulse = np.exp(-0.5 * ((t - 2) / 0.035)**2) * np.cos(2 * np.pi * 110 * t)
        a = np.roll(pulse, 6) + rng.normal(0, 0.015, n)
        b = -pulse + rng.normal(0, 0.015, n)
        result = detector_lag(a, b, fs, 0.012, 35, 300)
        self.assertAlmostEqual(result.lag_seconds, 6 / fs)
        self.assertLess(result.correlation, -0.9)

    def test_symmetry_and_uncorrelated_noise(self):
        fs = 1024
        rng = np.random.default_rng(42)
        a, b = rng.normal(size=(2, 4096))
        first = detector_lag(a, b, fs, 0.01, 35, 300)
        second = detector_lag(b, a, fs, 0.01, 35, 300)
        self.assertAlmostEqual(first.lag_seconds, -second.lag_seconds)
        self.assertAlmostEqual(first.correlation, second.correlation)
        self.assertLess(abs(first.correlation), 0.15)

    def test_reject_mismatched_detector_samples(self):
        with self.assertRaises(ValueError):
            detector_lag(np.ones(100), np.ones(101), 1024)


if __name__ == "__main__":
    unittest.main()
