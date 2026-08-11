"use strict";

const G = 6.67430e-11;
const C = 299792458;
const SOLAR_MASS_KG = 1.98847e30;
const MPC_METRES = 3.085677581491367e22;
const EVENT_GPS_SECONDS = 1126259462.423;
const GWOSC_START_GPS_SECONDS = 1126259447;
const GWOSC_SAMPLE_RATE_HZ = 4096;
const DISPLAY_SAMPLES = 5000;
const SPECTROGRAM_HEIGHT = 256;
const BANDPASS_LOW_HZ = 35;
const BANDPASS_HIGH_HZ = 350;
const GWOSC_URLS = {
  H1: "https://gwosc.org/eventapi/json/GWTC-1-confident/GW150914/v3/H-H1_GWOSC_4KHZ_R1-1126259447-32.txt.gz",
  L1: "https://gwosc.org/eventapi/json/GWTC-1-confident/GW150914/v3/L-L1_GWOSC_4KHZ_R1-1126259447-32.txt.gz",
};
const GWOSC_LOCAL_URLS = {
  H1: "../../data/observations/H-H1_GWOSC_4KHZ_R1-1126259447-32.txt.gz",
  L1: "../../data/observations/L-L1_GWOSC_4KHZ_R1-1126259447-32.txt.gz",
};

const playback = {
  product: null,
  running: true,
  elapsedSeconds: 0,
  timer: null,
  lastTick: performance.now(),
  cache: new Map(),
};

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "analyse") {
    void analyse(message.requestId, message.parameters);
  } else if (message.type === "setPlayback") {
    playback.running = Boolean(message.running);
    playback.lastTick = performance.now();
    beginPlayback();
    sendCursor();
  } else if (message.type === "exportCsv") {
    sendCsv();
  }
});

async function analyse(requestId, raw) {
  const started = performance.now();
  const parameters = normalise(raw);
  try {
    self.postMessage({ type: "loading", requestId, message: `Retrieving GWOSC ${parameters.detector} calibrated strain` });
    const completeStrain = await getObservedStrain(parameters.detector);
    const observed = cropAndCondition(completeStrain, parameters.windowSeconds);
    const model = parameters.modelOverlay ? createPnOverlay(parameters) : null;
    const spectrum = computeSpectrogram(observed.conditioned, GWOSC_SAMPLE_RATE_HZ, parameters.windowSeconds);
    const observedTrack = decimateObserved(observed);
    const modelTrack = model ? decimateModel(model) : null;
    const metadata = summarise(parameters, observed, model, spectrum, started);
    playback.product = { parameters, observed, model, spectrum, observedTrack, modelTrack, metadata };
    playback.elapsedSeconds = 0;
    playback.lastTick = performance.now();
    transmitProduct(requestId);
    beginPlayback();
    sendCursor();
  } catch (error) {
    self.postMessage({
      type: "dataError",
      requestId,
      message: `Unable to load official GWOSC strain: ${error.message}`,
    });
  }
}

function normalise(raw) {
  const mass1Solar = clamp(number(raw.mass1Solar, 36), 1, 1000);
  const mass2Solar = clamp(number(raw.mass2Solar, 29), 1, 1000);
  const totalMassKg = (mass1Solar + mass2Solar) * SOLAR_MASS_KG;
  const chirpMassSolar =
    (mass1Solar * mass2Solar) ** (3 / 5) / (mass1Solar + mass2Solar) ** (1 / 5);
  const chirpMassKg = chirpMassSolar * SOLAR_MASS_KG;
  const fIscoHz = C ** 3 / (Math.pow(6, 1.5) * Math.PI * G * totalMassKg);
  return {
    detector: raw.detector === "L1" ? "L1" : "H1",
    windowSeconds: clamp(number(raw.windowSeconds, 2), 0.5, 4),
    modelOverlay: Boolean(raw.modelOverlay),
    mass1Solar,
    mass2Solar,
    totalMassSolar: mass1Solar + mass2Solar,
    totalMassKg,
    chirpMassSolar,
    chirpMassKg,
    distanceMpc: clamp(number(raw.distanceMpc, 410), 0.001, 100000),
    distanceMetres: clamp(number(raw.distanceMpc, 410), 0.001, 100000) * MPC_METRES,
    inclinationRadians: clamp(number(raw.inclinationDegrees, 30), 0, 180) * Math.PI / 180,
    startFrequencyHz: clamp(number(raw.startFrequencyHz, 20), 0.1, fIscoHz * 0.995),
    fIscoHz,
    playbackRate: clamp(number(raw.playbackRate, 1), 0.01, 100),
  };
}

async function getObservedStrain(detector) {
  if (playback.cache.has(detector)) return playback.cache.get(detector);
  let response = await fetch(GWOSC_LOCAL_URLS[detector]);
  if (!response.ok) {
    response = await fetch(GWOSC_URLS[detector]);
  }
  if (!response.ok) throw new Error(`GWOSC HTTP ${response.status}`);
  if (typeof DecompressionStream !== "function") {
    throw new Error("this browser does not provide gzip decompression required by GWOSC TXT data");
  }
  const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(decompressed).text();
  const values = [];
  for (const line of text.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#") || stripped.startsWith("%")) continue;
    const columns = stripped.split(/\s+/).map(Number).filter(Number.isFinite);
    if (columns.length) values.push(columns[columns.length - 1]);
  }
  if (values.length < GWOSC_SAMPLE_RATE_HZ * 16) {
    throw new Error(`unexpected ${detector} strain length ${values.length}`);
  }
  const strain = Float64Array.from(values);
  playback.cache.set(detector, strain);
  return strain;
}

function cropAndCondition(complete, windowSeconds) {
  const length = Math.max(256, Math.round(windowSeconds * GWOSC_SAMPLE_RATE_HZ));
  const eventIndex = Math.round((EVENT_GPS_SECONDS - GWOSC_START_GPS_SECONDS) * GWOSC_SAMPLE_RATE_HZ);
  const startIndex = Math.max(0, eventIndex - Math.floor(length / 2));
  const raw = complete.slice(startIndex, startIndex + length);
  const relativeTimes = new Float64Array(raw.length);
  const gpsTimes = new Float64Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    const gps = GWOSC_START_GPS_SECONDS + (startIndex + index) / GWOSC_SAMPLE_RATE_HZ;
    gpsTimes[index] = gps;
    relativeTimes[index] = gps - EVENT_GPS_SECONDS;
  }
  return {
    raw,
    conditioned: bandpass(raw, GWOSC_SAMPLE_RATE_HZ, BANDPASS_LOW_HZ, BANDPASS_HIGH_HZ),
    relativeTimes,
    gpsTimes,
    minimumTimeSeconds: relativeTimes[0],
    maximumTimeSeconds: relativeTimes[relativeTimes.length - 1],
  };
}

function bandpass(input, sampleRateHz, lowHz, highHz) {
  const fftSize = nextPowerOfTwo(input.length);
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  let mean = 0;
  for (const sample of input) mean += sample;
  mean /= input.length;
  for (let index = 0; index < input.length; index += 1) {
    const edge = Math.min(1, index / (input.length * 0.03), (input.length - 1 - index) / (input.length * 0.03));
    const taper = edge >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, edge));
    real[index] = (input[index] - mean) * taper;
  }
  fftInPlace(real, imaginary, false);
  for (let index = 0; index < fftSize; index += 1) {
    const frequency = Math.min(index, fftSize - index) * sampleRateHz / fftSize;
    const highPass = raisedTransition(frequency, lowHz - 8, lowHz + 8);
    const lowPass = 1 - raisedTransition(frequency, highHz - 30, highHz + 30);
    const response = highPass * lowPass;
    real[index] *= response;
    imaginary[index] *= response;
  }
  fftInPlace(real, imaginary, true);
  return real.slice(0, input.length);
}

function raisedTransition(frequency, minimum, maximum) {
  if (frequency <= minimum) return 0;
  if (frequency >= maximum) return 1;
  const fraction = (frequency - minimum) / (maximum - minimum);
  return 0.5 - 0.5 * Math.cos(Math.PI * fraction);
}

function createPnOverlay(parameters) {
  const length = Math.round(parameters.windowSeconds * GWOSC_SAMPLE_RATE_HZ);
  const times = new Float64Array(length);
  const strain = new Float64Array(length);
  const frequencyHz = new Float64Array(length);
  const dfdtHzPerSecond = new Float64Array(length);
  const amplitude = new Float64Array(length);
  const dt = 1 / GWOSC_SAMPLE_RATE_HZ;
  let frequency = parameters.startFrequencyHz;
  let phase = 0;
  let usedLength = 0;
  let terminatedAtIsco = false;
  for (let index = 0; index < length; index += 1) {
    const derivative = chirpRate(frequency, parameters.chirpMassKg);
    const envelope = plusAmplitude(frequency, parameters);
    times[index] = index * dt;
    frequencyHz[index] = frequency;
    dfdtHzPerSecond[index] = derivative;
    amplitude[index] = envelope;
    strain[index] = envelope * Math.cos(phase);
    usedLength = index + 1;
    if (frequency >= parameters.fIscoHz * 0.999999) {
      terminatedAtIsco = true;
      break;
    }
    const nextFrequency = Math.min(parameters.fIscoHz, rungeKuttaFrequencyStep(frequency, dt, parameters.chirpMassKg));
    phase += Math.PI * (frequency + nextFrequency) * dt;
    frequency = nextFrequency;
  }
  const finalTime = times[usedLength - 1];
  const alignedTimes = times.slice(0, usedLength);
  for (let index = 0; index < alignedTimes.length; index += 1) alignedTimes[index] -= finalTime;
  return {
    times: alignedTimes,
    strain: strain.slice(0, usedLength),
    frequencyHz: frequencyHz.slice(0, usedLength),
    dfdtHzPerSecond: dfdtHzPerSecond.slice(0, usedLength),
    amplitude: amplitude.slice(0, usedLength),
    terminatedAtIsco,
  };
}

function chirpRate(frequencyHz, chirpMassKg) {
  return (
    (96 / 5) *
    Math.PI ** (8 / 3) *
    (G * chirpMassKg / C ** 3) ** (5 / 3) *
    frequencyHz ** (11 / 3)
  );
}

function rungeKuttaFrequencyStep(frequencyHz, dt, chirpMassKg) {
  const k1 = chirpRate(frequencyHz, chirpMassKg);
  const k2 = chirpRate(frequencyHz + dt * k1 / 2, chirpMassKg);
  const k3 = chirpRate(frequencyHz + dt * k2 / 2, chirpMassKg);
  const k4 = chirpRate(frequencyHz + dt * k3, chirpMassKg);
  return frequencyHz + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
}

function plusAmplitude(frequencyHz, parameters) {
  const orientation = (1 + Math.cos(parameters.inclinationRadians) ** 2) / 2;
  return (
    orientation *
    4 *
    (G * parameters.chirpMassKg) ** (5 / 3) *
    (Math.PI * frequencyHz) ** (2 / 3) /
    (C ** 4 * parameters.distanceMetres)
  );
}

function computeSpectrogram(signal, sampleRateHz, durationSeconds) {
  const fftSize = 512;
  const hopSize = 64;
  const frameCount = Math.max(1, Math.ceil(Math.max(0, signal.length - fftSize) / hopSize) + 1);
  const upperFrequencyHz = 512;
  const powers = new Float32Array(frameCount * SPECTROGRAM_HEIGHT);
  let maximumPower = -Infinity;
  let minimumPower = Infinity;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const real = new Float64Array(fftSize);
    const imaginary = new Float64Array(fftSize);
    const startIndex = frame * hopSize;
    for (let offset = 0; offset < fftSize; offset += 1) {
      const sourceIndex = startIndex + offset;
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * offset / (fftSize - 1));
      real[offset] = sourceIndex < signal.length ? signal[sourceIndex] * window : 0;
    }
    fftInPlace(real, imaginary, false);
    for (let row = 0; row < SPECTROGRAM_HEIGHT; row += 1) {
      const frequency = upperFrequencyHz * (SPECTROGRAM_HEIGHT - 1 - row) / (SPECTROGRAM_HEIGHT - 1);
      const bin = Math.min(fftSize / 2, Math.round(frequency * fftSize / sampleRateHz));
      const power = Math.log10(real[bin] * real[bin] + imaginary[bin] * imaginary[bin] + 1e-60);
      powers[row * frameCount + frame] = power;
      maximumPower = Math.max(maximumPower, power);
      minimumPower = Math.min(minimumPower, power);
    }
  }
  const floorPower = Math.max(minimumPower, maximumPower - 6);
  const rgba = new Uint8ClampedArray(frameCount * SPECTROGRAM_HEIGHT * 4);
  for (let index = 0; index < powers.length; index += 1) {
    const normalised = clamp((powers[index] - floorPower) / (maximumPower - floorPower || 1), 0, 1);
    colourMap(normalised, rgba, index * 4);
  }
  return { width: frameCount, height: SPECTROGRAM_HEIGHT, rgba, fftSize, hopSize, upperFrequencyHz, durationSeconds };
}

function fftInPlace(real, imaginary, inverse) {
  const length = real.length;
  let reversed = 0;
  for (let index = 1; index < length; index += 1) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  const sign = inverse ? 1 : -1;
  for (let block = 2; block <= length; block <<= 1) {
    const angle = sign * 2 * Math.PI / block;
    const rotationReal = Math.cos(angle);
    const rotationImaginary = Math.sin(angle);
    for (let start = 0; start < length; start += block) {
      let unitReal = 1;
      let unitImaginary = 0;
      for (let offset = 0; offset < block / 2; offset += 1) {
        const even = start + offset;
        const odd = even + block / 2;
        const termReal = unitReal * real[odd] - unitImaginary * imaginary[odd];
        const termImaginary = unitReal * imaginary[odd] + unitImaginary * real[odd];
        real[odd] = real[even] - termReal;
        imaginary[odd] = imaginary[even] - termImaginary;
        real[even] += termReal;
        imaginary[even] += termImaginary;
        const nextReal = unitReal * rotationReal - unitImaginary * rotationImaginary;
        unitImaginary = unitReal * rotationImaginary + unitImaginary * rotationReal;
        unitReal = nextReal;
      }
    }
  }
  if (inverse) {
    for (let index = 0; index < length; index += 1) {
      real[index] /= length;
      imaginary[index] /= length;
    }
  }
}

function decimateObserved(observed) {
  const length = Math.min(DISPLAY_SAMPLES, observed.conditioned.length);
  const times = new Float64Array(length);
  const strain = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const sourceIndex = Math.round(index * (observed.conditioned.length - 1) / Math.max(1, length - 1));
    times[index] = observed.relativeTimes[sourceIndex];
    strain[index] = observed.conditioned[sourceIndex];
  }
  return { times, strain };
}

function decimateModel(model) {
  const length = Math.min(DISPLAY_SAMPLES, model.strain.length);
  const times = new Float64Array(length);
  const strain = new Float64Array(length);
  const frequencyHz = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const sourceIndex = Math.round(index * (model.strain.length - 1) / Math.max(1, length - 1));
    times[index] = model.times[sourceIndex];
    strain[index] = model.strain[sourceIndex];
    frequencyHz[index] = model.frequencyHz[sourceIndex];
  }
  return { times, strain, frequencyHz };
}

function summarise(parameters, observed, model, spectrum, started) {
  let peakObserved = 0;
  for (const value of observed.conditioned) peakObserved = Math.max(peakObserved, Math.abs(value));
  return {
    detector: parameters.detector,
    eventGpsSeconds: EVENT_GPS_SECONDS,
    windowSeconds: parameters.windowSeconds,
    timeMinimumSeconds: observed.minimumTimeSeconds,
    timeMaximumSeconds: observed.maximumTimeSeconds,
    peakObservedStrain: peakObserved,
    observedSamples: observed.conditioned.length,
    sampleRateHz: GWOSC_SAMPLE_RATE_HZ,
    fftSize: spectrum.fftSize,
    hopSize: spectrum.hopSize,
    spectrogramUpperFrequencyHz: spectrum.upperFrequencyHz,
    conditioning: `${BANDPASS_LOW_HZ}-${BANDPASS_HIGH_HZ} Hz cosine-transition bandpass`,
    modelOverlay: Boolean(model),
    chirpMassSolar: parameters.chirpMassSolar,
    totalMassSolar: parameters.totalMassSolar,
    // Symmetric mass ratio eta = m1 m2 / (m1+m2)^2, the standard post-Newtonian mass
    // parameter (eta = 0.25 for equal masses, decreasing for more asymmetric binaries).
    // At GW150914's real measured masses (36+29 Msun) this is ~0.2472 -- very close to
    // equal-mass, which is why GW150914 was such a strong, easily detected signal.
    symmetricMassRatio: (parameters.mass1Solar * parameters.mass2Solar) / (parameters.totalMassSolar ** 2),
    fIscoHz: parameters.fIscoHz,
    modelFinalFrequencyHz: model ? model.frequencyHz[model.frequencyHz.length - 1] : null,
    modelTerminatedAtIsco: model ? model.terminatedAtIsco : false,
    solveMilliseconds: performance.now() - started,
  };
}

function transmitProduct(requestId) {
  const product = playback.product;
  const message = {
    type: "observation",
    requestId,
    metadata: product.metadata,
    observedTrack: {
      times: product.observedTrack.times.slice(),
      strain: product.observedTrack.strain.slice(),
    },
    modelTrack: product.modelTrack ? {
      times: product.modelTrack.times.slice(),
      strain: product.modelTrack.strain.slice(),
      frequencyHz: product.modelTrack.frequencyHz.slice(),
    } : null,
    spectrum: {
      width: product.spectrum.width,
      height: product.spectrum.height,
      rgba: product.spectrum.rgba.slice(),
      upperFrequencyHz: product.spectrum.upperFrequencyHz,
      timeMinimumSeconds: product.metadata.timeMinimumSeconds,
      timeMaximumSeconds: product.metadata.timeMaximumSeconds,
      fftSize: product.spectrum.fftSize,
      hopSize: product.spectrum.hopSize,
    },
  };
  const transfers = [
    message.observedTrack.times.buffer,
    message.observedTrack.strain.buffer,
    message.spectrum.rgba.buffer,
  ];
  if (message.modelTrack) {
    transfers.push(message.modelTrack.times.buffer, message.modelTrack.strain.buffer, message.modelTrack.frequencyHz.buffer);
  }
  self.postMessage(message, transfers);
}

function beginPlayback() {
  if (playback.timer === null) playback.timer = self.setInterval(sendCursor, 40);
}

function sendCursor() {
  const product = playback.product;
  if (!product) return;
  const now = performance.now();
  if (playback.running) {
    playback.elapsedSeconds += (now - playback.lastTick) / 1000 * product.parameters.playbackRate;
    playback.elapsedSeconds %= product.parameters.windowSeconds;
  }
  playback.lastTick = now;
  const index = Math.min(
    product.observed.conditioned.length - 1,
    Math.floor(playback.elapsedSeconds * GWOSC_SAMPLE_RATE_HZ)
  );
  self.postMessage({
    type: "cursor",
    timeSeconds: product.observed.relativeTimes[index],
    normalisedTime: index / Math.max(1, product.observed.conditioned.length - 1),
    strain: product.observed.conditioned[index],
    detector: product.parameters.detector,
    gpsSeconds: product.observed.gpsTimes[index],
  });
}

function sendCsv() {
  const product = playback.product;
  if (!product) return;
  const model = product.model;
  const header = model
    ? "relative_time_seconds,gps_time_seconds,raw_gwosc_strain,conditioned_gwosc_strain,pn_overlay_strain"
    : "relative_time_seconds,gps_time_seconds,raw_gwosc_strain,conditioned_gwosc_strain";
  const rows = [header];
  for (let index = 0; index < product.observed.conditioned.length; index += 1) {
    const time = product.observed.relativeTimes[index];
    const base = [
      time.toFixed(9),
      product.observed.gpsTimes[index].toFixed(6),
      product.observed.raw[index].toExponential(12),
      product.observed.conditioned[index].toExponential(12),
    ];
    if (model) base.push(interpolateModel(model, time).toExponential(12));
    rows.push(base.join(","));
  }
  self.postMessage({
    type: "csv",
    filename: `gwosc_GW150914_${product.parameters.detector}_conditioned_strain.csv`,
    rowCount: product.observed.conditioned.length,
    content: `${rows.join("\n")}\n`,
  });
}

function interpolateModel(model, time) {
  if (time < model.times[0] || time > model.times[model.times.length - 1]) return 0;
  const position = (time - model.times[0]) * GWOSC_SAMPLE_RATE_HZ;
  const lower = Math.floor(position);
  const upper = Math.min(model.strain.length - 1, lower + 1);
  return mix(model.strain[lower], model.strain[upper], position - lower);
}

function colourMap(value, rgba, offset) {
  const anchors = [
    [0, 8, 12, 21],
    [0.22, 21, 42, 77],
    [0.47, 26, 123, 151],
    [0.68, 50, 213, 230],
    [0.86, 255, 189, 89],
    [1, 255, 245, 214],
  ];
  let high = 1;
  while (high < anchors.length - 1 && value > anchors[high][0]) high += 1;
  const low = high - 1;
  const fraction = (value - anchors[low][0]) / (anchors[high][0] - anchors[low][0] || 1);
  rgba[offset] = Math.round(mix(anchors[low][1], anchors[high][1], fraction));
  rgba[offset + 1] = Math.round(mix(anchors[low][2], anchors[high][2], fraction));
  rgba[offset + 2] = Math.round(mix(anchors[low][3], anchors[high][3], fraction));
  rgba[offset + 3] = 255;
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result <<= 1;
  return result;
}

function mix(first, second, fraction) {
  return first + (second - first) * fraction;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function number(value, fallback) {
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : fallback;
}
