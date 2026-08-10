# Gravitational Wave Chirp Lab

An observation-led browser instrument for the first detected binary black-hole signal,
GW150914. The default waveform and time-frequency display use public calibrated detector strain
from the Gravitational Wave Open Science Center (GWOSC). A leading-order post-Newtonian (PN)
inspiral can be switched on as a comparison overlay; it is never presented as measured data.

## Scientific Background

### Gravitational waves from compact binary inspirals

General relativity predicts that any accelerating mass quadrupole radiates gravitational waves —
ripples in spacetime curvature that propagate at the speed of light. The strongest astrophysical
sources are compact binaries: two neutron stars or black holes orbiting close enough that the
radiated power carries away a measurable fraction of the system's orbital energy. As energy is
lost, the orbital separation shrinks, the orbital frequency rises, and the emitted gravitational-wave
frequency (twice the orbital frequency, to leading order) sweeps upward. The resulting signal —
rising in both frequency and amplitude as the binary spirals inward — is the "chirp" this lab is
named for.

### Chirp mass and frequency evolution

For a quasi-circular, non-spinning binary with component masses `m1` and `m2`, the rate of
frequency increase depends, at leading (Newtonian quadrupole) order, on a single combined mass
parameter called the **chirp mass**:

```
Mchirp = (m1 m2)^(3/5) / (m1 + m2)^(1/5)
```

This is the best-measured parameter in a gravitational-wave chirp because it alone sets the
leading-order rate of frequency sweep, `df/dt`. Higher post-Newtonian orders introduce
corrections that depend on the mass ratio and spins, which is how a full analysis breaks the
degeneracy between `m1` and `m2` individually.

### Post-Newtonian approximation

The post-Newtonian (PN) formalism expands the two-body equations of motion and radiation in
powers of `v/c`, the characteristic orbital velocity over the speed of light. It is valid while
the bodies are widely separated and moving non-relativistically, and it breaks down as the
binary approaches merger. This lab implements only the **leading (0PN / quadrupole) order**
of that expansion — sufficient to reproduce the characteristic chirp shape, but omitting spin
couplings, higher-order amplitude and phase corrections, eccentricity, and the merger and
ringdown that follow inspiral. Full LIGO/Virgo parameter estimation instead uses waveform
families that resum many PN orders and calibrate against numerical relativity through merger.

### LIGO/Virgo detection context

Advanced LIGO (Hanford, H1, and Livingston, L1) and Advanced Virgo are kilometre-scale laser
interferometers that measure differential arm-length changes of order `10^-19` m — a strain of
roughly one part in `10^21`. GW150914, observed on 14 September 2015, was the first direct
detection of gravitational waves and the first observation of a binary black hole merger,
announced by the LIGO Scientific Collaboration and Virgo Collaboration in February 2016 (Abbott
et al., 2016). The event's inferred source masses (~36 and ~29 solar masses at ~410 Mpc) are the
default parameters used by this lab's simulation overlay. GWOSC subsequently released the
calibrated public strain data for this and later events, which is what this instrument loads by
default (Abbott et al., 2021).

## How It Works

This is a static, client-side application: there is no backend. All physics — data conditioning,
the PN model, and the spectrogram — runs inside a Web Worker (`assets/js/physicsWorker.js`) so the
UI thread stays responsive.

### Observational product

1. The worker fetches the official GWOSC `GW150914-v3` 32-second, 4096 Hz calibrated strain file
   for the selected detector (H1 or L1), preferring a locally retained copy in
   `data/observations/` and falling back to the live GWOSC endpoint.
2. It decompresses the gzip ASCII strain product and extracts the window centred on the event
   GPS time `1126259462.423`.
3. It removes the local mean, applies a cosine edge taper, and band-passes the segment to
   35–350 Hz using an FFT-domain cosine transition filter.
4. It computes a Hann-windowed short-time Fourier transform (STFT) of the conditioned strain to
   drive the spectrogram display.

If neither the local cache nor the live endpoint can be reached, the console reports a data-load
error — it never substitutes simulated data for the missing observation.

### Simulation overlay

When `PN COMPARISON` is enabled, the worker separately integrates the leading-order PN frequency
evolution (`df/dt`, see Math Appendix) with fourth-order Runge-Kutta, accumulates phase by
trapezoidal integration, and evaluates the leading-order plus-polarization amplitude at each
step. Integration stops once the frequency reaches the Schwarzschild innermost stable circular
orbit (ISCO) frequency for the chosen total mass. The generated track is time-aligned to end at
the same event time as the observed data and drawn as a separate amber trace — it is a physically
scaled comparison model, not a fit to the data, and toggling it never modifies the GWOSC samples.

### Rendering and export

`assets/js/app.js` receives compact typed-array "render products" from the worker (decimated
time series, spectrogram RGBA bitmap, cursor position) and draws them to canvas; it never itself
filters strain, evaluates the PN equations, or computes the FFT. Exports write the observed
raw and conditioned strain (plus the PN overlay column, if enabled) to CSV.

## Architecture

```text
index.html
assets/
  css/style.css             Mission-control interface
  js/app.js                 Canvas renderer and observed/model labelling
  js/physicsWorker.js       GWOSC fetch, conditioning, STFT and optional PN evolution
data/
  observations/
    gwosc_GW150914_metadata.json
    H-H1_GWOSC_4KHZ_R1-1126259447-32.txt.gz  optional local official cache
    L-L1_GWOSC_4KHZ_R1-1126259447-32.txt.gz  optional local official cache
  synthetic_chirp.csv        reference PN-only track from tools/generate_chirp.py
  validation_summary.csv     output of tools/validate_model.py
tools/
  fetch_gwosc_observations.py  Acquire and hash-check official local cache
  validate_observations.py     Validate retained calibrated segments
  generate_chirp.py            Independent Python reference implementation of the PN overlay
  validate_model.py            Physical-invariant checks on the Python reference implementation
docs/
  equations.md                Worker-side equation reference
  validation.md                Validation protocol notes
```

The main thread never filters detector strain, evaluates the PN equations or computes the
spectrogram. Those operations are isolated in `physicsWorker.js`; the UI receives compact
typed-array render products.

## Usage

Serve this directory over HTTP (opening `index.html` directly will not work, because the
worker fetches files by relative path and the browser's module/worker security model requires
an HTTP origin):

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`. The worker first attempts locally retained official files and,
when they are absent, retrieves the same calibrated products from GWOSC. If neither source can
be reached, the console reports a data-load error rather than substituting a simulation.

For offline use, retrieve and validate the official local cache first:

```bash
python tools/fetch_gwosc_observations.py
python tools/validate_observations.py
```

To generate and validate the independent Python reference implementation of the PN overlay
(useful for checking the in-browser model against a separate implementation):

```bash
python tools/generate_chirp.py
python tools/validate_model.py
```

`tools/validate_model.py` checks chirp-mass symmetry under swapping `m1`/`m2`, that `df/dt`
stays strictly positive, that frequency is monotonically non-decreasing, that the ISCO bound is
never exceeded, and that amplitude scales exactly as `1/D_L`. These are internal physical and
unit-consistency checks — they do not establish waveform faithfulness for parameter estimation
or merger-ringdown analysis (see `docs/validation.md`).

### In-browser controls

- **Detector**: switch between Hanford (H1) and Livingston (L1) calibrated strain.
- **Window**: adjust the displayed time window around the event (0.5–4 s).
- **PN COMPARISON**: toggle the amber leading-order inspiral overlay.
- **Source parameters** (when the overlay is enabled): component masses (solar masses),
  luminosity distance (Mpc), inclination angle, and starting frequency, all clamped to
  physically sane ranges by the worker.
- **Export**: writes a CSV of the current window's observed strain (raw and conditioned), plus
  the PN overlay column when enabled.

## Math Appendix

All quantities are calculated in SI units after user inputs are converted from solar masses and
megaparsecs. `G` is the gravitational constant, `c` the speed of light.

**Chirp mass** (source-frame component masses `m1`, `m2`):

```
Mchirp = (m1 m2)^(3/5) / (m1 + m2)^(1/5)
```

**Leading-order (quadrupole, 0PN) frequency evolution** for a quasi-circular inspiral:

```
df/dt = (96/5) pi^(8/3) (G Mchirp / c^3)^(5/3) f^(11/3)
```

**Phase evolution**:

```
dphi/dt = 2 pi f
```

**Leading-order plus-polarization strain amplitude** at luminosity distance `D_L` and
inclination `i`:

```
A(f)  = 4 (G Mchirp)^(5/3) (pi f)^(2/3) / (c^4 D_L)
h+(t) = A(f) [(1 + cos^2 i) / 2] cos(phi(t))
```

**Schwarzschild innermost stable circular orbit (ISCO) frequency**, used as the termination
condition for the model integration, for total mass `M = m1 + m2`:

```
f_ISCO = c^3 / (6^(3/2) pi G M)
```

**Numerical method**: the frequency ODE is advanced with fourth-order Runge-Kutta at the GWOSC
sample rate (4096 Hz); phase is accumulated by trapezoidal integration of `2 pi f` between steps.
Generation stops once `f` reaches `f_ISCO`. The spectrogram is a Hann-windowed short-time Fourier
transform (radix-2 FFT) of the conditioned strain — a display diagnostic that does not modify the
underlying waveform.

**Known omissions** (leading order only): higher post-Newtonian phase and amplitude terms, spin
couplings, orbital eccentricity, merger and ringdown, detector antenna-pattern response, matched
filtering, and Bayesian parameter inference. This overlay is a physically scaled comparison
signal, not a template used to analyze the GWOSC data.

## Export Columns

Observation-only export:

```text
relative_time_seconds,gps_time_seconds,raw_gwosc_strain,conditioned_gwosc_strain
```

With PN comparison enabled:

```text
relative_time_seconds,gps_time_seconds,raw_gwosc_strain,conditioned_gwosc_strain,pn_overlay_strain
```

## References

Abbott, B.P. et al., 2016. Observation of gravitational waves from a binary black hole merger.
*Physical Review Letters*, 116, 061102. https://doi.org/10.1103/PhysRevLett.116.061102.

Abbott, R. et al., 2021. Open data from the first and second observing runs of Advanced LIGO
and Advanced Virgo. *SoftwareX*, 13, 100658.
https://doi.org/10.1016/j.softx.2021.100658.

Blanchet, L., 2014. Gravitational radiation from post-Newtonian sources and inspiralling
compact binaries. *Living Reviews in Relativity*, 17(1), p.2.
https://doi.org/10.12942/lrr-2014-2.

Maggiore, M., 2008. *Gravitational Waves, Volume 1: Theory and Experiment*. Oxford University
Press.

Peters, P.C., 1964. Gravitational radiation and the motion of two point masses.
*Physical Review*, 136(4B), p.B1224. https://doi.org/10.1103/PhysRev.136.B1224.

## Licence

Released under the MIT Licence. See `LICENSE`.
