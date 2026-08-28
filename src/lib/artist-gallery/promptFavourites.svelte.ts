import { triggerSync } from "../utils/syncTrigger.js";
import { generation } from "../stores/generation.svelte.js";
import {
  deletePromptFavourite,
  deletePromptFavouriteGroup,
  importPromptFavourites,
  listPromptFavourites,
  reorderPromptFavourites,
  setPromptFavouriteGroup,
  upsertPromptFavourite,
  upsertPromptFavouriteGroup,
  type PromptFavouriteGroupRecord,
  type PromptFavouriteRecord,
  type PromptFavouritesSnapshot,
} from "../utils/api.js";

/** Legacy browser-side library, kept as a read fallback after the SQLite move. */
const STORAGE_KEY = "mooshieui.promptFavourites.v1";
/** Marks the one-time import of `generation.promptHistory` favourites. */
const MIGRATION_KEY = "mooshieui.promptFavourites.migrated.v1";
/** Marks the one-time lift of the localStorage library into SQLite. */
const SQLITE_MIGRATION_KEY = "mooshieui.promptFavourites.sqlite.migrated.v1";
/** UI preference (not library content): how a card click applies a prompt. */
const APPLY_MODE_KEY = "mooshieui.promptFavourites.applyMode";

export interface PromptFavouriteEntry {
  id: string;
  name: string;
  positive: string;
  negative: string;
  mode: string;
  stylePreset: string;
  createdAt: number;
  sortOrder: number;
  groupId: string | null;
}
export interface PromptFavouriteGroup {
  id: string;
  title: string;
  collapsed: boolean;
  createdAt: number;
  sortOrder: number;
}

export const PROMPT_FAVOURITES_EXPORT_KIND = "mooshieui.prompt-favourites";

export type PromptFavouriteApplyMode = "replace" | "merge";

function id(prefix: string) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

function toEntry(r: PromptFavouriteRecord): PromptFavouriteEntry {
  return {
    id: r.id,
    name: r.name ?? "",
    positive: r.positive ?? "",
    negative: r.negative ?? "",
    mode: r.mode ?? "image",
    stylePreset: r.style_preset ?? "none",
    createdAt: Number(r.created_at) || Date.now(),
    sortOrder: Number(r.sort_order) || 0,
    groupId: r.group_id ?? null,
  };
}

function toRecord(e: PromptFavouriteEntry): PromptFavouriteRecord {
  return {
    id: e.id,
    name: e.name,
    positive: e.positive,
    negative: e.negative,
    mode: e.mode,
    style_preset: e.stylePreset,
    created_at: e.createdAt,
    sort_order: e.sortOrder,
    group_id: e.groupId,
  };
}

function toGroup(r: PromptFavouriteGroupRecord): PromptFavouriteGroup {
  return {
    id: r.id,
    title: r.title ?? "",
    collapsed: !!r.collapsed,
    createdAt: Number(r.created_at) || Date.now(),
    sortOrder: Number(r.sort_order) || 0,
  };
}

function toGroupRecord(g: PromptFavouriteGroup): PromptFavouriteGroupRecord {
  return {
    id: g.id,
    title: g.title,
    collapsed: g.collapsed,
    created_at: g.createdAt,
    sort_order: g.sortOrder,
  };
}

/** Normalise arbitrary JSON (legacy localStorage, imported file) into a snapshot. */
function parseSnapshot(data: any): PromptFavouritesSnapshot {
  const groups: PromptFavouriteGroupRecord[] = Array.isArray(data?.groups)
    ? data.groups
        .filter((g: any) => g?.id)
        .map((g: any, index: number) => ({
          id: String(g.id),
          title: String(g.title ?? ""),
          collapsed: !!g.collapsed,
          created_at: Number(g.createdAt ?? g.created_at) || Date.now(),
          sort_order: Number(g.sortOrder ?? g.sort_order ?? index) || 0,
        }))
    : [];
  const groupIds = new Set(groups.map((g) => g.id));
  const entries: PromptFavouriteRecord[] = Array.isArray(data?.entries)
    ? data.entries
        .filter((e: any) => e?.id)
        .map((e: any, index: number) => {
          const groupId = e.groupId ?? e.group_id ?? null;
          return {
            id: String(e.id),
            name: String(e.name ?? ""),
            positive: String(e.positive ?? ""),
            negative: String(e.negative ?? ""),
            mode: String(e.mode ?? "image"),
            style_preset: String(e.stylePreset ?? e.style_preset ?? "none"),
            created_at: Number(e.createdAt ?? e.created_at) || Date.now(),
            sort_order: Number(e.sortOrder ?? e.sort_order ?? index) || 0,
            group_id: groupId && groupIds.has(String(groupId)) ? String(groupId) : null,
          };
        })
    : [];
  return { entries, groups };
}

class PromptFavouritesStore {
  entries = $state<PromptFavouriteEntry[]>([]);
  groups = $state<PromptFavouriteGroup[]>([]);
  loading = $state(false);
  loaded = $state(false);
  /** Last failed backend write, surfaced by the panel. Cleared on next success. */
  lastError = $state<string | null>(null);
  /** How a card click applies a prompt. Persisted in localStorage, not the DB. */
  applyMode = $state<PromptFavouriteApplyMode>("replace");

  constructor() {
    try {
      if (localStorage.getItem(APPLY_MODE_KEY) === "merge") this.applyMode = "merge";
    } catch {
      // localStorage unavailable — keep the default.
    }
  }

  setApplyMode(mode: PromptFavouriteApplyMode) {
    this.applyMode = mode;
    try {
      localStorage.setItem(APPLY_MODE_KEY, mode);
    } catch {
      // Preference stays session-only.
    }
  }

  /** Called once from `App.svelte` alongside the other store loads. */
  async init() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    try {
      let snapshot = await listPromptFavourites();
      snapshot = await this.migrateLegacy(snapshot);
      this.apply(snapshot);
      this.loaded = true;
      this.lastError = null;
    } catch (e) {
      console.error("prompt favourites: load failed", e);
      this.lastError = String(e);
      // Degrade to the legacy library so the panel is not empty when the
      // backend is unreachable.
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.apply(parseSnapshot(JSON.parse(raw)));
      } catch {
        // Nothing recoverable.
      }
    } finally {
      this.loading = false;
    }
  }

  /**
   * One-time lift of the pre-SQLite library into the database: the localStorage
   * payload first, then any `promptHistory` entries still only flagged as
   * `favorite`. Merge mode keeps whatever the DB already holds.
   */
  private async migrateLegacy(
    current: PromptFavouritesSnapshot,
  ): Promise<PromptFavouritesSnapshot> {
    if (localStorage.getItem(SQLITE_MIGRATION_KEY)) return current;
    const legacy: PromptFavouritesSnapshot = { entries: [], groups: [] };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = parseSnapshot(JSON.parse(raw));
        legacy.entries.push(...parsed.entries);
        legacy.groups.push(...parsed.groups);
      }
    } catch (e) {
      console.error("prompt favourites: legacy parse failed", e);
    }
    if (!localStorage.getItem(MIGRATION_KEY)) {
      const now = Date.now();
      const fromHistory = generation.promptHistory.filter((e: any) => e.favorite);
      const offset = legacy.entries.length;
      legacy.entries.push(
        ...fromHistory.map((e: any, index: number) => ({
          id: id("prompt"),
          name: "",
          positive: String(e.positivePrompt ?? ""),
          negative: String(e.negativePrompt ?? ""),
          mode: String(e.mode ?? "image"),
          style_preset: String(e.stylePreset ?? "none"),
          created_at: now - index,
          sort_order: offset + index,
          group_id: null,
        })),
      );
      localStorage.setItem(MIGRATION_KEY, "1");
    }
    if (!legacy.entries.length && !legacy.groups.length) {
      localStorage.setItem(SQLITE_MIGRATION_KEY, "1");
      return current;
    }
    const merged = await importPromptFavourites(legacy, "merge");
    localStorage.setItem(SQLITE_MIGRATION_KEY, "1");
    return merged;
  }

  private apply(snapshot: PromptFavouritesSnapshot) {
    this.groups = (snapshot.groups ?? []).map(toGroup);
    this.entries = (snapshot.entries ?? []).map(toEntry);
    this.mirrorToLocalStorage();
  }

  /**
   * Keeps the legacy key in sync as an offline fallback and feeds the
   * server-side prefs channel. The database stays authoritative.
   */
  private mirrorToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.collectPrefs()));
    } catch {
      // Quota or private mode — the DB still has the data.
    }
    triggerSync();
  }

  /** Runs a backend write, rolling the optimistic UI state back on failure. */
  private async persist(action: () => Promise<void>, rollback: () => void) {
    try {
      await action();
      this.lastError = null;
      this.mirrorToLocalStorage();
    } catch (e) {
      console.error("prompt favourites: write failed", e);
      this.lastError = String(e);
      rollback();
    }
  }

  private snapshotState() {
    return { entries: [...this.entries], groups: [...this.groups] };
  }

  private restore(state: { entries: PromptFavouriteEntry[]; groups: PromptFavouriteGroup[] }) {
    this.entries = state.entries;
    this.groups = state.groups;
  }

  /** Rewrites `sortOrder` from array position and persists the whole order. */
  private async persistOrder(previous: {
    entries: PromptFavouriteEntry[];
    groups: PromptFavouriteGroup[];
  }) {
    this.entries = this.entries.map((e, index) => ({ ...e, sortOrder: index }));
    const ids = this.entries.map((e) => e.id);
    await this.persist(
      () => reorderPromptFavourites(ids),
      () => this.restore(previous),
    );
  }

  private findDuplicate(positive: string, negative: string, mode: string) {
    return (
      this.entries.find(
        (e) => e.positive === positive && e.negative === negative && e.mode === mode,
      ) ?? null
    );
  }

  private async add(
    data: Pick<PromptFavouriteEntry, "positive" | "negative" | "mode" | "stylePreset"> & {
      name?: string;
    },
  ): Promise<PromptFavouriteEntry | null> {
    const existing = this.findDuplicate(data.positive, data.negative, data.mode);
    if (existing) return existing;
    const entry: PromptFavouriteEntry = {
      id: id("prompt"),
      name: data.name ?? "",
      positive: data.positive,
      negative: data.negative,
      mode: data.mode,
      stylePreset: data.stylePreset,
      createdAt: Date.now(),
      sortOrder: 0,
      groupId: null,
    };
    const previous = this.snapshotState();
    this.entries = [entry, ...this.entries];
    await this.persist(
      () => upsertPromptFavourite(toRecord(entry)),
      () => this.restore(previous),
    );
    if (this.lastError) return null;
    await this.persistOrder(this.snapshotState());
    return entry;
  }

  async addFromCurrent() {
    return this.add({
      positive: generation.positivePrompt,
      negative: generation.negativePrompt,
      mode: generation.mode,
      stylePreset: generation.stylePreset,
    });
  }

  async addFromHistory(historyId: string) {
    const e = generation.promptHistory.find((x) => x.id === historyId);
    if (!e) return null;
    return this.add({
      positive: e.positivePrompt,
      negative: e.negativePrompt,
      mode: e.mode,
      stylePreset: e.stylePreset,
    });
  }

  isFavourited(positive: string, negative?: string, mode?: string): boolean {
    return !!this.findDuplicate(positive, negative ?? "", mode ?? "image");
  }

  /** Removes the entry matching a prompt body, for the ★ toggle. */
  async removeByPrompt(positive: string, negative?: string, mode?: string) {
    const match = this.findDuplicate(positive, negative ?? "", mode ?? "image");
    if (match) await this.remove(match.id);
  }

  /** Star toggle used by the history rows: add when absent, remove when present. */
  async toggleFromHistory(historyId: string) {
    const e = generation.promptHistory.find((x) => x.id === historyId);
    if (!e) return;
    const match = this.findDuplicate(
      e.positivePrompt ?? "",
      e.negativePrompt ?? "",
      e.mode ?? "image",
    );
    if (match) await this.remove(match.id);
    else await this.addFromHistory(historyId);
  }

  /** Returns the number of tags added in merge mode, `null` when replacing. */
  applyEntry(entryId: string, override?: PromptFavouriteApplyMode): number | null {
    const e = this.entries.find((x) => x.id === entryId);
    if (!e) return null;
    const mode = override ?? this.applyMode;
    if (mode === "merge") return generation.mergePromptEntry(e);
    generation.applyPromptEntry(e);
    return null;
  }

  async remove(entryId: string) {
    const previous = this.snapshotState();
    this.entries = this.entries.filter((e) => e.id !== entryId);
    await this.persist(
      () => deletePromptFavourite(entryId),
      () => this.restore(previous),
    );
  }

  async createGroup(title: string) {
    const group: PromptFavouriteGroup = {
      id: id("group"),
      title: title.trim() || "Group",
      collapsed: false,
      createdAt: Date.now(),
      sortOrder: this.groups.length,
    };
    const previous = this.snapshotState();
    this.groups = [...this.groups, group];
    await this.persist(
      () => upsertPromptFavouriteGroup(toGroupRecord(group)),
      () => this.restore(previous),
    );
    return this.lastError ? null : group;
  }

  private async patchGroup(groupId: string, patch: Partial<PromptFavouriteGroup>) {
    const previous = this.snapshotState();
    const next = this.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g));
    const updated = next.find((g) => g.id === groupId);
    if (!updated) return;
    this.groups = next;
    await this.persist(
      () => upsertPromptFavouriteGroup(toGroupRecord(updated)),
      () => this.restore(previous),
    );
  }

  async renameGroup(groupId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    await this.patchGroup(groupId, { title: trimmed });
  }

  async toggleGroupCollapsed(groupId: string) {
    const current = this.groups.find((g) => g.id === groupId);
    if (!current) return;
    await this.patchGroup(groupId, { collapsed: !current.collapsed });
  }

  async deleteGroup(groupId: string) {
    const previous = this.snapshotState();
    this.groups = this.groups.filter((g) => g.id !== groupId);
    this.entries = this.entries.map((e) =>
      e.groupId === groupId ? { ...e, groupId: null } : e,
    );
    await this.persist(
      () => deletePromptFavouriteGroup(groupId),
      () => this.restore(previous),
    );
  }

  async setEntryGroup(entryId: string, groupId: string | null) {
    const previous = this.snapshotState();
    this.entries = this.entries.map((e) => (e.id === entryId ? { ...e, groupId } : e));
    await this.persist(
      () => setPromptFavouriteGroup(entryId, groupId),
      () => this.restore(previous),
    );
  }

  async updateEntry(
    entryId: string,
    patch: Partial<Omit<PromptFavouriteEntry, "id" | "createdAt">>,
  ) {
    const previous = this.snapshotState();
    const next = this.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e));
    const updated = next.find((e) => e.id === entryId);
    if (!updated) return;
    this.entries = next;
    await this.persist(
      () => upsertPromptFavourite(toRecord(updated)),
      () => this.restore(previous),
    );
  }

  async rename(entryId: string, name: string) {
    await this.updateEntry(entryId, { name: name.trim() });
  }

  async deriveEntry(
    entryId: string,
    patch: Partial<Pick<PromptFavouriteEntry, "positive" | "negative" | "mode" | "stylePreset">>,
  ) {
    const base = this.entries.find((e) => e.id === entryId);
    if (!base) return null;
    const entry: PromptFavouriteEntry = {
      ...base,
      ...patch,
      id: id("prompt"),
      createdAt: Date.now(),
      sortOrder: 0,
    };
    const previous = this.snapshotState();
    this.entries = [entry, ...this.entries];
    await this.persist(
      () => upsertPromptFavourite(toRecord(entry)),
      () => this.restore(previous),
    );
    if (this.lastError) return null;
    await this.persistOrder(this.snapshotState());
    return entry;
  }

  /** Moves an entry one slot within its own group (ungrouped counts as a group). */
  private async move(entryId: string, direction: -1 | 1) {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const siblings = this.entries.filter((e) => e.groupId === entry.groupId);
    const position = siblings.findIndex((e) => e.id === entryId);
    const target = siblings[position + direction];
    if (!target) return;
    const previous = this.snapshotState();
    const fromIndex = this.entries.findIndex((e) => e.id === entryId);
    const toIndex = this.entries.findIndex((e) => e.id === target.id);
    const next = [...this.entries];
    next[fromIndex] = target;
    next[toIndex] = entry;
    this.entries = next;
    await this.persistOrder(previous);
  }

  async moveUp(entryId: string) {
    await this.move(entryId, -1);
  }

  async moveDown(entryId: string) {
    await this.move(entryId, 1);
  }

  /** False when the entry is the first of its group (arrow button disabled). */
  canMoveUp(entryId: string): boolean {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return false;
    const siblings = this.entries.filter((e) => e.groupId === entry.groupId);
    return siblings.findIndex((e) => e.id === entryId) > 0;
  }

  /** False when the entry is the last of its group. */
  canMoveDown(entryId: string): boolean {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return false;
    const siblings = this.entries.filter((e) => e.groupId === entry.groupId);
    const position = siblings.findIndex((e) => e.id === entryId);
    return position >= 0 && position < siblings.length - 1;
  }

  /** Clipboard copy with a fallback for non-secure contexts. */
  async copyToClipboard(entryId: string): Promise<boolean> {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return false;
    const text = entry.positive;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to the textarea path.
    }
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }

  collectPrefs() {
    return {
      version: 1,
      entries: this.entries.map(toRecord),
      groups: this.groups.map(toGroupRecord),
    };
  }

  /** Server prefs win: replace the stored library, then adopt the result. */
  async applyServerPrefs(data: any) {
    try {
      const snapshot = parseSnapshot(data);
      const result = await importPromptFavourites(snapshot, "replace");
      this.apply(result);
      this.lastError = null;
    } catch (e) {
      console.error("prompt favourites: applyServerPrefs failed", e);
      this.lastError = String(e);
    }
  }

  exportJSON() {
    return JSON.stringify(
      { kind: PROMPT_FAVOURITES_EXPORT_KIND, ...this.collectPrefs() },
      null,
      2,
    );
  }

  async importJSON(raw: string, mode: "merge" | "replace" = "merge") {
    const data = JSON.parse(raw);
    if (data?.kind !== PROMPT_FAVOURITES_EXPORT_KIND) {
      throw new Error("Not a prompt favourites export");
    }
    const snapshot = parseSnapshot(data);
    const result = await importPromptFavourites(snapshot, mode);
    this.apply(result);
    this.lastError = null;
    return result.entries.length;
  }
}
export const promptFavourites = new PromptFavouritesStore();
