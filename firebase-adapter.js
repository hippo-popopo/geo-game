const GEO_DUEL_FALLBACK_DATABASE_URL = "https://geo-game-4f27f-default-rtdb.europe-west1.firebasedatabase.app";
const GEO_DUEL_DATABASE_URL = (window.GEO_DUEL_FIREBASE?.databaseURL || GEO_DUEL_FALLBACK_DATABASE_URL).replace(/\/$/, "");

function roomUrl(roomId) {
  return `${GEO_DUEL_DATABASE_URL}/geo-duel/rooms/${encodeURIComponent(roomId)}.json`;
}

function roomPathUrl(roomId, path = "") {
  return `${GEO_DUEL_DATABASE_URL}/geo-duel/rooms/${encodeURIComponent(roomId)}${path}.json`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Firebase ${response.status}`);
  }
  return response.json();
}

window.GeoDuelFirebase = {
  enabled: Boolean(GEO_DUEL_DATABASE_URL),
  databaseUrl: GEO_DUEL_DATABASE_URL,
  makeRoomId() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  },
  cleanRoomId(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  },
  async createRoom(roomId, state) {
    if (!this.enabled) throw new Error("Ajoute l'URL Firebase dans firebase-config.js.");
    const cleanId = this.cleanRoomId(roomId);
    await requestJson(roomUrl(cleanId), {
      method: "PUT",
      body: JSON.stringify({
        createdAt: Date.now(),
        updatedAt: Date.now(),
        state
      })
    });
    return cleanId;
  },
  async getRoom(roomId) {
    if (!this.enabled) throw new Error("Ajoute l'URL Firebase dans firebase-config.js.");
    return requestJson(roomUrl(this.cleanRoomId(roomId)));
  },
  async putRoom(roomId, data) {
    if (!this.enabled) throw new Error("Ajoute l'URL Firebase dans firebase-config.js.");
    await requestJson(roomUrl(this.cleanRoomId(roomId)), {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },
  async patchRoom(roomId, data) {
    if (!this.enabled) throw new Error("Ajoute l'URL Firebase dans firebase-config.js.");
    await requestJson(roomUrl(this.cleanRoomId(roomId)), {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  },
  async putPath(roomId, path, data) {
    if (!this.enabled) throw new Error("Ajoute l'URL Firebase dans firebase-config.js.");
    await requestJson(roomPathUrl(this.cleanRoomId(roomId), path), {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },
  async joinRoom(roomId) {
    if (!this.enabled) throw new Error("Ajoute l'URL Firebase dans firebase-config.js.");
    const cleanId = this.cleanRoomId(roomId);
    return requestJson(roomUrl(cleanId));
  },
  async publishState(roomId, state) {
    if (!this.enabled) throw new Error("Ajoute l'URL Firebase dans firebase-config.js.");
    const cleanId = this.cleanRoomId(roomId);
    const updatedAt = Date.now();
    await requestJson(roomUrl(cleanId), {
      method: "PATCH",
      body: JSON.stringify({ updatedAt, state })
    });
    return updatedAt;
  },
  subscribe(roomId, onState) {
    const cleanId = this.cleanRoomId(roomId);
    let lastUpdatedAt = 0;
    let stopped = false;

    async function poll() {
      if (stopped) return;
      try {
        const room = await requestJson(roomUrl(cleanId));
        if (room?.state && room.updatedAt && room.updatedAt !== lastUpdatedAt) {
          lastUpdatedAt = room.updatedAt;
          onState(room.state, room.updatedAt);
        }
      } catch (error) {
        onState(null, 0, error);
      }
      if (!stopped) window.setTimeout(poll, 1100);
    }

    poll();
    return () => {
      stopped = true;
    };
  }
};
