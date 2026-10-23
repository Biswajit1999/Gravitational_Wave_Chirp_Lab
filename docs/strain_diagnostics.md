# Independent GW150914 strain diagnostics (research branch)

`tools/strain_diagnostics.py` provides three independent scientific checks:

1. **0PN chirp evolution:** analytical time between frequencies, instantaneous chirp-mass inversion and RK4 convergence against the analytical solution. These expressions become unreliable near merger and do not fit GWOSC strain.
2. **One-sided Welch PSD:** locally mean-subtracted, Hann-windowed, overlap-averaged strain power in strain²/Hz. A 35–350 Hz integral reports a descriptive off-event RMS. No stationary-noise claim or detector calibration uncertainty is inferred.
3. **Two-detector time lag:** cosine-shoulder FFT bandpass followed by lagged Pearson correlation, preserving sign. Positive lag means H1 (first argument) is delayed relative to L1. Searching the absolute peak introduces a look-elsewhere effect. The lag and correlation are **not a detection statistic, significance or source-direction inference**.

Use `python -m pip install numpy`, `python -m unittest discover -s tests -v`, then `python tools/run_strain_diagnostics.py` with the existing official locally retained GWOSC H1/L1 `.txt.gz` files. The runner uses an 8-second pre-event interval for descriptive PSDs, a 1-second event-centred interval for the lag and a separate 1-second off-event control. It does not change the browser UI or the retained strain.

The tests use seeded synthetic signals; real-data runner output is descriptive only and must be inspected separately. See `data/observations/gwosc_GW150914_metadata.json` for source, hashes and licensing/citation context.
