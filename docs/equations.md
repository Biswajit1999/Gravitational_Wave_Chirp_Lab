# Equations and Assumptions

## Chirp Mass

The leading-order inspiral is controlled by the chirp mass:

```text
Mc = (m1 m2)^(3/5) / (m1 + m2)^(1/5)
```

This is the mass combination that sets the dominant gravitational-wave frequency evolution during the inspiral.

## Frequency Evolution

The simulator uses the quadrupole-order inspiral frequency derivative:

```text
df/dt = (96/5) pi^(8/3) (G Mc / c^3)^(5/3) f^(11/3)
```

The code evaluates `G Mc / c^3` using the solar-mass time constant:

```text
T_sun = G Msun / c^3 = 4.92549095 microseconds
```

## Strain Scaling

The plotted strain is relative, not calibrated detector strain. It scales as:

```text
h_relative proportional to Mc^(5/3) f^(2/3) / D
```

where `D` is luminosity distance. This is useful for intuition, but not for parameter inference.

## ISCO Reference Frequency

The Schwarzschild innermost-stable-circular-orbit scaling is approximated as:

```text
f_ISCO ~= 4400 Hz / (M / Msun)
```

where `M = m1 + m2`. This is a reference scale, not a full merger model.
