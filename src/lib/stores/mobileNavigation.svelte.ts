export type MobileTab = "generate" | "gallery" | "modelhub" | "artists" | "prompts" | "characters" | "settings";

export const MOBILE_OPTIONAL_TABS: MobileTab[] = [
  "gallery",
  "modelhub",
  "artists",
  "prompts",
  "characters",
];

const STORAGE_KEY = "mooshieui.mobileTabs.v1";

class MobileNavigationStore {
  enabledTabs = $state<MobileTab[]>([...MOBILE_OPTIONAL_TABS]);

  constructor() {
    this.loadSettings();
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const allowed = new Set<MobileTab>(MOBILE_OPTIONAL_TABS);
      this.enabledTabs = saved.filter((tab): tab is MobileTab => allowed.has(tab));
    } catch (error) {
      console.warn("Failed to load mobile navigation settings:", error);
    }
  }

  isEnabled(tab: MobileTab): boolean {
    return tab === "generate" || tab === "settings" || this.enabledTabs.includes(tab);
  }

  setEnabled(tab: MobileTab, enabled: boolean) {
    if (!MOBILE_OPTIONAL_TABS.includes(tab)) return;
    const next = enabled
      ? [...new Set([...this.enabledTabs, tab])]
      : this.enabledTabs.filter((item) => item !== tab);
    this.enabledTabs = MOBILE_OPTIONAL_TABS.filter((item) => next.includes(item));
    this.saveSettings();
  }

  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.enabledTabs));
    } catch (error) {
      console.warn("Failed to save mobile navigation settings:", error);
    }
  }
}

export const mobileNavigation = new MobileNavigationStore();
