export type DesktopRailItem =
  | "generate"
  | "gallery"
  | "modelhub"
  | "artists"
  | "prompts"
  | "characters"
  | "interrogate"
  | "sync"
  | "settings";

export const DESKTOP_OPTIONAL_RAIL_ITEMS: DesktopRailItem[] = [
  "gallery",
  "modelhub",
  "artists",
  "prompts",
  "characters",
  "interrogate",
  "sync",
];

const STORAGE_KEY = "mooshieui.desktopRail.v1";

class DesktopNavigationStore {
  enabledItems = $state<DesktopRailItem[]>([...DESKTOP_OPTIONAL_RAIL_ITEMS]);

  constructor() {
    this.loadSettings();
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const allowed = new Set<DesktopRailItem>(DESKTOP_OPTIONAL_RAIL_ITEMS);
      this.enabledItems = saved.filter((item): item is DesktopRailItem => allowed.has(item));
    } catch (error) {
      console.warn("Failed to load desktop rail settings:", error);
    }
  }

  isEnabled(item: DesktopRailItem): boolean {
    return item === "generate" || item === "settings" || this.enabledItems.includes(item);
  }

  setEnabled(item: DesktopRailItem, enabled: boolean) {
    if (!DESKTOP_OPTIONAL_RAIL_ITEMS.includes(item)) return;
    const next = enabled
      ? [...new Set([...this.enabledItems, item])]
      : this.enabledItems.filter((entry) => entry !== item);
    this.enabledItems = DESKTOP_OPTIONAL_RAIL_ITEMS.filter((entry) => next.includes(entry));
    this.saveSettings();
  }

  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.enabledItems));
    } catch (error) {
      console.warn("Failed to save desktop rail settings:", error);
    }
  }
}

export const desktopNavigation = new DesktopNavigationStore();
