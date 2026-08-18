/**
 * Central hub for server-side user preference sync.
 *
 * All stores call `triggerSync()` whenever they persist settings.
 * This store registers itself as the sync handler and debounces those calls
 * into a single push to the server (2 s window).
 *
 * On startup/login, `loadAndApply()` pulls the server snapshot and distributes
 * it to every participating store.  If no server snapshot exists yet the
 * current local state is seeded to the server.
 *
 * Only active in browser / LAN mode — `pushServerPrefs` / `fetchServerPrefs`
 * are no-ops in Tauri desktop mode.
 *
 * A global master switch (`enabled`) gates all server sync. When disabled the
 * debounced pushes and the startup pull are skipped entirely (local persistence
 * is unaffected), but the JSON export / import helpers always work so users can
 * move config between installs by hand.
 */

import { registerSyncHandler } from "../utils/syncTrigger.js";
import { fetchServerPrefs, pushServerPrefs, type UserPrefsData } from "../utils/serverPrefs.js";

const ENABLED_KEY = "mooshieui.prefsSync.enabled.v1";
/** Bumped when the on-disk export format changes. */
const EXPORT_VERSION = 1;

export interface PrefsExportPayload {
  version: number;
  exported_at: string;
  app: "mooshieui";
  data: UserPrefsData;
}
import { generation } from "./generation.svelte.js";
import { promptPresets } from "./promptPresets.svelte.js";
import { styles } from "./styles.svelte.js";
import { loraPresets } from "./loraPresets.svelte.js";
import { artistFavourites } from "../artist-gallery/favourites.svelte.js";
import { gallery } from "./gallery.svelte.js";
import { accessibility } from "./accessibility.svelte.js";
import { locale } from "./locale.svelte.js";
import { autocomplete } from "./autocomplete.svelte.js";
import { notes } from "./notes.svelte.js";
// Also the load-bearing import that registers the timeline compiler with
// `utils/timelineProvider.ts` before the first generation.
import { videoTimeline } from "./videoTimeline.svelte.js";

class PrefsSyncStore {
  /** Global master switch for server-side cross-browser sync. */
  enabled = $state<boolean>(true);
  /** Timestamp (ms) of the last successful push or pull, for the settings UI. */
  lastSyncedAt = $state<number | null>(null);
  lastSyncError = $state<string | null>(null);
  syncing = $state(false);

  private _syncTimer: ReturnType<typeof setTimeout> | null = null;
  private _syncing = false;
  private _pending = false;

  constructor() {
    this.loadEnabled();
    registerSyncHandler(() => this.scheduleSync());
  }

  private loadEnabled(): void {
    try {
      const raw = localStorage.getItem(ENABLED_KEY);
      if (raw !== null) this.enabled = raw === "1";
    } catch {
      // Ignore storage errors — default to enabled.
    }
  }

  /** Toggle the master switch and persist the choice locally (never synced itself). */
  setEnabled(value: boolean): void {
    this.enabled = value;
    try {
      if (value) localStorage.setItem(ENABLED_KEY, "1");
      else localStorage.removeItem(ENABLED_KEY);
    } catch {
      // Ignore storage errors.
    }
    if (!value && this._syncTimer !== null) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    // Re-pull the server snapshot when the user re-enables sync.
    if (value) void this.loadAndApply();
  }

  /** Gather the current state of all participating stores. */
  collectAll(): UserPrefsData {
    return {
      generation: generation.collectPrefs(),
      prompt_history: generation.collectPromptHistory(),
      prompt_presets: promptPresets.collectPrefs(),
      styles: styles.collectPrefs(),
      lora_presets: loraPresets.collectPrefs(),
      artist_favourites: artistFavourites.collectPrefs(),
      gallery_boards: gallery.collectPrefs(),
      autocomplete: autocomplete.collectPrefs(),
      accessibility: accessibility.collectPrefs(),
      notes: notes.collectPrefs(),
      video_timeline: videoTimeline.collectPrefs(),
      locale: locale.current,
    };
  }

  /** Distribute a server snapshot to every participating store. */
  async applyAll(prefs: UserPrefsData): Promise<void> {
    if (prefs.generation) {
      await generation.applyServerPrefs(prefs.generation as Record<string, any>).catch(() => {});
    }
    if (Array.isArray(prefs.prompt_history)) {
      generation.applyPromptHistory(prefs.prompt_history as any[]);
    }
    if (prefs.prompt_presets) {
      promptPresets.applyServerPrefs(prefs.prompt_presets);
    }
    if (prefs.styles) {
      styles.applyServerPrefs(prefs.styles);
    }
    if (prefs.lora_presets) {
      loraPresets.applyServerPrefs(prefs.lora_presets);
    }
    if (prefs.artist_favourites) {
      artistFavourites.applyServerPrefs(prefs.artist_favourites);
    }
    if (prefs.gallery_boards) {
      gallery.applyServerPrefs(prefs.gallery_boards);
    }
    if (prefs.autocomplete) {
      await autocomplete.applyServerPrefs(prefs.autocomplete as Record<string, any>).catch(() => {});
    }
    if (prefs.accessibility) {
      accessibility.applyServerPrefs(prefs.accessibility);
    }
    if (prefs.notes) {
      notes.applyServerPrefs(prefs.notes);
    }
    if (prefs.video_timeline) {
      videoTimeline.applyServerPrefs(prefs.video_timeline);
    }
    if (typeof prefs.locale === "string") {
      locale.applyServerPrefs(prefs.locale, prefs.updated_at);
    }
  }

  /**
   * Fetch server prefs and apply them.  If the server has no prefs yet,
   * seed it with the current local state.
   */
  async loadAndApply(): Promise<void> {
    if (!this.enabled) return;
    try {
      const prefs = await fetchServerPrefs();
      if (prefs) {
        await this.applyAll(prefs);
      } else {
        // No snapshot on server yet — push current local state to seed it.
        await pushServerPrefs(this.collectAll());
      }
      this.lastSyncedAt = Date.now();
      this.lastSyncError = null;
    } catch (e) {
      this.lastSyncError = e instanceof Error ? e.message : String(e);
      // Non-fatal — offline or server unavailable.
    }
  }

  /** Debounce: collapses rapid consecutive saves into one server push. */
  scheduleSync(): void {
    if (!this.enabled) return;
    if (this._syncTimer !== null) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null;
      this._doSync().catch(() => {});
    }, 2000);
  }

  private async _doSync(): Promise<void> {
    // If a push is already in flight, mark that another is needed rather than
    // dropping it — changes made mid-flight would otherwise never reach the
    // server until the next unrelated save.
    if (!this.enabled) return;
    if (this._syncing) {
      this._pending = true;
      return;
    }
    this._syncing = true;
    try {
      await pushServerPrefs(this.collectAll());
      this.lastSyncedAt = Date.now();
      this.lastSyncError = null;
    } catch (e) {
      this.lastSyncError = e instanceof Error ? e.message : String(e);
    } finally {
      this._syncing = false;
    }
    if (this._pending) {
      this._pending = false;
      // Re-run once to flush the state that changed during the last push.
      this._doSync().catch(() => {});
    }
  }

  /** Push the current local state to the server immediately (manual "sync now"). */
  async forceSyncNow(): Promise<void> {
    if (!this.enabled || this.syncing) return;
    this.syncing = true;
    try {
      await pushServerPrefs(this.collectAll());
      this.lastSyncedAt = Date.now();
      this.lastSyncError = null;
    } catch (e) {
      this.lastSyncError = e instanceof Error ? e.message : String(e);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Serialize every participating store's state into an exportable JSON string.
   * Works in both Tauri desktop and browser modes.
   */
  exportJSON(): string {
    const payload: PrefsExportPayload = {
      version: EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      app: "mooshieui",
      data: this.collectAll(),
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Parse an exported JSON payload and apply it to every participating store.
   * Accepts both the versioned wrapper and a bare `UserPrefsData` object.
   */
  async importJSON(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON file");
    }
    let data: UserPrefsData;
    if (parsed && typeof parsed === "object" && "data" in (parsed as Record<string, unknown>)) {
      data = (parsed as PrefsExportPayload).data;
    } else {
      data = parsed as UserPrefsData;
    }
    if (!data || typeof data !== "object") {
      throw new Error("Unexpected payload shape");
    }
    await this.applyAll(data);
    this.lastSyncedAt = Date.now();
  }
}

export const prefsSync = new PrefsSyncStore();
