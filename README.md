# Gravitational Wave Chirp Lab

Interactive compact binary inspiral visualiser for exploring chirp mass, frequency evolution, and strain scaling.

**Author:** Biswajit Jana

## Research Motivation

Gravitational-wave chirps reveal the final inspiral of compact binaries. This lab gives an intuitive, browser-based view of how component masses and distance change the waveform amplitude and frequency sweep.

## Model Assumptions

The browser model uses a Newtonian-order chirp-inspired approximation. The chirp mass is:

```text
Mc = (m1 m2)^(3/5) / (m1 + m2)^(1/5)
```

The displayed strain is scaled approximately as:

```text
h proportional to Mc^(5/3) f^(2/3) / D
```

The leading-order frequency evolution is:

```text
df/dt = (96/5) pi^(8/3) (G Mc / c^3)^(5/3) f^(11/3)
```

The final reference frequency uses the rough Schwarzschild ISCO scaling:

```text
f_ISCO ~= 4400 Hz / (M / Msun)
```

## Features

- Live waveform plot.
- Frequency evolution plot.
- Controls for primary mass, secondary mass, distance, start frequency, and final seconds.
- Chirp mass, ISCO frequency, and relative strain readouts.
- Static GitHub Pages-ready implementation.

## Research Use Cases

- Demonstrating why chirp mass is the best-measured leading-order compact-binary mass combination.
- Building intuition for how mass and distance change the inspiral track before using real waveform libraries.
- Producing synthetic waveform-like CSVs for teaching signal processing, matched-filter intuition, or plotting pipelines.
- Comparing leading-order scaling against higher-order waveform models in a future validation notebook.

## Running Locally

Open `index.html` in a browser.

Optional Python generation and validation:

```bash
python tools/generate_chirp.py
python tools/validate_model.py
```

## README Image Prompt

A README hero image prompt is provided in [`docs/image_prompt.md`](docs/image_prompt.md). It is designed for a serious compact-binary research visual rather than a generic space illustration.

## Limitations

This is not a numerical relativity model and does not include detector antenna response, post-Newtonian phase terms, spins, eccentricity, merger-ringdown physics, or real LIGO/Virgo/KAGRA data.

## Research References

- Peters & Mathews, 1963, gravitational radiation from point masses in Keplerian orbits.
- Sathyaprakash & Schutz, 2009, *Physics, Astrophysics and Cosmology with Gravitational Waves*.
- Abbott et al., 2016, *Observation of Gravitational Waves from a Binary Black Hole Merger*.
- Maggiore, *Gravitational Waves, Volume 1*.

## Future Upgrades

- Add post-Newtonian phase terms.
- Add detector noise curves.
- Add matched-filter SNR toy model.
- Add Python-generated waveform comparison datasets.
- Add LIGO Open Science Center event overlays with proper data citations.

## Topics

`astrophysics`, `gravitational-waves`, `black-holes`, `signal-processing`, `scientific-visualisation`, `javascript`, `github-pages`
