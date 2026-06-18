window.GeoDuelFirebase = {
  enabled: false,
  roomId: null,
  async connect() {
    return { enabled: false, reason: "Ajoute ta config Firebase pour activer les parties en ligne." };
  },
  async publishState() {},
  async subscribe() {
    return () => {};
  }
};
