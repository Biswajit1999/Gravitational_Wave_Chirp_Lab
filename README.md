# Gravitational Wave Chirp Lab

An observation-led browser instrument for the first detected binary black-hole signal,
GW150914. The default waveform and time-frequency display use public calibrated detector strain
from the Gravitational Wave Open Science Center (GWOSC). A leading-order post-Newtonian (PN)
inspiral can be switched on as a comparison overlay; it is never presented as measured data.

## Observational Product

The instrument loads the official GWOSC `GW150914-v3` 32-second, 4096 Hz calibrated strain
file for the selected detector:

| Detector | Official GWOSC product |
| --- | --- |
| Hanford H1 | `H-H1_GWOSC_4KHZ_R1-1126259447-32.txt.gz` |
| Livingston L1 | `L-L1_GWOSC_4KHZ_R1-1126259447-32.txt.gz` |

Source endpoint: [GWOSC GW150914-v3 strain-file API](https://gwosc.org/api/v2/event-versions/GW150914-v3/strain-files?format=api).

The event cursor is centred at GPS `1126259462.423`. The worker performs the display
conditioning transparently:

1. Decompress the official ASCII strain product in the worker.
2. Extract the selected event-centred time window.
3. Remove the local mean, apply an edge taper and a cosine-transition `35-350 Hz` bandpass.
4. Compute a Hann-window STFT of the conditioned measured strain.

Exports contain both the original calibrated samples in the chosen window and the conditioned
samples displayed by the console. When the PN switch is enabled, a separate clearly named
overlay column is added.

## Simulation Overlay

Enable `PN COMPARISON` to draw a physically scaled leading-order inspiral signal in amber over
the observed cyan trace. The comparison controls affect the model only; they cannot alter the
GWOSC data.

For source-frame component masses `m1` and `m2`, the chirp mass is:

```text
Mchirp = (m1 m2)^(3/5) / (m1 + m2)^(1/5)
```

The quadrupole, leading-order gravitational-wave frequency evolution for a quasi-circular
inspiral is:

```text
df/dt = (96/5) pi^(8/3) (G Mchirp / c^3)^(5/3) f^(11/3)
```

The optional waveform is:

```text
A(f) = 4 (G Mchirp)^(5/3) (pi f)^(2/3) / (c^4 D_L)
h+(t) = A(f) [(1 + cos^2 i) / 2] cos(phi(t))
dphi/dt = 2 pi f
```

The worker advances this model with RK4 and aligns the latest generated model sample to the
published event time. This simple overlay omits higher PN terms, spins, merger-ringdown,
detector antenna response, template matching and parameter inference.

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
tools/
  fetch_gwosc_observations.py       Acquire and hash-check official local cache
  validate_observations.py          Validate retained calibrated segments
```

The main thread never filters detector strain, evaluates the PN equations or computes the
spectrogram. Those operations are isolated in `physicsWorker.js`; the UI receives compact
typed-array render products.

## Run

Serve this directory over HTTP:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`. The worker first attempts locally retained official files and,
when they are absent, retrieves the same calibrated products from GWOSC. If neither source can
be reached, the console reports a data-load error rather than substituting a simulation.

For offline use, retrieve and validate the official local cache:

```bash
python tools/fetch_gwosc_observations.py
python tools/validate_observations.py
```

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

Peters, P.C., 1964. Gravitational radiation and the motion of two point masses.
*Physical Review*, 136(4B), p.B1224. https://doi.org/10.1103/PhysRev.136.B1224.

## Licence

Released under the MIT Licence. See `LICENSE`.
