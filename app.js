const WORLD_GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const STORAGE_KEY = "geo-duel-state-v4";
const MAX_SECONDS = 20;
const BASE_POINTS = 100;
const SPEED_MULTIPLIER = 10;
const ROUND_REVEAL_MS = 1400;

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const countries = window.GEO_DUEL_COUNTRIES;
const onlinePlayerId = sessionStorage.getItem("geoDuelPlayer") || crypto.randomUUID();
sessionStorage.setItem("geoDuelPlayer", onlinePlayerId);

const state = {
  screen: "setup",
  players: [{ id: onlinePlayerId, name: "Nina", score: 0 }],
  modes: ["flag", "capital", "name"],
  rounds: 10,
  round: 0,
  turn: 0,
  target: null,
  promptMode: "name",
  selectedCountry: null,
  answered: false,
  roundComplete: false,
  started: false,
  endsAt: 0,
  usedTargets: [],
  answers: {},
  lastPoints: 0,
  roomId: null,
  online: false,
  timerId: null
};

const els = {
  setupScreen: document.querySelector("#setupScreen"),
  roomScreen: document.querySelector("#roomScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  resultScreen: document.querySelector("#resultScreen"),
  svg: d3.select("#worldMap"),
  mapStatus: document.querySelector("#mapStatus"),
  promptTitle: document.querySelector("#promptTitle"),
  promptHint: document.querySelector("#promptHint"),
  roundLabel: document.querySelector("#roundLabel"),
  timerLabel: document.querySelector("#timerLabel"),
  playerName: document.querySelector("#playerName"),
  createRoom: document.querySelector("#createRoom"),
  joinRoomForm: document.querySelector("#joinRoomForm"),
  roomCode: document.querySelector("#roomCode"),
  onlineStatus: document.querySelector("#onlineStatus"),
  roomHelp: document.querySelector("#roomHelp"),
  roomCodeDisplay: document.querySelector("#roomCodeDisplay"),
  roomPlayerCount: document.querySelector("#roomPlayerCount"),
  roomPlayersList: document.querySelector("#roomPlayersList"),
  roomHostBadge: document.querySelector("#roomHostBadge"),
  copyRoomCode: document.querySelector("#copyRoomCode"),
  roomLobbyMessage: document.querySelector("#roomLobbyMessage"),
  leaveRoom: document.querySelector("#leaveRoom"),
  launchRoomGame: document.querySelector("#launchRoomGame"),
  modeSummary: document.querySelector("#modeSummary"),
  modeInputs: document.querySelectorAll(".toggles input"),
  roundsInput: document.querySelector("#roundsInput"),
  startGame: document.querySelector("#startGame"),
  gameMenu: document.querySelector("#gameMenu"),
  backToSetup: document.querySelector("#backToSetup"),
  rematchGame: document.querySelector("#rematchGame"),
  currentTurn: document.querySelector("#currentTurn"),
  scoreboard: document.querySelector("#scoreboard"),
  finalScoreboard: document.querySelector("#finalScoreboard"),
  pointsLabel: document.querySelector("#pointsLabel"),
  feedback: document.querySelector("#feedback"),
  winnerTitle: document.querySelector("#winnerTitle"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomReset: document.querySelector("#zoomReset")
};

let projection = d3.geoNaturalEarth1();
let path = d3.geoPath(projection);
let countryFeatures = [];
let countryLayer = null;
let overlayLayer = null;
let zoomLayer = null;
let zoomBehavior = null;
let roomPollTimer = null;
let hostAdvanceTimer = null;
let roomData = null;
let isHost = false;
let renderedScreen = null;

restoreState();
bindEvents();
renderAll();
loadMap();
autoJoinRoomFromUrl();

function bindEvents() {
  window.addEventListener("resize", () => drawMap(countryFeatures));
  els.createRoom.addEventListener("click", createOnlineRoom);
  els.joinRoomForm.addEventListener("submit", joinOnlineRoom);
  els.copyRoomCode.addEventListener("click", copyRoomCode);
  els.leaveRoom.addEventListener("click", returnToSetup);
  els.launchRoomGame.addEventListener("click", startGame);
  els.startGame.addEventListener("click", startGame);
  els.gameMenu.addEventListener("click", returnToSetup);
  els.rematchGame.addEventListener("click", startGame);
  els.backToSetup.addEventListener("click", returnToSetup);
  els.zoomIn?.addEventListener("click", () => zoomMap(1.35));
  els.zoomOut?.addEventListener("click", () => zoomMap(0.75));
  els.zoomReset?.addEventListener("click", resetMapZoom);
  els.roundsInput.addEventListener("change", () => {
    state.rounds = clamp(Number(els.roundsInput.value) || 10, 3, 30);
    renderAll();
  });
  els.modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const selected = [...els.modeInputs].filter((item) => item.checked).map((item) => item.value);
      if (!selected.length) {
        input.checked = true;
        return;
      }
      state.modes = selected;
      renderAll();
    });
  });
}

async function loadMap() {
  try {
    const response = await fetch(WORLD_GEOJSON_URL);
    const geojson = await response.json();
    countryFeatures = geojson.features;
    els.mapStatus.hidden = true;
    drawMap(countryFeatures);
  } catch {
    els.mapStatus.textContent = "Carte indisponible hors ligne. Recharge avec internet.";
    drawMap([]);
  }
}

function drawMap(features) {
  const node = els.svg.node();
  const bounds = node.getBoundingClientRect();
  const width = Math.max(bounds.width, 320);
  const height = Math.max(bounds.height, 260);
  els.svg.attr("viewBox", `0 0 ${width} ${height}`);
  projection.fitExtent([[12, 14], [width - 12, height - 14]], { type: "Sphere" });
  path = d3.geoPath(projection);
  els.svg.selectAll("*").remove();

  zoomLayer = els.svg.append("g").attr("class", "map-zoom-layer");
  zoomLayer.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", path);
  zoomLayer.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", path);
  countryLayer = zoomLayer.append("g").attr("class", "countries");
  overlayLayer = zoomLayer.append("g").attr("class", "overlays");

  countryLayer
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("data-country", (feature) => getFeatureName(feature))
    .attr("d", path)
    .on("click", (event, feature) => handleCountryClick(feature));

  zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[-80, -80], [width + 80, height + 80]])
    .on("zoom", (event) => zoomLayer.attr("transform", event.transform));
  els.svg.call(zoomBehavior);
  updateMapState();
}

function updateMapState() {
  if (!countryLayer) return;
  countryLayer
    .selectAll("path")
    .attr("class", (feature) => `country ${shouldRevealAnswer() && isTargetFeature(feature) ? "is-answer" : ""}`);
  redrawOverlay();
}

function zoomMap(scale) {
  if (!zoomBehavior) return;
  els.svg.transition().duration(160).call(zoomBehavior.scaleBy, scale);
}

function resetMapZoom() {
  if (!zoomBehavior) return;
  els.svg.transition().duration(180).call(zoomBehavior.transform, d3.zoomIdentity);
}

function startGame() {
  if (state.online && state.roomId && !isHost) {
    setRoomHelp("Seul l’hôte peut lancer la partie. Attends que la room démarre.");
    return;
  }
  if (state.online && state.roomId && isHost) {
    launchOnlineGame();
    return;
  }
  startLocalGame();
}

function startLocalGame() {
  window.scrollTo(0, 0);
  clearOnlineTimers();
  state.players = [{ id: onlinePlayerId, name: ownOnlineName(), score: 0 }];
  state.screen = "game";
  state.online = false;
  state.started = true;
  state.round = 0;
  state.turn = 0;
  state.usedTargets = [];
  startNextTurn();
}

function returnToSetup() {
  clearInterval(state.timerId);
  clearOnlineTimers();
  state.screen = "setup";
  state.started = false;
  state.target = null;
  state.answered = false;
  state.roundComplete = false;
  state.selectedCountry = null;
  state.lastPoints = 0;
  state.roomId = null;
  state.online = false;
  state.answers = {};
  state.round = 0;
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete("room");
  history.replaceState({}, "", cleanUrl);
  roomData = null;
  isHost = false;
  renderAll();
}

function startNextTurn() {
  if (!state.started) return;
  const isNewRound = state.turn === 0;
  if (isNewRound) state.round += 1;
  if (state.round > state.rounds) {
    finishGame();
    return;
  }

  const round = buildRound(state.round, state.usedTargets);
  state.target = round.target;
  state.usedTargets = round.usedTargets;
  state.promptMode = round.promptMode;
  state.selectedCountry = null;
  state.answered = false;
  state.roundComplete = false;
  state.answers = {};
  state.endsAt = Date.now() + MAX_SECONDS * 1000;
  state.lastPoints = possiblePoints();
  renderAll();
  tickTimer();
}

async function handleCountryClick(feature) {
  if (!state.started || state.screen !== "game" || !state.target) return;
  if (state.online && state.answers?.[onlinePlayerId]) return;
  if (!state.online && state.answered) return;

  const clickedName = getFeatureName(feature);
  const correct = isTargetFeature(feature);
  const points = correct ? BASE_POINTS + Math.ceil(secondsLeft()) * SPEED_MULTIPLIER : 0;
  state.selectedCountry = clickedName;
  state.lastPoints = points;

  if (state.online) {
    await submitOnlineAnswer(clickedName, correct, points);
    return;
  }

  clearInterval(state.timerId);
  state.answered = true;
  state.roundComplete = true;
  state.players[state.turn].score += points;
  renderAll();
  window.setTimeout(() => {
    if (!state.started || !state.answered) return;
    advanceTurn();
  }, ROUND_REVEAL_MS);
}

function advanceTurn() {
  state.turn = (state.turn + 1) % state.players.length;
  if (state.turn === 0 && state.round >= state.rounds) {
    finishGame();
    return;
  }
  startNextTurn();
}

function tickTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    const remaining = secondsLeft();
    els.timerLabel.textContent = `${remaining.toFixed(1)}s`;
    els.pointsLabel.textContent = pointsText();
    if (remaining > 0) return;
    clearInterval(state.timerId);
    if (state.online) {
      if (isHost) scheduleHostAdvance();
      return;
    }
    if (!state.answered) {
      state.selectedCountry = "Temps écoulé";
      state.answered = true;
      state.roundComplete = true;
      state.lastPoints = 0;
      renderAll();
      window.setTimeout(advanceTurn, ROUND_REVEAL_MS);
    }
  }, 100);
}

function finishGame() {
  clearInterval(state.timerId);
  state.started = false;
  state.screen = "results";
  state.target = null;
  state.answered = false;
  state.roundComplete = false;
  renderAll();
}

function renderAll() {
  const screenChanged = renderedScreen !== state.screen;
  renderScreens();
  renderSetup();
  renderRoomLobby();
  renderPrompt();
  renderScoreboard();
  renderFeedback();
  renderOnlineStatus();
  saveState();
  if (screenChanged && state.screen === "game") {
    requestAnimationFrame(() => drawMap(countryFeatures));
  } else {
    updateMapState();
  }
  renderedScreen = state.screen;
}

function renderScreens() {
  els.setupScreen.classList.toggle("hidden", state.screen !== "setup");
  els.roomScreen.classList.toggle("hidden", state.screen !== "room");
  els.gameScreen.classList.toggle("hidden", state.screen !== "game");
  els.resultScreen.classList.toggle("hidden", state.screen !== "results");
}

function renderSetup() {
  els.modeSummary.textContent = state.modes.length === 3 ? "Mix" : state.modes.map(modeLabel).join(" + ");
  els.roundsInput.value = state.rounds;
  const soloLabel = els.startGame.querySelector("strong");
  if (soloLabel) soloLabel.textContent = "Jouer seul";
  els.startGame.disabled = false;
  els.modeInputs.forEach((input) => {
    input.checked = state.modes.includes(input.value);
  });
}

function renderRoomLobby() {
  if (!els.roomCodeDisplay) return;
  const players = playersFromRoom(roomData);
  els.roomCodeDisplay.textContent = state.roomId || "-----";
  els.roomPlayerCount.textContent = players.length;
  els.roomHostBadge.textContent = isHost ? "Tu es l’hôte" : "Invité";
  els.launchRoomGame.disabled = !isHost;
  els.launchRoomGame.textContent = isHost ? "Lancer la partie" : "Attente de l’hôte";
  els.roomLobbyMessage.textContent = isHost
    ? "Partage le code. Quand tout le monde est connecté, lance la partie."
    : "Tu es connecté. L’hôte lancera la partie.";
  els.roomPlayersList.innerHTML = players.length
    ? players.map((player) => `<div class="player-row room-player"><span>${escapeHtml(player.name)}</span><small>${player.id === roomData?.hostId ? "Hôte" : "Joueur"}</small></div>`).join("")
    : `<div class="player-row room-player"><span>En attente...</span><small>Room</small></div>`;
}

function renderPrompt() {
  els.roundLabel.textContent = state.started ? `Round ${state.round}/${state.rounds}` : `${state.rounds} rounds`;
  els.currentTurn.textContent = state.online ? `${answeredCount()}/${state.players.length} réponses` : `Tour de ${state.players[state.turn]?.name || "joueur"}`;
  if (!state.target) {
    els.promptTitle.textContent = "Prêt ?";
    els.promptHint.textContent = "Lance une partie depuis les réglages.";
    els.pointsLabel.textContent = `Score possible : ${BASE_POINTS + MAX_SECONDS * SPEED_MULTIPLIER} pts`;
    return;
  }
  const value = {
    flag: state.target.flag,
    capital: state.target.capital,
    name: state.target.name
  }[state.promptMode];
  els.promptTitle.textContent = value;
  els.promptHint.textContent = state.online ? "Tout le monde répond en même temps." : `${state.players[state.turn]?.name || "Joueur"}, clique sur le pays correspondant.`;
  els.pointsLabel.textContent = pointsText();
}

function renderScoreboard() {
  const rows = [...state.players].sort((a, b) => b.score - a.score);
  els.scoreboard.innerHTML = rows
    .map((player) => `<li class="${player.id === onlinePlayerId ? "is-current" : ""}"><span>${escapeHtml(player.name)}</span><strong>${player.score}</strong></li>`)
    .join("");
  els.finalScoreboard.innerHTML = rows
    .map((player, index) => `<li><span>${index + 1}. ${escapeHtml(player.name)}</span><strong>${player.score} pts</strong></li>`)
    .join("");
  const winner = rows[0];
  els.winnerTitle.textContent = winner ? `${winner.name} gagne` : "Partie terminée";
}

function renderFeedback() {
  if (!state.target) {
    els.feedback.textContent = "Clique sur le pays demandé.";
    return;
  }
  const ownAnswer = state.answers?.[onlinePlayerId];
  if (state.online && ownAnswer && !state.roundComplete) {
    els.feedback.textContent = `Réponse envoyée. En attente des autres joueurs (${answeredCount()}/${state.players.length}).`;
    return;
  }
  if (state.online && !ownAnswer && !state.roundComplete) {
    els.feedback.textContent = "Bonne réponse = 100 points + bonus temps. Mauvais pays = 0.";
    return;
  }
  if (!state.answered && !state.roundComplete) {
    els.feedback.textContent = "Bonne réponse = 100 points + bonus temps. Mauvais pays = 0.";
    return;
  }
  const points = state.online ? ownAnswer?.points || 0 : state.lastPoints;
  const selected = state.online ? ownAnswer?.country || "Temps écoulé" : state.selectedCountry;
  els.feedback.textContent = points > 0
    ? `Correct : ${state.target.name}. +${points} points.`
    : `${selected}. Réponse : ${state.target.name}. 0 point.`;
}

function redrawOverlay() {
  if (!overlayLayer) return;
  overlayLayer.selectAll("*").remove();
  if (!state.target || !shouldRevealAnswer()) return;
  const feature = countryFeatures.find(isTargetFeature);
  if (!feature) return;
  const centroid = path.centroid(feature);
  overlayLayer.append("circle").attr("class", "target-pulse").attr("cx", centroid[0]).attr("cy", centroid[1]).attr("r", 13);
  overlayLayer.append("text").attr("class", "target-label").attr("x", centroid[0] + 17).attr("y", centroid[1] - 11).text(state.target.name);
}

function shouldRevealAnswer() {
  return Boolean(state.target && (state.roundComplete || (!state.online && state.answered)));
}

function pointsText() {
  const ownAnswer = state.answers?.[onlinePlayerId];
  if (state.online && ownAnswer) return `Réponse envoyée : +${ownAnswer.points} pts`;
  if (!state.online && state.answered) return `+${state.lastPoints} pts`;
  return `Score possible : ${possiblePoints()} pts`;
}

function possiblePoints() {
  return BASE_POINTS + Math.max(0, Math.ceil(secondsLeft())) * SPEED_MULTIPLIER;
}

function secondsLeft() {
  return state.endsAt ? Math.max(0, (state.endsAt - Date.now()) / 1000) : MAX_SECONDS;
}

function buildRound(index, usedTargets = []) {
  const pool = countries.filter((country) => !usedTargets.includes(country.name));
  const target = sample(pool.length ? pool : countries);
  const promptMode = sample(state.modes);
  return {
    target,
    usedTargets: [...usedTargets, target.name],
    promptMode,
    round: {
      index,
      target,
      promptMode,
      endsAt: Date.now() + MAX_SECONDS * 1000,
      answers: {},
      revealAt: 0
    }
  };
}

function buildOnlineRound(index, usedTargets = [], modes = state.modes) {
  const pool = countries.filter((country) => !usedTargets.includes(country.name));
  const target = sample(pool.length ? pool : countries);
  return {
    usedTargets: [...usedTargets, target.name],
    round: {
      index,
      target,
      promptMode: sample(modes),
      endsAt: Date.now() + MAX_SECONDS * 1000,
      answers: {},
      revealAt: 0
    }
  };
}

function isTargetFeature(feature) {
  const clicked = normalizeName(getFeatureName(feature));
  return targetNames(state.target).some((name) => normalizeName(name) === clicked);
}

function targetNames(target) {
  if (!target) return [];
  return [target.name, ...(target.aliases || []), ...(target.geoNames || [])];
}

function getFeatureName(feature) {
  return feature?.properties?.name || feature?.properties?.NAME || "Pays inconnu";
}

function modeLabel(mode) {
  return { flag: "Drapeau", capital: "Capitale", name: "Nom" }[mode] || mode;
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

async function createOnlineRoom() {
  setOnlineMessage("Création...");
  setRoomHelp("Connexion à Firebase...");
  try {
    const roomId = window.GeoDuelFirebase.makeRoomId();
    isHost = true;
    state.roomId = roomId;
    state.online = true;
    roomData = makeRoomPayload();
    await window.GeoDuelFirebase.putRoom(roomId, roomData);
    updateRoomUrl(roomId);
    state.screen = "room";
    startRoomPolling();
    renderAll();
    setOnlineMessage(`Room ${roomId}`);
    setRoomHelp("Room créée. Copie le code et lance quand tout le monde est là.");
  } catch (error) {
    showFirebaseRulesError(error);
  }
}

async function joinOnlineRoom(event) {
  event?.preventDefault();
  const roomId = window.GeoDuelFirebase.cleanRoomId(els.roomCode.value || new URLSearchParams(location.search).get("room"));
  if (!roomId) return;
  setOnlineMessage("Connexion...");
  setRoomHelp("Recherche de la room...");
  try {
    const rawRoom = await window.GeoDuelFirebase.getRoom(roomId);
    if (!rawRoom) {
      setOnlineMessage("Room introuvable");
      setRoomHelp("Vérifie le code ou demande à ton ami de recréer une room.");
      return;
    }
    const data = normalizeRoom(rawRoom);
    if (data.status === "playing" && data.round) {
      setOnlineMessage("Partie déjà lancée");
      setRoomHelp("Cette room est en cours. Demande à l’hôte de relancer une nouvelle room après la partie.");
      return;
    }
    if (data.status === "results") {
      setOnlineMessage("Partie terminée");
      setRoomHelp("Cette room est terminée. Demande à l’hôte de créer une nouvelle room.");
      return;
    }
    state.roomId = roomId;
    state.online = true;
    isHost = data.hostId === onlinePlayerId;
    await window.GeoDuelFirebase.putPath(roomId, `/players/${onlinePlayerId}`, { name: ownOnlineName(), score: 0, joinedAt: Date.now() });
    await window.GeoDuelFirebase.patchRoom(roomId, { status: "lobby", updatedAt: Date.now() });
    updateRoomUrl(roomId);
    state.screen = "room";
    startRoomPolling();
    renderAll();
    setOnlineMessage(`Room ${roomId}`);
    setRoomHelp("Connecté à la room. Attends que l’hôte lance la partie.");
  } catch (error) {
    showFirebaseRulesError(error);
  }
}

function autoJoinRoomFromUrl() {
  const roomId = window.GeoDuelFirebase.cleanRoomId(new URLSearchParams(location.search).get("room"));
  if (!roomId) return;
  els.roomCode.value = roomId;
  joinOnlineRoom();
}

function startRoomPolling() {
  clearInterval(roomPollTimer);
  refreshRoom();
  roomPollTimer = setInterval(refreshRoom, 750);
}

async function refreshRoom() {
  if (!state.roomId) return;
  try {
    const data = await window.GeoDuelFirebase.getRoom(state.roomId);
    if (!data) throw new Error("Room introuvable.");
    roomData = normalizeRoom(data);
    isHost = roomData.hostId === onlinePlayerId;
    applyRoomData(roomData);
  } catch (error) {
    setOnlineMessage("Sync en attente");
    setRoomHelp(error.message);
  }
}

function makeRoomPayload() {
  const now = Date.now();
  return {
    hostId: onlinePlayerId,
    status: "lobby",
    createdAt: now,
    updatedAt: now,
    settings: {
      modes: state.modes,
      rounds: state.rounds
    },
    players: { [onlinePlayerId]: { name: ownOnlineName(), score: 0, joinedAt: now } },
    roundIndex: 0,
    usedTargets: [],
    round: null
  };
}

function normalizeRoom(data) {
  if (!data) return null;
  if (data.state) {
    return {
      hostId: data.hostId || onlinePlayerId,
      status: data.status || (data.state.started ? "playing" : "lobby"),
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      settings: {
        modes: data.state.modes?.length ? data.state.modes : state.modes,
        rounds: data.state.rounds || state.rounds
      },
      players: Object.fromEntries((data.state.players || []).map((player) => [player.id || crypto.randomUUID(), { name: player.name, score: player.score || 0 }])),
      roundIndex: data.state.round || 0,
      usedTargets: data.state.usedTargets || [],
      round: data.state.target ? {
        index: data.state.round || 1,
        target: data.state.target,
        promptMode: data.state.promptMode || "name",
        endsAt: data.state.endsAt || 0,
        answers: data.state.answers || {},
        revealAt: data.state.answered ? Date.now() : 0
      } : null
    };
  }
  return {
    ...data,
    status: data.status || "lobby",
    settings: {
      modes: data.settings?.modes?.length ? data.settings.modes : state.modes,
      rounds: data.settings?.rounds || state.rounds
    },
    players: data.players || {},
    usedTargets: data.usedTargets || [],
    round: data.round || null
  };
}

async function launchOnlineGame() {
  if (!state.roomId || !isHost) return;
  const settings = { modes: state.modes, rounds: state.rounds };
  const players = Object.fromEntries(playersFromRoom(roomData).map((player) => [player.id, { name: player.name, score: 0, joinedAt: roomData?.players?.[player.id]?.joinedAt || Date.now() }]));
  const next = buildOnlineRound(1, [], settings.modes);
  await window.GeoDuelFirebase.patchRoom(state.roomId, {
    status: "playing",
    settings,
    players,
    roundIndex: 1,
    usedTargets: next.usedTargets,
    round: next.round,
    updatedAt: Date.now()
  });
  setOnlineMessage(`Room ${state.roomId}`);
  setRoomHelp("Partie lancée.");
}

function applyRoomData(data) {
  const onlinePlayers = playersFromRoom(data);
  if (onlinePlayers.length) state.players = onlinePlayers;
  state.online = true;

  if (data.status === "lobby") {
    clearInterval(state.timerId);
    state.screen = "room";
    state.started = false;
    state.target = null;
    state.answers = {};
    state.roundComplete = false;
    state.modes = data.settings.modes;
    state.rounds = data.settings.rounds;
    renderAll();
    setOnlineMessage(`Room ${state.roomId}`);
    setRoomHelp(isHost ? "Partage le code. Lance quand tout le monde est connecté." : "Connecté. Attends que l’hôte lance la partie.");
    return;
  }

  if (data.status === "results") {
    clearInterval(state.timerId);
    state.screen = "results";
    state.started = false;
    state.roundComplete = true;
    state.target = null;
    renderAll();
    setOnlineMessage(`Room ${state.roomId}`);
    return;
  }

  if (data.status === "playing" && data.round) {
    applyOnlineRound(data);
  }
}

function applyOnlineRound(data) {
  const round = data.round;
  const ownAnswer = round.answers?.[onlinePlayerId] || null;
  state.screen = "game";
  state.started = true;
  state.modes = data.settings.modes;
  state.rounds = data.settings.rounds;
  state.round = round.index || data.roundIndex || 1;
  state.turn = 0;
  state.target = round.target;
  state.promptMode = round.promptMode;
  state.endsAt = round.endsAt;
  state.usedTargets = data.usedTargets || [];
  state.answers = round.answers || {};
  state.answered = Boolean(ownAnswer);
  state.roundComplete = isRoundComplete(data);
  state.selectedCountry = ownAnswer?.country || null;
  state.lastPoints = ownAnswer?.points || 0;
  renderAll();
  if (!state.roundComplete) tickTimer();
  if (isHost) maybeHostAdvance(data);
}

function playersFromRoom(data) {
  return Object.entries(data?.players || {}).map(([id, player]) => ({
    id,
    name: player.name || "Joueur",
    score: player.score || 0,
    joinedAt: player.joinedAt || 0
  }));
}

function ownOnlineName() {
  return (els.playerName.value.trim() || state.players[0]?.name || "Joueur").slice(0, 16);
}

async function submitOnlineAnswer(country, correct, points) {
  if (!state.roomId || !roomData?.round) return;
  const answer = {
    playerId: onlinePlayerId,
    country,
    correct,
    points,
    answeredAt: Date.now()
  };
  state.answers = { ...(state.answers || {}), [onlinePlayerId]: answer };
  state.answered = true;
  state.players = state.players.map((player) => player.id === onlinePlayerId ? { ...player, score: player.score + points } : player);
  renderAll();
  try {
    const ownScore = state.players.find((player) => player.id === onlinePlayerId)?.score || 0;
    await window.GeoDuelFirebase.putPath(state.roomId, `/round/answers/${onlinePlayerId}`, answer);
    await window.GeoDuelFirebase.putPath(state.roomId, `/players/${onlinePlayerId}/score`, ownScore);
    await window.GeoDuelFirebase.patchRoom(state.roomId, { updatedAt: Date.now() });
  } catch (error) {
    setOnlineMessage("Réponse non envoyée");
    setRoomHelp("Firebase a refusé ta réponse. Vérifie les règles Realtime Database.");
    console.warn(error);
  }
}

function maybeHostAdvance(data) {
  if (!isRoundComplete(data)) return;
  scheduleHostAdvance(data);
}

function scheduleHostAdvance(data = roomData) {
  if (!isHost || !data?.round || hostAdvanceTimer) return;
  const delay = data.round.revealAt ? Math.max(250, data.round.revealAt + ROUND_REVEAL_MS - Date.now()) : ROUND_REVEAL_MS;
  hostAdvanceTimer = window.setTimeout(async () => {
    hostAdvanceTimer = null;
    await hostAdvanceOnlineRoom(data.round.index);
  }, delay);
}

async function hostAdvanceOnlineRoom(expectedRoundIndex) {
  if (!isHost || !state.roomId) return;
  const latest = normalizeRoom(await window.GeoDuelFirebase.getRoom(state.roomId));
  if (!latest || latest.status !== "playing" || latest.round?.index !== expectedRoundIndex) return;
  if (!isRoundComplete(latest)) return;

  if ((latest.roundIndex || latest.round.index) >= latest.settings.rounds) {
    await window.GeoDuelFirebase.patchRoom(state.roomId, { status: "results", updatedAt: Date.now() });
    return;
  }

  const nextIndex = (latest.roundIndex || latest.round.index) + 1;
  const next = buildOnlineRound(nextIndex, latest.usedTargets || [], latest.settings.modes);
  await window.GeoDuelFirebase.patchRoom(state.roomId, {
    roundIndex: nextIndex,
    usedTargets: next.usedTargets,
    round: next.round,
    updatedAt: Date.now()
  });
}

function isRoundComplete(data) {
  const round = data?.round;
  if (!round) return false;
  const answers = Object.keys(round.answers || {}).length;
  const players = Object.keys(data.players || {}).length;
  return (players > 0 && answers >= players) || Date.now() >= round.endsAt;
}

function answeredCount() {
  return Object.keys(state.answers || {}).length;
}

function updateRoomUrl(roomId) {
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  history.replaceState({}, "", url);
}

async function copyRoomCode() {
  if (!state.roomId) return;
  await copyText(state.roomId);
  els.roomLobbyMessage.textContent = `Code ${state.roomId} copié.`;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    window.prompt("Copie ce code :", value);
  }
}

function renderOnlineStatus() {
  if (state.roomId) {
    els.onlineStatus.textContent = state.online ? `Room ${state.roomId}` : "Room sauvegardée";
    updateRoomUrl(state.roomId);
  } else {
    els.onlineStatus.textContent = "Solo";
  }
}

function setOnlineMessage(message) {
  els.onlineStatus.textContent = message;
}

function setRoomHelp(message) {
  els.roomHelp.textContent = message;
}

function showFirebaseRulesError(error) {
  setOnlineMessage("Firebase bloqué");
  setRoomHelp("Ta Realtime Database refuse les accès publics. Dans Firebase > Realtime Database > Rules, colle le contenu de database.rules.json puis publie.");
  console.warn(error);
}

function clearOnlineTimers() {
  clearInterval(roomPollTimer);
  clearTimeout(hostAdvanceTimer);
  roomPollTimer = null;
  hostAdvanceTimer = null;
}

function sample(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
