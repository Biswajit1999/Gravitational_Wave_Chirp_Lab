# Inspiral Kernel Equations

The browser worker models a quasi-circular, non-spinning compact binary at leading
post-Newtonian order. Quantities are calculated in SI units after user inputs are converted from
Solar masses and megaparsecs.

```text
Mchirp = (m1 m2)^(3/5) / (m1 + m2)^(1/5)
df/dt = (96/5) pi^(8/3) (G Mchirp / c^3)^(5/3) f^(11/3)
dphi/dt = 2 pi f
```

The numerical engine uses fourth-order Runge-Kutta integration for frequency and trapezoidal
phase accumulation at the selected acquisition sample rate.

```text
A(f) = 4 (G Mchirp)^(5/3) (pi f)^(2/3) / (c^4 D_L)
h+(t) = A(f) [(1 + cos^2 i) / 2] cos(phi)
f_ISCO = c^3 / (6^(3/2) pi G (m1 + m2))
```

The worker stops generation once `f_ISCO` is reached. The STFT plot is generated from `h+(t)`
with overlapping Hann windows and a radix-2 FFT; it is a display diagnostic and does not modify
the waveform.
