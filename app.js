const WORLD_GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const STORAGE_KEY = "geo-duel-state-v3";
const MAX_SECONDS = 20;
const BASE_POINTS = 100;
const SPEED_MULTIPLIER = 10;

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const countries = window.GEO_DUEL_COUNTRIES;
const onlinePlayerId = sessionStorage.getItem("geoDuelPlayer") || crypto.randomUUID();
sessionStorage.setItem("geoDuelPlayer", onlinePlayerId);

const state = {
  screen: "setup",
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
  selectedCountry: null,
  answered: false,
  started: false,
  endsAt: 0,
  usedTargets: [],
  answers: {},
  lastPoints: 0,
  roomId: null,
  online: false,
  lastRemoteUpdate: 0,
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
  winnerTitle: document.querySelector("#winnerTitle")
};

let projection = d3.geoNaturalEarth1();
let path = d3.geoPath(projection);
let countryFeatures = [];
let countryLayer = null;
let overlayLayer = null;
let unsubscribeRoom = null;
let roomPollTimer = null;
let roomData = null;
let isHost = false;
let suppressPublish = false;

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
  els.roundsInput.addEventListener("change", () => {
    state.rounds = clamp(Number(els.roundsInput.value) || 10, 3, 30);
    renderAll();
    syncState();
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
      syncState();
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

  els.svg.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", path);
  els.svg.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", path);
  countryLayer = els.svg.append("g").attr("class", "countries");
  overlayLayer = els.svg.append("g").attr("class", "overlays");

  countryLayer
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("class", (feature) => `country ${state.answered && isTargetFeature(feature) ? "is-answer" : ""}`)
    .attr("data-country", (feature) => getFeatureName(feature))
    .attr("d", path)
    .on("click", (event, feature) => handleCountryClick(feature));

  redrawOverlay();
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
  state.players = [{ id: onlinePlayerId, name: ownOnlineName(), score: 0 }];
  state.screen = "game";
  state.started = true;
  state.round = 0;
  state.turn = 0;
  state.usedTargets = [];
  startNextTurn();
}

function returnToSetup() {
  clearInterval(state.timerId);
  clearInterval(roomPollTimer);
  state.screen = "setup";
  state.started = false;
  state.target = null;
  state.answered = false;
  state.selectedCountry = null;
  state.lastPoints = 0;
  state.roomId = null;
  state.online = false;
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete("room");
  history.replaceState({}, "", cleanUrl);
  roomData = null;
  isHost = false;
  renderAll();
}

function startNextTurn() {
  if (!state.started) return;
  if (state.online) {
    startOnlineRound();
    return;
  }
  const isNewRound = state.turn === 0;
  if (isNewRound) state.round += 1;
  if (state.round > state.rounds) {
    finishGame();
    return;
  }

  const pool = countries.filter((country) => !state.usedTargets.includes(country.name));
  state.target = sample(pool.length ? pool : countries);
  state.usedTargets.push(state.target.name);
  state.promptMode = sample(state.modes);
  state.selectedCountry = null;
  state.answered = false;
  state.lastPoints = possiblePoints();
  state.endsAt = Date.now() + MAX_SECONDS * 1000;
  renderAll();
  tickTimer();
  syncState();
}

function startOnlineRound() {
  state.round += 1;
  if (state.round > state.rounds) {
    finishGame();
    return;
  }
  const pool = countries.filter((country) => !state.usedTargets.includes(country.name));
  state.target = sample(pool.length ? pool : countries);
  state.usedTargets.push(state.target.name);
  state.promptMode = sample(state.modes);
  state.selectedCountry = null;
  state.answers = {};
  state.answered = false;
  state.lastPoints = possiblePoints();
  state.endsAt = Date.now() + MAX_SECONDS * 1000;
  renderAll();
  tickTimer();
  syncState();
}

function handleCountryClick(feature) {
  if (!state.started || state.screen !== "game" || state.answered || !state.target) return;
  if (state.online && state.answers?.[onlinePlayerId]) return;
  const clickedName = getFeatureName(feature);
  const correct = isTargetFeature(feature);
  const secondsLeft = Math.max(0, (state.endsAt - Date.now()) / 1000);
  const points = correct ? BASE_POINTS + Math.ceil(secondsLeft) * SPEED_MULTIPLIER : 0;

  state.selectedCountry = clickedName;
  state.lastPoints = points;
  if (state.online) {
    state.answers = {
      ...(state.answers || {}),
      [onlinePlayerId]: { playerId: onlinePlayerId, country: clickedName, correct, points }
    };
    state.players = state.players.map((player) => player.id === onlinePlayerId ? { ...player, score: player.score + points } : player);
    state.answered = Object.keys(state.answers).length >= state.players.length;
    renderAll();
    syncState();
    if (isHost && state.answered) window.setTimeout(advanceOnlineRound, 1200);
    return;
  }

  clearInterval(state.timerId);
  state.answered = true;
  state.players[state.turn].score += points;

  renderAll();
  syncState();
  window.setTimeout(() => {
    if (!state.started || !state.answered) return;
    advanceTurn();
  }, 1300);
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
    const remaining = Math.max(0, (state.endsAt - Date.now()) / 1000);
    els.timerLabel.textContent = `${remaining.toFixed(1)}s`;
    els.pointsLabel.textContent = `Score possible : ${possiblePoints()} pts`;
    if (remaining <= 0 && !state.answered) {
      clearInterval(state.timerId);
      state.selectedCountry = "Temps écoulé";
      state.answered = true;
      state.lastPoints = 0;
      renderAll();
      syncState();
      window.setTimeout(state.online ? advanceOnlineRound : advanceTurn, 1300);
    }
  }, 100);
}

function advanceOnlineRound() {
  if (!isHost || !state.started || state.screen !== "game") return;
  startOnlineRound();
}

function finishGame() {
  clearInterval(state.timerId);
  state.started = false;
  state.screen = "results";
  state.target = null;
  state.answered = false;
  renderAll();
  syncState();
}

function renderAll() {
  renderScreens();
  renderSetup();
  renderRoomLobby();
  renderPrompt();
  renderScoreboard();
  renderFeedback();
  renderOnlineStatus();
  saveState();
  drawMap(countryFeatures);
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
  if (soloLabel) soloLabel.textContent = state.online && state.roomId && !isHost ? "Attente de l’hôte" : "Jouer seul";
  els.startGame.disabled = Boolean(state.online && state.roomId && !isHost);
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
  els.promptHint.textContent = state.online ? "Tout le monde clique en même temps." : `${state.players[state.turn]?.name || "Joueur"}, clique sur le pays correspondant.`;
  els.pointsLabel.textContent = state.online && state.answers?.[onlinePlayerId]
    ? `Réponse envoyée : +${state.answers[onlinePlayerId].points} pts`
    : state.answered ? `+${state.lastPoints} pts` : `Score possible : ${possiblePoints()} pts`;
}

function renderScoreboard() {
  const rows = [...state.players].sort((a, b) => b.score - a.score);
  els.scoreboard.innerHTML = rows
    .map((player) => `<li class="${player.id === state.players[state.turn]?.id ? "is-current" : ""}"><span>${escapeHtml(player.name)}</span><strong>${player.score}</strong></li>`)
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
  if (state.online && state.answers?.[onlinePlayerId] && !state.answered) {
    els.feedback.textContent = `Réponse envoyée. En attente des autres joueurs (${answeredCount()}/${state.players.length}).`;
    return;
  }
  if (!state.answered) {
    els.feedback.textContent = "Bonne réponse = 100 points + bonus temps. Mauvais pays = 0.";
    return;
  }
  if (state.lastPoints > 0) {
    els.feedback.textContent = `Correct : ${state.target.name}. +${state.lastPoints} points.`;
  } else {
    els.feedback.textContent = `${state.selectedCountry}. Réponse : ${state.target.name}. 0 point.`;
  }
}

function redrawOverlay() {
  if (!overlayLayer || !state.target || !state.answered) return;
  overlayLayer.selectAll("*").remove();
  const feature = countryFeatures.find(isTargetFeature);
  if (!feature) return;
  const centroid = path.centroid(feature);
  overlayLayer.append("circle").attr("class", "target-pulse").attr("cx", centroid[0]).attr("cy", centroid[1]).attr("r", 13);
  overlayLayer.append("text").attr("class", "target-label").attr("x", centroid[0] + 17).attr("y", centroid[1] - 11).text(state.target.name);
}

function possiblePoints() {
  const secondsLeft = state.endsAt ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) : MAX_SECONDS;
  return BASE_POINTS + secondsLeft * SPEED_MULTIPLIER;
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
    roomData = makeRoomPayload("lobby");
    await window.GeoDuelFirebase.putRoom(roomId, roomData);
    updateRoomUrl(state.roomId);
    startRoomPolling();
    state.screen = "room";
    renderAll();
    setOnlineMessage(`Room ${state.roomId}`);
    setRoomHelp("Room créée. Copie le code. L’hôte lance quand tout le monde est connecté.");
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
    const room = await window.GeoDuelFirebase.joinRoom(roomId);
    if (!room) {
      setOnlineMessage("Room introuvable");
      setRoomHelp("Vérifie le code ou demande à ton ami de recréer une room.");
      return;
    }
    const data = normalizeRoom(room);
    if (data.status !== "lobby") {
      data.status = "lobby";
      data.screen = "room";
      data.started = false;
      data.target = null;
      data.answered = false;
      data.updatedAt = Date.now();
      await window.GeoDuelFirebase.patchRoom(roomId, {
        status: data.status,
        screen: data.screen,
        started: data.started,
        target: data.target,
        answered: data.answered,
        updatedAt: data.updatedAt
      });
    }
    state.roomId = roomId;
    state.online = true;
    isHost = data.hostId === onlinePlayerId;
    await window.GeoDuelFirebase.putPath(roomId, `/players/${onlinePlayerId}`, { name: ownOnlineName(), score: 0 });
    updateRoomUrl(roomId);
    startRoomPolling();
    state.screen = "room";
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
  roomPollTimer = setInterval(refreshRoom, 1100);
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

async function syncState() {
  if (!state.online || !state.roomId || suppressPublish || !roomData) return;
  try {
    roomData = {
      ...roomData,
      ...serializeState(),
      players: Object.fromEntries(state.players.map((player) => [player.id, { name: player.name, score: player.score || 0 }])),
      updatedAt: Date.now()
    };
    await window.GeoDuelFirebase.patchRoom(state.roomId, roomData);
    setOnlineMessage(`Room ${state.roomId}`);
  } catch {
    setOnlineMessage("Sync échouée");
    setRoomHelp("Firebase refuse l’écriture. Ouvre les règles Realtime Database pour synchroniser la partie.");
  }
}

function serializeState() {
  return {
    screen: state.screen,
    modes: state.modes,
    rounds: state.rounds,
    round: state.round,
    turn: state.turn,
    target: state.target,
    promptMode: state.promptMode,
    selectedCountry: state.selectedCountry,
    answered: state.answered,
    started: state.started,
    endsAt: state.endsAt,
    usedTargets: state.usedTargets,
    answers: state.answers,
    lastPoints: state.lastPoints
  };
}

function makeRoomPayload(status) {
  return {
    hostId: onlinePlayerId,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: { [onlinePlayerId]: { name: ownOnlineName(), score: 0 } },
    ...serializeState(),
    screen: "setup",
    started: false
  };
}

function normalizeRoom(data) {
  if (data.state) {
    return {
      hostId: data.hostId || onlinePlayerId,
      status: data.status || (data.state.started ? "playing" : "lobby"),
      players: Object.fromEntries((data.state.players || []).map((player) => [player.id || crypto.randomUUID(), { name: player.name, score: player.score || 0 }])),
      ...data.state,
      updatedAt: data.updatedAt || Date.now()
    };
  }
  return data;
}

async function launchOnlineGame() {
  if (!state.roomId || !isHost) return;
  const onlinePlayers = playersFromRoom(roomData);
  state.players = onlinePlayers.length ? onlinePlayers : state.players;
  state.players.forEach((player) => {
    player.score = 0;
  });
  state.screen = "game";
  state.started = true;
  state.round = 0;
  state.turn = 0;
  state.usedTargets = [];
  state.answers = {};
  roomData = {
    ...roomData,
    status: "playing",
    players: Object.fromEntries(state.players.map((player) => [player.id, { name: player.name, score: 0 }])),
    ...serializeState(),
    updatedAt: Date.now()
  };
  await window.GeoDuelFirebase.patchRoom(state.roomId, roomData);
  startNextTurn();
}

function applyRoomData(data) {
  const onlinePlayers = playersFromRoom(data);
  if (onlinePlayers.length) state.players = onlinePlayers;
  state.online = true;
  if (data.status === "lobby") {
    state.screen = "room";
    state.started = false;
    renderAll();
    setOnlineMessage(`Room ${state.roomId}`);
    setRoomHelp(isHost ? "Partage le code. Lance quand tout le monde est connecté." : "Connecté. Attends que l’hôte lance la partie.");
    return;
  }
  applyRemoteState(data, data.updatedAt || Date.now());
}

function playersFromRoom(data) {
  return Object.entries(data?.players || {}).map(([id, player]) => ({
    id,
    name: player.name || "Joueur",
    score: player.score || 0
  }));
}

function ownOnlineName() {
  return (els.playerName.value.trim() || state.players[0]?.name || "Joueur").slice(0, 16);
}

function applyRemoteState(remoteState, updatedAt = Date.now()) {
  suppressPublish = true;
  clearInterval(state.timerId);
  Object.assign(state, {
    screen: remoteState.screen || "setup",
    players: remoteState.players?.length ? remoteState.players : state.players,
    modes: remoteState.modes?.length ? remoteState.modes : state.modes,
    rounds: remoteState.rounds || state.rounds,
    round: remoteState.round || 0,
    turn: remoteState.turn || 0,
    target: remoteState.target || null,
    promptMode: remoteState.promptMode || "name",
    selectedCountry: remoteState.selectedCountry || null,
    answers: remoteState.answers || {},
    answered: Boolean(remoteState.answered),
    started: Boolean(remoteState.started),
    endsAt: remoteState.endsAt || 0,
    usedTargets: remoteState.usedTargets || [],
    lastPoints: remoteState.lastPoints || 0,
    lastRemoteUpdate: updatedAt
  });
  renderAll();
  if (state.started && !state.answered && state.target) tickTimer();
  if (state.online && isHost && state.started && state.target && !state.answered && answeredCount() >= state.players.length) {
    state.answered = true;
    syncState();
    window.setTimeout(advanceOnlineRound, 1200);
  }
  suppressPublish = false;
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
    els.onlineStatus.textContent = "Local";
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
