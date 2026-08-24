/** Manual cross-browser preference transfer and local JSON export/import. */
import { fetchServerPrefs, pushServerPrefs, type UserPrefsData } from "../utils/serverPrefs.js";
import { artistFavourites } from "../artist-gallery/favourites.svelte.js";
import { promptFavourites } from "../artist-gallery/promptFavourites.svelte.js";
import { accessibility } from "./accessibility.svelte.js";
import { autocomplete } from "./autocomplete.svelte.js";
import { gallery } from "./gallery.svelte.js";
import { generation } from "./generation.svelte.js";
import { locale } from "./locale.svelte.js";
import { loraPresets } from "./loraPresets.svelte.js";
import { notes } from "./notes.svelte.js";
import { promptPresets } from "./promptPresets.svelte.js";
import { styles } from "./styles.svelte.js";
import { videoTimeline } from "./videoTimeline.svelte.js";

const EXPORT_VERSION = 1;

export interface PrefsExportPayload {
  version: number;
  exported_at: string;
  app: "mooshieui";
  data: UserPrefsData;
}

class PrefsSyncStore {
  lastSyncedAt = $state<number | null>(null);
  lastSyncError = $state<string | null>(null);
  serverTransfer = $state<"upload" | "download" | null>(null);
  lastServerAction = $state<"upload" | "download" | null>(null);

  collectAll(): UserPrefsData {
    return {
      generation: generation.collectPrefs(),
      prompt_history: generation.collectPromptHistory(),
      prompt_presets: promptPresets.collectPrefs(),
      styles: styles.collectPrefs(),
      lora_presets: loraPresets.collectPrefs(),
      artist_favourites: artistFavourites.collectPrefs(),
      prompt_favourites: promptFavourites.collectPrefs(),
      gallery_boards: gallery.collectPrefs(),
      autocomplete: autocomplete.collectPrefs(),
      accessibility: accessibility.collectPrefs(),
      notes: notes.collectPrefs(),
      video_timeline: videoTimeline.collectPrefs(),
      locale: locale.current,
    };
  }

  async applyAll(prefs: UserPrefsData): Promise<void> {
    if (prefs.generation) {
      await generation
        .applyServerPrefs(prefs.generation as Record<string, any>)
        .catch(() => {});
    }
    if (Array.isArray(prefs.prompt_history)) generation.applyPromptHistory(prefs.prompt_history as any[]);
    if (prefs.prompt_presets) promptPresets.applyServerPrefs(prefs.prompt_presets);
    if (prefs.styles) styles.applyServerPrefs(prefs.styles);
    if (prefs.lora_presets) loraPresets.applyServerPrefs(prefs.lora_presets);
    if (prefs.artist_favourites) artistFavourites.applyServerPrefs(prefs.artist_favourites);
    if (prefs.prompt_favourites) await promptFavourites.applyServerPrefs(prefs.prompt_favourites);
    if (prefs.gallery_boards) gallery.applyServerPrefs(prefs.gallery_boards);
    if (prefs.autocomplete) {
      await autocomplete
        .applyServerPrefs(prefs.autocomplete as Record<string, any>)
        .catch(() => {});
    }
    if (prefs.accessibility) accessibility.applyServerPrefs(prefs.accessibility);
    if (prefs.notes) notes.applyServerPrefs(prefs.notes);
    if (prefs.video_timeline) videoTimeline.applyServerPrefs(prefs.video_timeline);
    if (typeof prefs.locale === "string") locale.applyServerPrefs(prefs.locale, prefs.updated_at);
  }

  async uploadToServer(): Promise<void> {
    if (this.serverTransfer) return;
    this.serverTransfer = "upload";
    this.lastServerAction = null;
    this.lastSyncError = null;
    try {
      await pushServerPrefs(this.collectAll());
      this.lastSyncedAt = Date.now();
      this.lastServerAction = "upload";
    } catch (e) {
      this.lastSyncError = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.serverTransfer = null;
    }
  }

  async downloadFromServer(): Promise<boolean> {
    if (this.serverTransfer) return false;
    this.serverTransfer = "download";
    this.lastServerAction = null;
    this.lastSyncError = null;
    try {
      const prefs = await fetchServerPrefs();
      if (!prefs) return false;
      await this.applyAll(prefs);
      this.lastSyncedAt = Date.now();
      this.lastServerAction = "download";
      return true;
    } catch (e) {
      this.lastSyncError = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.serverTransfer = null;
    }
  }

  exportJSON(): string {
    return JSON.stringify({
      version: EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      app: "mooshieui",
      data: this.collectAll(),
    } satisfies PrefsExportPayload, null, 2);
  }

  async importJSON(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON file");
    }
    const data = parsed && typeof parsed === "object" && "data" in (parsed as Record<string, unknown>)
      ? (parsed as PrefsExportPayload).data
      : (parsed as UserPrefsData);
    if (!data || typeof data !== "object") throw new Error("Unexpected payload shape");
    await this.applyAll(data);
    this.lastSyncedAt = Date.now();
  }
}

export const prefsSync = new PrefsSyncStore();
