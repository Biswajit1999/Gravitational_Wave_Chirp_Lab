"""Quadrupole inspiral algebra and error-propagation checks."""
import math
from research.inspiral_diagnostics import (
    chirp_mass, frequency_derivative, time_to_coalescence,
    infer_chirp_mass, chirp_mass_relative_uncertainty,
)


def test_mass_symmetry_and_inversion():
    mc = chirp_mass(36, 29)
    assert math.isclose(mc, chirp_mass(29, 36))
    for f in (25.0, 40.0, 70.0):
        assert math.isclose(infer_chirp_mass(f, frequency_derivative(f, mc)), mc, rel_tol=1e-12)


def test_chirp_scaling():
    mc = chirp_mass(36, 29)
    assert math.isclose(frequency_derivative(40, mc) / frequency_derivative(20, mc), 2 ** (11 / 3))
    assert math.isclose(time_to_coalescence(40, mc) / time_to_coalescence(20, mc), 2 ** (-8 / 3))


def test_uncertainty_covariance():
    independent = chirp_mass_relative_uncertainty(40, 10, 0.2, 0.1)
    positive = chirp_mass_relative_uncertainty(40, 10, 0.2, 0.1, correlation=0.8)
    assert 0 <= positive < independent
