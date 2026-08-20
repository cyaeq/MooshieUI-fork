const STORAGE_KEY = "mooshieui.updatePreferences.v1";

class UpdatePreferencesStore {
  showAutomaticNotifications = $state(true);

  constructor() {
    this.loadSettings();
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.showAutomaticNotifications === "boolean") {
        this.showAutomaticNotifications = saved.showAutomaticNotifications;
      }
    } catch (error) {
      console.warn("Failed to load update notification preference:", error);
    }
  }

  setShowAutomaticNotifications(enabled: boolean) {
    this.showAutomaticNotifications = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ showAutomaticNotifications: enabled }));
    } catch (error) {
      console.warn("Failed to save update notification preference:", error);
    }
  }
}

export const updatePreferences = new UpdatePreferencesStore();
