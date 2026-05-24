const ids = ["m1", "m2", "distance", "duration", "f0"];
const inputs = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const labels = {
  m1: document.getElementById("m1Out"),
  m2: document.getElementById("m2Out"),
  distance: document.getElementById("distanceOut"),
  duration: document.getElementById("durationOut"),
  f0: document.getElementById("f0Out"),
  chirpMass: document.getElementById("chirpMass"),
  iscoFrequency: document.getElementById("iscoFrequency"),
  strain: document.getElementById("strain"),
};

function v(id) { return Number(inputs[id].value); }

function chirpMass(m1, m2) {
  return (m1 * m2) ** (3 / 5) / (m1 + m2) ** (1 / 5);
}

function iscoFrequency(totalMass) {
  return 4400 / totalMass;
}

function canvasSetup(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = width * Number(canvas.height) / Number(canvas.width);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function drawAxes(ctx, width, height, yLabel) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f1217";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  for (let i = 1; i < 5; i += 1) {
    const y = (height * i) / 5;
    ctx.beginPath();
    ctx.moveTo(48, y);
    ctx.lineTo(width - 14, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#aab2bf";
  ctx.font = "12px system-ui";
  ctx.fillText(yLabel, 10, 20);
}

function model() {
  const m1 = v("m1");
  const m2 = v("m2");
  const distance = v("distance");
  const duration = v("duration");
  const f0 = v("f0");
  const mc = chirpMass(m1, m2);
  const fisco = iscoFrequency(m1 + m2);
  const relativeStrain = (mc / 26.1) ** (5 / 3) * (410 / distance);
  const samples = 900;
  const wave = [];
  let phase = 0;
  let freq = f0;
  const solarMassTime = 4.92549095e-6;
  const mcSeconds = mc * solarMassTime;
  const dt = duration / samples;

  for (let i = 0; i < samples; i += 1) {
    const x = i / (samples - 1);
    const time = -duration + x * duration;
    const dfdt = (96 / 5) * Math.PI ** (8 / 3) * mcSeconds ** (5 / 3) * freq ** (11 / 3);
    freq = Math.min(fisco, freq + dfdt * dt);
    phase += 2 * Math.PI * freq * dt;
    const envelope = relativeStrain * (freq / 120) ** (2 / 3);
    wave.push({ x: time, y: envelope * Math.sin(phase), f: freq });
  }

  return { m1, m2, distance, duration, f0, mc, fisco, relativeStrain, wave };
}

function plotWave(data) {
  const canvas = document.getElementById("waveCanvas");
  const { ctx, width, height } = canvasSetup(canvas);
  drawAxes(ctx, width, height, "strain");
  const maxY = Math.max(...data.wave.map((p) => Math.abs(p.y))) || 1;
  ctx.strokeStyle = "#66d9ef";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.wave.forEach((p, i) => {
    const x = 48 + (i / (data.wave.length - 1)) * (width - 62);
    const y = height / 2 - (p.y / maxY) * (height * 0.38);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function plotFrequency(data) {
  const canvas = document.getElementById("freqCanvas");
  const { ctx, width, height } = canvasSetup(canvas);
  drawAxes(ctx, width, height, "frequency");
  ctx.strokeStyle = "#f6c65b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  data.wave.forEach((p, i) => {
    const x = 48 + (i / (data.wave.length - 1)) * (width - 62);
    const y = height - 38 - (p.f / data.fisco) * (height - 62);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function render() {
  const data = model();
  labels.m1.textContent = `${data.m1} Msun`;
  labels.m2.textContent = `${data.m2} Msun`;
  labels.distance.textContent = `${data.distance} Mpc`;
  labels.duration.textContent = `${data.duration.toFixed(1)} s`;
  labels.f0.textContent = `${data.f0} Hz`;
  labels.chirpMass.textContent = `${data.mc.toFixed(1)} Msun`;
  labels.iscoFrequency.textContent = `${data.fisco.toFixed(0)} Hz`;
  labels.strain.textContent = data.relativeStrain.toFixed(2);
  plotWave(data);
  plotFrequency(data);
}

ids.forEach((id) => inputs[id].addEventListener("input", render));
window.addEventListener("resize", render);
render();
