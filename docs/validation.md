# Validation Protocol

Run the independent reference implementation with a functioning Python 3 interpreter:

```bash
python tools/generate_chirp.py
python tools/validate_model.py
```

The tests verify chirp-mass symmetry, the analytic SI value of the Schwarzschild ISCO frequency,
monotonically increasing frequency below termination, exact inverse-distance amplitude scaling,
positive `df/dt`, and termination without crossing the ISCO bound. These checks establish
internal physical and unit consistency; they do not establish waveform faithfulness for
parameter estimation or merger-ringdown analysis.
