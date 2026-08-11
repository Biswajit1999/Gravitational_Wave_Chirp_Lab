(() => {
  "use strict";

  const defaults = {
    detector: "H1",
    window: 2,
    modelOverlay: false,
    mass1: 36,
    mass2: 29,
    distance: 410,
    inclination: 30,
    startFrequency: 20,
    playbackRate: 1,
  };
  const controls = Object.fromEntries(
    Object.keys(defaults).map((key) => [key, document.getElementById(key)])
  );
  const labels = Object.fromEntries(
    Object.keys(defaults).map((key) => [key, document.getElementById(`${key}-value`)])
  );
  const output = {
    engineLight: document.getElementById("engine-light"),
    engineState: document.getElementById("engine-state"),
    utc: document.getElementById("utc"),
    fps: document.getElementById("fps"),
    cursorTime: document.getElementById("cursor-time"),
    dataset: document.getElementById("chirp-mass"),
    product: document.getElementById("total-mass"),
    filter: document.getElementById("isco"),
    peakStrain: document.getElementById("peak-strain"),
    gps: document.getElementById("final-frequency"),
    modelStatus: document.getElementById("termination"),
    solveTime: document.getElementById("solve-time"),
    samples: document.getElementById("samples"),
    sampleCursor: document.getElementById("sample-cursor"),
    spectrogramMeta: document.getElementById("spectrogram-meta"),
    liveTime: document.getElementById("live-time"),
    liveDetector: document.getElementById("live-frequency"),
    liveStrain: document.getElementById("live-strain"),
    liveGps: document.getElementById("live-dfdt"),
    events: document.getElementById("events"),
    status: document.getElementById("status"),
  };
  const buttons = {
    play: document.getElementById("play"),
    export: document.getElementById("export"),
    reset: document.getElementById("reset"),
  };

  class Surface {
    constructor(id) {
      this.canvas = document.getElementById(id);
      this.ctx = this.canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.width = 0;
      this.height = 0;
      this.ratio = 0;
    }

    begin() {
      const bounds = this.canvas.getBoundingClientRect();
      const width = Math.max(20, Math.round(bounds.width));
      const height = Math.max(20, Math.round(bounds.height));
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (width !== this.width || height !== this.height || ratio !== this.ratio) {
        this.width = width;
        this.height = height;
        this.ratio = ratio;
        this.canvas.width = Math.round(width * ratio);
        this.canvas.height = Math.round(height * ratio);
      }
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.ctx.fillStyle = "#171a21";
      this.ctx.fillRect(0, 0, width, height);
      return { ctx: this.ctx, width, height };
    }
  }

  const surfaces = {
    waveform: new Surface("waveform"),
    spectrogram: new Surface("spectrogram"),
    frequency: new Surface("frequency"),
  };
  const state = {
    worker: null,
    requestId: 0,
    result: null,
    spectrumCanvas: null,
    cursor: null,
    running: true,
    timeout: 0,
    frameCount: 0,
    frameStart: performance.now(),
    messages: [],
  };

  function value(key) {
    if (controls[key].type === "checkbox") return controls[key].checked;
    if (controls[key].type === "select-one") return controls[key].value;
    return Number(controls[key].value);
  }

  function parameters() {
    return {
      detector: value("detector"),
      windowSeconds: value("window"),
      modelOverlay: value("modelOverlay"),
      mass1Solar: value("mass1"),
      mass2Solar: value("mass2"),
      distanceMpc: value("distance"),
      inclinationDegrees: value("inclination"),
      startFrequencyHz: value("startFrequency"),
      playbackRate: value("playbackRate"),
    };
  }

  function updateLabels() {
    labels.detector.textContent = value("detector");
    labels.window.textContent = `${value("window").toFixed(1)} s`;
    labels.modelOverlay.textContent = value("modelOverlay") ? "ON" : "OFF";
    labels.mass1.textContent = `${value("mass1").toFixed(1)} Msun`;
    labels.mass2.textContent = `${value("mass2").toFixed(1)} Msun`;
    labels.distance.textContent = `${value("distance").toFixed(0)} Mpc`;
    labels.inclination.textContent = `${value("inclination").toFixed(0)} deg`;
    labels.startFrequency.textContent = `${value("startFrequency").toFixed(1)} Hz`;
    labels.playbackRate.textContent = `${value("playbackRate").toFixed(2)} x`;
    document.querySelectorAll(".model-parameters").forEach((section) => {
      section.classList.toggle("active", value("modelOverlay"));
    });
  }

  function log(message) {
    const timestamp = new Date().toISOString().slice(11, 19);
    state.messages.unshift(`${timestamp}  ${message}`);
    state.messages.length = Math.min(7, state.messages.length);
    output.events.replaceChildren(...state.messages.map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }));
  }

  function engine(text, className, status) {
    output.engineState.textContent = text;
    output.engineLight.className = className;
    output.status.textContent = status;
  }

  function requestObservation(immediate = false) {
    updateLabels();
    if (!state.worker) return;
    clearTimeout(state.timeout);
    const request = () => {
      state.requestId += 1;
      engine("LOADING", "busy", "RETRIEVING GWOSC CALIBRATED STRAIN");
      state.worker.postMessage({
        type: "analyse",
        requestId: state.requestId,
        parameters: parameters(),
      });
    };
    if (immediate) request();
    else state.timeout = window.setTimeout(request, 45);
  }

  function handleWorker(event) {
    const message = event.data;
    if (message.type === "observation" && message.requestId === state.requestId) {
      state.result = message;
      state.spectrumCanvas = spectrumImage(message.spectrum);
      writeMetadata(message.metadata);
      engine("ONLINE", "online", message.modelTrack ? "GWOSC DATA + PN COMPARISON CURRENT" : "GWOSC OBSERVATION CURRENT");
      log(`Loaded GWOSC ${message.metadata.detector} / ${message.metadata.observedSamples} samples`);
    } else if (message.type === "loading" && message.requestId === state.requestId) {
      log(message.message);
    } else if (message.type === "dataError" && message.requestId === state.requestId) {
      engine("FAILED", "failed", "GWOSC DATA LOAD FAILED");
      log(message.message);
    } else if (message.type === "cursor") {
      state.cursor = message;
      output.cursorTime.textContent = `${message.timeSeconds.toFixed(4)} s`;
      output.liveTime.textContent = `${message.timeSeconds.toFixed(6)} s`;
      output.liveDetector.textContent = message.detector;
      output.liveStrain.textContent = message.strain.toExponential(5);
      output.liveGps.textContent = message.gpsSeconds.toFixed(6);
      output.sampleCursor.textContent =
        `t ${message.timeSeconds.toFixed(4)} s / h ${message.strain.toExponential(3)}`;
    } else if (message.type === "csv") {
      const link = document.createElement("a");
      const url = URL.createObjectURL(new Blob([message.content], { type: "text/csv;charset=utf-8" }));
      link.href = url;
      link.download = message.filename;
      link.click();
      URL.revokeObjectURL(url);
      log(`Exported ${message.rowCount} measured strain samples`);
    }
  }

  function writeMetadata(data) {
    output.dataset.textContent = `GW150914 / ${data.detector}`;
    output.product.textContent = "GWOSC V3 / 4 KHZ";
    output.filter.textContent = "35-350 Hz";
    output.peakStrain.textContent = data.peakObservedStrain.toExponential(4);
    output.gps.textContent = data.eventGpsSeconds.toFixed(3);
    output.modelStatus.textContent = data.modelOverlay
      ? `PN Mc ${data.chirpMassSolar.toFixed(3)} MSUN / ISCO ${data.fIscoHz.toFixed(1)} HZ`
      : "PN COMPARISON OFF";
    output.solveTime.textContent = `${data.solveMilliseconds.toFixed(2)} ms`;
    output.samples.textContent = `${data.observedSamples} SAMPLES @ ${data.sampleRateHz} HZ`;
    output.spectrogramMeta.textContent =
      `FFT ${data.fftSize} / HOP ${data.hopSize} / 0-${data.spectrogramUpperFrequencyHz.toFixed(0)} HZ`;
  }

  function spectrumImage(spectrum) {
    const canvas = document.createElement("canvas");
    canvas.width = spectrum.width;
    canvas.height = spectrum.height;
    canvas.getContext("2d").putImageData(
      new ImageData(spectrum.rgba, spectrum.width, spectrum.height),
      0,
      0
    );
    return canvas;
  }

  function frame(ctx, width, height, xLabel, yLabel, xTicks = 5, yTicks = 4) {
    const box = { left: 66, right: 18, top: 14, bottom: 39 };
    box.w = width - box.left - box.right;
    box.h = height - box.top - box.bottom;
    ctx.strokeStyle = "rgba(81,109,143,.23)";
    ctx.lineWidth = 1;
    for (let tick = 0; tick <= xTicks; tick += 1) {
      const x = box.left + box.w * tick / xTicks;
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.top + box.h);
      ctx.stroke();
    }
    for (let tick = 0; tick <= yTicks; tick += 1) {
      const y = box.top + box.h * tick / yTicks;
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(box.left + box.w, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#8b93a3";
    ctx.font = '10px "Roboto Mono", Consolas, monospace';
    ctx.fillText(yLabel, 9, box.top + 7);
    ctx.textAlign = "right";
    ctx.fillText(xLabel, width - box.right, height - 8);
    ctx.textAlign = "left";
    return box;
  }

  function ticks(ctx, box, xMinimum, xMaximum, yMinimum, yMaximum, xFormatter, yFormatter) {
    ctx.fillStyle = "#8b93a3";
    ctx.font = '10px "Roboto Mono", Consolas, monospace';
    for (let tick = 0; tick <= 5; tick += 1) {
      const ratio = tick / 5;
      const x = box.left + box.w * ratio;
      const value = xMinimum + ratio * (xMaximum - xMinimum);
      ctx.textAlign = tick === 0 ? "left" : tick === 5 ? "right" : "center";
      ctx.fillText(xFormatter(value), x, box.top + box.h + 18);
    }
    ctx.textAlign = "right";
    for (let tick = 0; tick <= 4; tick += 1) {
      const ratio = tick / 4;
      ctx.fillText(yFormatter(yMaximum - ratio * (yMaximum - yMinimum)), box.left - 8, box.top + box.h * ratio + 3);
    }
    ctx.textAlign = "left";
  }

  function xPosition(time, box, metadata) {
    return box.left + (time - metadata.timeMinimumSeconds) /
      (metadata.timeMaximumSeconds - metadata.timeMinimumSeconds) * box.w;
  }

  function drawWaveform() {
    const { ctx, width, height } = surfaces.waveform.begin();
    if (!state.result) {
      waiting(ctx, width, height);
      return;
    }
    const observed = state.result.observedTrack;
    const model = state.result.modelTrack;
    const metadata = state.result.metadata;
    let maximum = metadata.peakObservedStrain || 1;
    if (model) {
      for (const value of model.strain) maximum = Math.max(maximum, Math.abs(value));
    }
    const box = frame(ctx, width, height, "TIME FROM EVENT (s)", "h");
    ticks(ctx, box, metadata.timeMinimumSeconds, metadata.timeMaximumSeconds, -maximum, maximum, (v) => v.toFixed(2), strainTick);
    ctx.strokeStyle = "rgba(222,235,243,.35)";
    ctx.beginPath();
    ctx.moveTo(box.left, box.top + box.h / 2);
    ctx.lineTo(box.left + box.w, box.top + box.h / 2);
    ctx.stroke();
    ctx.strokeStyle = "#6f8fd6";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let index = 0; index < observed.times.length; index += 1) {
      const x = xPosition(observed.times[index], box, metadata);
      const y = box.top + (maximum - observed.strain[index]) / (2 * maximum) * box.h;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#6f8fd6";
    ctx.fillText("GWOSC CONDITIONED", box.left + 8, box.top + 13);
    if (model) {
      ctx.strokeStyle = "#f2b866";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let index = 0; index < model.times.length; index += 1) {
        const x = xPosition(model.times[index], box, metadata);
        const y = box.top + (maximum - model.strain[index]) / (2 * maximum) * box.h;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "#f2b866";
      ctx.fillText("PN OVERLAY", box.left + 126, box.top + 13);
    }
    cursorLine(ctx, box, metadata);
  }

  function drawSpectrogram() {
    const { ctx, width, height } = surfaces.spectrogram.begin();
    if (!state.result || !state.spectrumCanvas) {
      waiting(ctx, width, height);
      return;
    }
    const spectrum = state.result.spectrum;
    const box = frame(ctx, width, height, "TIME FROM EVENT (s)", "Hz");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.spectrumCanvas, box.left, box.top, box.w, box.h);
    ctx.imageSmoothingEnabled = true;
    ticks(
      ctx,
      box,
      spectrum.timeMinimumSeconds,
      spectrum.timeMaximumSeconds,
      0,
      spectrum.upperFrequencyHz,
      (v) => v.toFixed(2),
      (v) => v.toFixed(0)
    );
    cursorLine(ctx, box, state.result.metadata);
  }

  function drawFrequency() {
    const { ctx, width, height } = surfaces.frequency.begin();
    if (!state.result || !state.result.modelTrack) {
      waiting(ctx, width, height, "ENABLE PN COMPARISON");
      return;
    }
    const track = state.result.modelTrack;
    const metadata = state.result.metadata;
    const yMaximum = metadata.fIscoHz * 1.05;
    const box = frame(ctx, width, height, "TIME FROM EVENT (s)", "Hz");
    ticks(ctx, box, metadata.timeMinimumSeconds, metadata.timeMaximumSeconds, 0, yMaximum, (v) => v.toFixed(1), (v) => v.toFixed(0));
    ctx.strokeStyle = "#f2b866";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let index = 0; index < track.times.length; index += 1) {
      const x = xPosition(track.times[index], box, metadata);
      const y = box.top + (1 - track.frequencyHz[index] / yMaximum) * box.h;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    cursorLine(ctx, box, metadata);
  }

  function cursorLine(ctx, box, metadata) {
    if (!state.cursor) return;
    const x = xPosition(state.cursor.timeSeconds, box, metadata);
    ctx.strokeStyle = "#6fcf97";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.top + box.h);
    ctx.stroke();
  }

  function strainTick(number) {
    return number.toExponential(1);
  }

  function waiting(ctx, width, height, message = "AWAITING GWOSC PRODUCT") {
    ctx.fillStyle = "#8b93a3";
    ctx.font = '12px "Roboto Mono", Consolas, monospace';
    ctx.textAlign = "center";
    ctx.fillText(message, width / 2, height / 2);
    ctx.textAlign = "left";
  }

  function animate(timestamp) {
    state.frameCount += 1;
    if (timestamp - state.frameStart >= 1000) {
      output.fps.textContent = `${(state.frameCount * 1000 / (timestamp - state.frameStart)).toFixed(0)} FPS`;
      state.frameCount = 0;
      state.frameStart = timestamp;
    }
    drawWaveform();
    drawSpectrogram();
    drawFrequency();
    requestAnimationFrame(animate);
  }

  function initialise() {
    updateLabels();
    output.utc.textContent = new Date().toISOString().slice(11, 19);
    setInterval(() => {
      output.utc.textContent = new Date().toISOString().slice(11, 19);
    }, 1000);
    try {
      state.worker = new Worker("assets/js/physicsWorker.js");
      state.worker.addEventListener("message", handleWorker);
      state.worker.addEventListener("error", (error) => {
        engine("FAILED", "failed", "WORKER ERROR");
        log(error.message || "Worker failure");
      });
      state.worker.postMessage({ type: "setPlayback", running: true });
      requestObservation(true);
    } catch (error) {
      engine("FAILED", "failed", "SERVE OVER HTTP TO START WORKER");
      log(error.message);
    }
    requestAnimationFrame(animate);
  }

  Object.values(controls).forEach((control) => {
    control.addEventListener("input", () => requestObservation(false));
    control.addEventListener("change", () => requestObservation(true));
  });
  buttons.play.addEventListener("click", () => {
    state.running = !state.running;
    buttons.play.textContent = state.running ? "PAUSE" : "RESUME";
    buttons.play.classList.toggle("active", state.running);
    state.worker?.postMessage({ type: "setPlayback", running: state.running });
    log(state.running ? "Observed playback resumed" : "Observed playback paused");
  });
  buttons.export.addEventListener("click", () => state.worker?.postMessage({ type: "exportCsv" }));
  buttons.reset.addEventListener("click", () => {
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (controls[key].type === "checkbox") controls[key].checked = defaultValue;
      else controls[key].value = String(defaultValue);
    }
    requestObservation(true);
    log("GWOSC observation view restored");
  });
  initialise();
})();
