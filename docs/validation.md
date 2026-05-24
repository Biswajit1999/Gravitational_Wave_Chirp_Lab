# Validation Notes

## Checks Implemented

1. **Chirp mass symmetry**

   Swapping `m1` and `m2` must not change `Mc`.

2. **Frequency monotonicity**

   The leading-order inspiral frequency derivative is positive for positive mass and frequency, so the synthetic frequency track must increase with time until capped by the ISCO reference.

3. **Distance scaling**

   Relative strain should scale inversely with distance. Doubling the luminosity distance should halve the relative amplitude scale.

4. **Mass scaling**

   Increasing chirp mass should increase both the amplitude scale and the frequency derivative.

## Scientific Scope

This project validates the internal behaviour of a leading-order educational model. It does not validate waveform faithfulness against post-Newtonian, effective-one-body, numerical-relativity, or detector-calibrated waveform families.
