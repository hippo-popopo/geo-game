const WORLD_GEOJSON_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const STORAGE_KEY = "geo-duel-state-v1";
const MAX_SECONDS = 20;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
window.scrollTo(0, 0);
window.addEventListener("pageshow", () => setTimeout(() => window.scrollTo(0, 0), 0));
window.addEventListener("load", () => setTimeout(() => window.scrollTo(0, 0), 0));

const state = {
  players: [
    { id: crypto.randomUUID(), name: "Nina", score: 0 },
    { id: crypto.randomUUID(), name: "Leo", score: 0 }
  ],
  modes: ["flag", "capital", "name"],
  rounds: 10,
  round: 0,
  turn: 0,
  target: null,
  promptMode: "name",
  guess: null,
  answered: false,
  started: false,
  endsAt: 0,
  timerId: null,
  usedTargets: []
};

const els = {
  svg: d3.select("#worldMap"),
  mapStatus: document.querySelector("#mapStatus"),
  promptTitle: document.querySelector("#promptTitle"),
  promptHint: document.querySelector("#promptHint"),
  roundLabel: document.querySelector("#roundLabel"),
  timerLabel: document.querySelector("#timerLabel"),
  playersList: document.querySelector("#playersList"),
  playerCount: document.querySelector("#playerCount"),
  addPlayerForm: document.querySelector("#addPlayerForm"),
  playerName: document.querySelector("#playerName"),
  modeSummary: document.querySelector("#modeSummary"),
  modeInputs: document.querySelectorAll(".toggles input"),
  roundsInput: document.querySelector("#roundsInput"),
  startGame: document.querySelector("#startGame"),
  nextRound: document.querySelector("#nextRound"),
  currentTurn: document.querySelector("#currentTurn"),
  scoreboard: document.querySelector("#scoreboard"),
  distanceLabel: document.querySelector("#distanceLabel"),
  pointsLabel: document.querySelector("#pointsLabel"),
  feedback: document.querySelector("#feedback")
};

let projection = d3.geoNaturalEarth1();
let path = d3.geoPath(projection);
let countriesGroup;
let overlayGroup;
let countryFeatures = [];

restoreState();
renderPlayers();
renderSetup();
renderScoreboard();
loadMap();

window.addEventListener("resize", () => drawMap(countryFeatures));
els.addPlayerForm.addEventListener("submit", addPlayer);
els.startGame.addEventListener("click", startGame);
els.nextRound.addEventListener("click", nextRound);
els.roundsInput.addEventListener("change", () => {
  state.rounds = clamp(Number(els.roundsInput.value) || 10, 3, 30);
  els.roundsInput.value = state.rounds;
  saveState();
  renderSetup();
});
els.modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const selected = [...els.modeInputs].filter((item) => item.checked).map((item) => item.value);
    if (!selected.length) {
      input.checked = true;
      return;
    }
    state.modes = selected;
    saveState();
    renderSetup();
  });
});

async function loadMap() {
  try {
    const [topojson] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm"),
      waitForD3()
    ]);
    const response = await fetch(WORLD_GEOJSON_URL);
    const topology = await response.json();
    countryFeatures = topojson.feature(topology, topology.objects.countries).features;
    els.mapStatus.hidden = true;
    drawMap(countryFeatures);
  } catch (error) {
    els.mapStatus.textContent = "Carte indisponible hors ligne. Recharge avec internet pour afficher les frontieres.";
    drawMap([]);
  }
}

function waitForD3() {
  return window.d3 ? Promise.resolve() : new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
}

function drawMap(features) {
  const node = els.svg.node();
  const bounds = node.getBoundingClientRect();
  const width = Math.max(bounds.width, 320);
  const height = Math.max(bounds.height, 260);
  els.svg.attr("viewBox", `0 0 ${width} ${height}`);
  projection.fitExtent([[18, 18], [width - 18, height - 18]], { type: "Sphere" });
  path = d3.geoPath(projection);
  els.svg.selectAll("*").remove();

  els.svg.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", path);
  els.svg.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", path);
  countriesGroup = els.svg.append("g").attr("class", "countries");
  overlayGroup = els.svg.append("g").attr("class", "overlays");

  countriesGroup
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("class", "country")
    .attr("d", path);

  els.svg.on("click", (event) => {
    if (!state.started || state.answered || !state.target) return;
    const [x, y] = d3.pointer(event, els.svg.node());
    const lonLat = projection.invert([x, y]);
    if (!lonLat) return;
    placeGuess(lonLat);
  });

  redrawOverlay();
}

function addPlayer(event) {
  event.preventDefault();
  const name = els.playerName.value.trim();
  if (!name) return;
  state.players.push({ id: crypto.randomUUID(), name, score: 0 });
  els.playerName.value = "";
  saveState();
  renderPlayers();
  renderScoreboard();
}

function startGame() {
  window.scrollTo(0, 0);
  state.players.forEach((player) => {
    player.score = 0;
  });
  state.round = 0;
  state.turn = 0;
  state.usedTargets = [];
  state.started = true;
  els.startGame.textContent = "Recommencer";
  nextRound();
}

function nextRound() {
  if (!state.started) return;
  if (state.answered) {
    state.turn = (state.turn + 1) % state.players.length;
  }
  if (state.round >= state.rounds && state.turn === 0 && state.answered) {
    finishGame();
    return;
  }
  if (!state.answered || state.turn === 0) {
    state.round += 1;
  }
  if (state.round > state.rounds) {
    finishGame();
    return;
  }

  const pool = countries.filter((country) => !state.usedTargets.includes(country.name));
  state.target = sample(pool.length ? pool : countries);
  state.usedTargets.push(state.target.name);
  state.promptMode = sample(state.modes);
  state.guess = null;
  state.answered = false;
  state.endsAt = Date.now() + MAX_SECONDS * 1000;
  els.nextRound.disabled = true;
  els.distanceLabel.textContent = "-";
  els.pointsLabel.textContent = "-";
  els.feedback.textContent = "Clique sur la carte pour placer ton marqueur.";
  renderPrompt();
  renderSetup();
  renderScoreboard();
  redrawOverlay();
  tickTimer();
}

function placeGuess([lon, lat]) {
  const secondsLeft = Math.max(0, (state.endsAt - Date.now()) / 1000);
  const distance = haversineKm(lat, lon, state.target.lat, state.target.lon);
  const precision = Math.max(0, 1000 - distance);
  const speedBonus = Math.round(secondsLeft * 18);
  const points = Math.round(precision + speedBonus);
  state.guess = { lon, lat, distance, points };
  state.answered = true;
  state.players[state.turn].score += points;
  els.nextRound.disabled = false;
  els.distanceLabel.textContent = `${Math.round(distance)} km`;
  els.pointsLabel.textContent = `+${points}`;
  els.feedback.textContent = `${state.target.name} etait la bonne reponse. ${scoreMessage(distance)}`;
  renderScoreboard();
  redrawOverlay();
}

function tickTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    const remaining = Math.max(0, (state.endsAt - Date.now()) / 1000);
    els.timerLabel.textContent = `${remaining.toFixed(1)}s`;
    if (remaining <= 0 && !state.answered) {
      clearInterval(state.timerId);
      state.guess = null;
      state.answered = true;
      els.nextRound.disabled = false;
      els.distanceLabel.textContent = "Temps ecoule";
      els.pointsLabel.textContent = "+0";
      els.feedback.textContent = `${state.target.name} etait la bonne reponse. Trop tard, mais on repart.`;
      redrawOverlay();
    }
  }, 100);
}

function finishGame() {
  clearInterval(state.timerId);
  const winner = [...state.players].sort((a, b) => b.score - a.score)[0];
  state.started = false;
  state.target = null;
  state.answered = false;
  els.promptTitle.textContent = `${winner.name} gagne`;
  els.promptHint.textContent = `Score final : ${winner.score} points. Lance une revanche quand tu veux.`;
  els.feedback.textContent = "Partie terminee.";
  els.startGame.textContent = "Revanche";
  els.nextRound.disabled = true;
  renderSetup();
  renderScoreboard();
  redrawOverlay();
}

function renderPrompt() {
  const label = {
    flag: state.target.flag,
    capital: state.target.capital,
    name: state.target.name
  }[state.promptMode];
  const intro = {
    flag: "Place le pays de ce drapeau",
    capital: "Place le pays dont la capitale est",
    name: "Place ce pays"
  }[state.promptMode];
  els.promptTitle.textContent = label;
  els.promptHint.textContent = intro;
}

function renderPlayers() {
  els.playersList.innerHTML = "";
  state.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `<span>${escapeHtml(player.name)}</span><button type="button" title="Retirer">×</button>`;
    row.querySelector("button").addEventListener("click", () => {
      if (state.players.length <= 1) return;
      state.players.splice(index, 1);
      state.turn = Math.min(state.turn, state.players.length - 1);
      saveState();
      renderPlayers();
      renderScoreboard();
      renderSetup();
    });
    els.playersList.appendChild(row);
  });
  els.playerCount.textContent = state.players.length;
}

function renderSetup() {
  els.roundLabel.textContent = state.started ? `Round ${state.round}/${state.rounds}` : `${state.rounds} rounds`;
  els.currentTurn.textContent = `Tour de ${state.players[state.turn]?.name || "joueur"}`;
  els.modeSummary.textContent = state.modes.length === 3 ? "Mix" : state.modes.join(" + ");
  els.roundsInput.value = state.rounds;
  els.modeInputs.forEach((input) => {
    input.checked = state.modes.includes(input.value);
  });
  saveState();
}

function renderScoreboard() {
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  els.scoreboard.innerHTML = ranking
    .map((player, index) => `<li><span>${index + 1}. ${escapeHtml(player.name)}</span><strong>${player.score}</strong></li>`)
    .join("");
}

function redrawOverlay() {
  if (!overlayGroup) return;
  overlayGroup.selectAll("*").remove();
  if (!state.target) return;
  const targetPoint = projection([state.target.lon, state.target.lat]);
  if (!targetPoint) return;

  if (state.answered) {
    overlayGroup
      .append("circle")
      .attr("class", "target-pulse")
      .attr("cx", targetPoint[0])
      .attr("cy", targetPoint[1])
      .attr("r", 13);
    overlayGroup
      .append("text")
      .attr("class", "target-label")
      .attr("x", targetPoint[0] + 16)
      .attr("y", targetPoint[1] - 12)
      .text(state.target.name);
  }

  if (!state.guess) return;
  const guessPoint = projection([state.guess.lon, state.guess.lat]);
  if (!guessPoint) return;
  overlayGroup
    .append("line")
    .attr("class", "distance-line")
    .attr("x1", guessPoint[0])
    .attr("y1", guessPoint[1])
    .attr("x2", targetPoint[0])
    .attr("y2", targetPoint[1]);
  overlayGroup.append("circle").attr("class", "guess-dot").attr("cx", guessPoint[0]).attr("cy", guessPoint[1]).attr("r", 7);
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    state.players = saved.players?.length ? saved.players : state.players;
    state.modes = saved.modes?.length ? saved.modes : state.modes;
    state.rounds = saved.rounds || state.rounds;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    players: state.players,
    modes: state.modes,
    rounds: state.rounds
  }));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earth = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreMessage(distance) {
  if (distance < 100) return "Precision chirurgicale.";
  if (distance < 350) return "Tres propre.";
  if (distance < 900) return "Solide.";
  return "Il y avait de l'idee.";
}

function sample(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

const countries = window.GEO_DUEL_COUNTRIES;
