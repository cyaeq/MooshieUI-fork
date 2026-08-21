import { triggerSync } from "../utils/syncTrigger.js";
import { generation } from "../stores/generation.svelte.js";

const STORAGE_KEY = "mooshieui.promptFavourites.v1";
const MIGRATION_KEY = "mooshieui.promptFavourites.migrated.v1";

export interface PromptFavouriteEntry {
  id: string;
  positive: string;
  negative: string;
  mode: string;
  stylePreset: string;
  createdAt: number;
  groupId: string | null;
}
export interface PromptFavouriteGroup {
  id: string;
  title: string;
  collapsed: boolean;
  createdAt: number;
}

function id(prefix: string) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

class PromptFavouritesStore {
  entries = $state<PromptFavouriteEntry[]>([]);
  groups = $state<PromptFavouriteGroup[]>([]);

  constructor() { this.load(); }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.hydrate(JSON.parse(raw));
      this.migrateHistory();
    } catch (e) { console.error("prompt favourites: load failed", e); }
  }
  private hydrate(data: any) {
    const groups: PromptFavouriteGroup[] = Array.isArray(data?.groups) ? data.groups.filter((g: any) => g?.id && g?.title).map((g: any) => ({ id: String(g.id), title: String(g.title), collapsed: !!g.collapsed, createdAt: Number(g.createdAt) || Date.now() })) : [];
    const ids = new Set(groups.map((g) => g.id));
    const entries = Array.isArray(data?.entries) ? data.entries.filter((e: any) => e?.id).map((e: any) => ({ id: String(e.id), positive: String(e.positive ?? ""), negative: String(e.negative ?? ""), mode: String(e.mode ?? "image"), stylePreset: String(e.stylePreset ?? "none"), createdAt: Number(e.createdAt) || Date.now(), groupId: ids.has(e.groupId) ? e.groupId : null })) : [];
    this.groups = groups; this.entries = entries;
  }
  private save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: this.entries, groups: this.groups })); triggerSync(); }
  private migrateHistory() {
    if (localStorage.getItem(MIGRATION_KEY)) return;
    const old = generation.promptHistory.filter((e: any) => e.favorite);
    for (const e of old) this.add({ positive: e.positivePrompt, negative: e.negativePrompt, mode: e.mode, stylePreset: e.stylePreset }, false);
    localStorage.setItem(MIGRATION_KEY, "1");
    if (old.length) this.save();
  }
  private add(data: Omit<PromptFavouriteEntry, "id" | "createdAt" | "groupId">, persist = true) {
    if (this.isFavourited(data.positive, data.negative, data.mode)) return this.entries.find((e) => e.positive === data.positive && e.negative === data.negative && e.mode === data.mode) ?? null;
    const entry = { ...data, id: id("prompt"), createdAt: Date.now(), groupId: null };
    this.entries = [entry, ...this.entries]; if (persist) this.save(); return entry;
  }
  addFromCurrent() { return this.add({ positive: generation.positivePrompt, negative: generation.negativePrompt, mode: generation.mode, stylePreset: generation.stylePreset }); }
  addFromHistory(historyId: string) { const e = generation.promptHistory.find((x) => x.id === historyId); return e ? this.add({ positive: e.positivePrompt, negative: e.negativePrompt, mode: e.mode, stylePreset: e.stylePreset }) : null; }
  isFavourited(positive: string, negative?: string, mode?: string): boolean { return this.entries.some((e) => e.positive === positive && e.negative === (negative ?? "") && e.mode === (mode ?? "image")); }
  applyEntry(entryId: string) { const e = this.entries.find((x) => x.id === entryId); if (e) generation.applyPromptEntry(e); }
  remove(id_: string) { this.entries = this.entries.filter((e) => e.id !== id_); this.save(); }
  createGroup(title: string) { const g = { id: id("group"), title: title.trim() || "Group", collapsed: false, createdAt: Date.now() }; this.groups = [...this.groups, g]; this.save(); return g; }
  renameGroup(id_: string, title: string) { this.groups = this.groups.map((g) => g.id === id_ ? { ...g, title: title.trim() || g.title } : g); this.save(); }
  deleteGroup(id_: string) { this.groups = this.groups.filter((g) => g.id !== id_); this.entries = this.entries.map((e) => e.groupId === id_ ? { ...e, groupId: null } : e); this.save(); }
  setEntryGroup(entryId: string, groupId: string | null) { this.entries = this.entries.map((e) => e.id === entryId ? { ...e, groupId } : e); this.save(); }
  updateEntry(entryId: string, patch: Partial<Omit<PromptFavouriteEntry, "id" | "createdAt">>) { this.entries = this.entries.map((e) => e.id === entryId ? { ...e, ...patch } : e); this.save(); }
  deriveEntry(entryId: string, patch: Partial<Pick<PromptFavouriteEntry, "positive" | "negative" | "mode" | "stylePreset">>) { const base = this.entries.find((e) => e.id === entryId); if (!base) return null; const entry = { ...base, ...patch, id: id("prompt"), createdAt: Date.now() }; this.entries = [entry, ...this.entries]; this.save(); return entry; }
  toggleGroupCollapsed(groupId: string) { this.groups = this.groups.map((g) => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g); this.save(); }
  collectPrefs() { return { version: 1, entries: this.entries, groups: this.groups }; }
  applyServerPrefs(data: any) { this.hydrate(data); this.save(); }
  exportJSON() { return JSON.stringify({ kind: "mooshieui.prompt-favourites", ...this.collectPrefs() }, null, 2); }
  importJSON(raw: string) { const data = JSON.parse(raw); if (data?.kind !== "mooshieui.prompt-favourites") throw new Error("Not a prompt favourites export"); this.hydrate(data); this.save(); }
}
export const promptFavourites = new PromptFavouritesStore();
