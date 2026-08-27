<script lang="ts">
  import { promptFavourites, type PromptFavouriteEntry, type PromptFavouriteGroup } from "../promptFavourites.svelte.js";
  import { generation } from "../../stores/generation.svelte.js";
  import { locale } from "../../stores/locale.svelte.js";
  import { cleanPromptDisplay } from "../../utils/promptClean.js";
  import PromptFavouriteEditModal from "./PromptFavouriteEditModal.svelte";

  let search = $state("");
  const filtered = $derived(promptFavourites.entries.filter((e) => {
    const q = search.trim().toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.positive.toLowerCase().includes(q) || e.negative.toLowerCase().includes(q);
  }));

  /** Entry currently open in the edit modal. */
  let editingId = $state<string | null>(null);

  // Inline rename state (keyed by entry id).
  let renamingId = $state<string | null>(null);
  let renameValue = $state("");

  // Import/export UI state.
  let importMode = $state<"merge" | "replace">("merge");
  let status = $state<string | null>(null);
  let statusError = $state<string | null>(null);
  let fileInput: HTMLInputElement | null = $state(null);

  function displayName(entry: PromptFavouriteEntry): string {
    const name = entry.name.trim();
    if (name) return name;
    const body = cleanPromptDisplay(entry.positive).trim();
    return body ? body.slice(0, 60) : locale.t("prompt_favourites.unnamed");
  }

  function startRename(entry: PromptFavouriteEntry) {
    renamingId = entry.id;
    renameValue = entry.name;
  }

  async function commitRename() {
    if (!renamingId) return;
    const id = renamingId;
    renamingId = null;
    await promptFavourites.rename(id, renameValue.trim());
  }

  async function addGroup() {
    const title = window.prompt(locale.t("prompt_favourites.new_group"));
    if (title) await promptFavourites.createGroup(title);
  }
  async function derive(entry: PromptFavouriteEntry) {
    const positive = window.prompt(locale.t("prompt_favourites.positive_prompt_dialog"), entry.positive);
    if (positive !== null) await promptFavourites.deriveEntry(entry.id, { positive });
  }
  async function renameGroup(group: PromptFavouriteGroup) {
    const title = window.prompt(locale.t("prompt_favourites.rename_group_dialog"), group.title);
    if (title !== null) await promptFavourites.renameGroup(group.id, title);
  }
  async function deleteGroup(group: PromptFavouriteGroup) {
    if (window.confirm(locale.t("prompt_favourites.delete_group_confirm", { title: group.title }))) {
      await promptFavourites.deleteGroup(group.id);
    }
  }
  async function moveEntry(entry: PromptFavouriteEntry, groupId: string) {
    await promptFavourites.setEntryGroup(entry.id, groupId || null);
  }
  async function copyEntry(entry: PromptFavouriteEntry, el: HTMLElement) {
    const ok = await promptFavourites.copyToClipboard(entry.id);
    showPressTag("copy", locale.t(ok ? "prompt_favourites.copied" : "prompt_favourites.copy"), el);
  }

  // ---------------------------------------------------------------------------
  // Export / import — Tauri gets a native save dialog, browser mode a download.
  // ---------------------------------------------------------------------------

  const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  async function exportLibrary() {
    status = null;
    statusError = null;
    const json = promptFavourites.exportJSON();
    const defaultName = `mooshieui-prompt-favourites-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({ defaultPath: defaultName, filters: [{ name: "JSON", extensions: ["json"] }] });
        if (!path) return;
        await writeTextFile(path, json);
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      statusError = e instanceof Error ? e.message : String(e);
    }
  }

  async function importLibrary() {
    status = null;
    statusError = null;
    try {
      if (isTauri()) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const selected = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
        if (!selected || typeof selected !== "string") return;
        await applyImport(await readTextFile(selected));
      } else {
        fileInput?.click();
      }
    } catch (e) {
      statusError = e instanceof Error ? e.message : String(e);
    }
  }

  async function onFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await applyImport(await file.text());
    } catch (err) {
      statusError = err instanceof Error ? err.message : String(err);
    }
  }

  async function applyImport(raw: string) {
    try {
      const count = await promptFavourites.importJSON(raw, importMode);
      status = locale.t("prompt_favourites.imported", { count });
      statusError = null;
    } catch (e) {
      statusError = e instanceof Error ? e.message : String(e);
    }
  }

  /** Transient label shown above an icon button when tapped (mobile UX). */
  let pressTag = $state<{ id: string; text: string; x: number; y: number } | null>(null);
  let pressTagTimer: number | null = null;
  function showPressTag(id: string, text: string, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    pressTag = { id, text, x: r.left + r.width / 2, y: r.top - 8 };
    if (pressTagTimer !== null) window.clearTimeout(pressTagTimer);
    pressTagTimer = window.setTimeout(() => { pressTag = null; }, 1100);
  }

  // Shared button styling, kept as constants so every control in the panel
  // stays visually identical (Tailwind still scans these string literals).
  const BTN_PRIMARY =
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 cursor-pointer";
  const BTN_SECONDARY =
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/70 px-2.5 py-1.5 text-[11px] font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-neutral-100 cursor-pointer";
  const BTN_ICON =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800/70 text-neutral-400 transition-colors hover:border-indigo-500/60 hover:bg-neutral-700 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-800/70 disabled:hover:text-neutral-400 cursor-pointer";
  const BTN_ICON_DANGER =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800/70 text-neutral-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300 cursor-pointer";
</script>

<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-100">
  <div class="flex flex-col gap-2 border-b border-neutral-800 bg-neutral-900/30 p-2 sm:flex-row sm:items-center sm:p-3">
    <div class="relative min-w-0 sm:flex-1">
      <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500">
        {@render IconSearch()}
      </span>
      <input
        class="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-1.5 pl-8 pr-3 text-xs text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:border-indigo-500"
        placeholder={locale.t("prompt_favourites.search_placeholder")}
        bind:value={search}
      />
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <button type="button" class={BTN_PRIMARY} onclick={() => promptFavourites.addFromCurrent()}>
        {@render IconPlus()}
        <span>{locale.t("prompt_favourites.save_current")}</span>
      </button>
      <button type="button" class={BTN_SECONDARY} onclick={addGroup}>
        {@render IconFolderPlus()}
        <span>{locale.t("prompt_favourites.new_group")}</span>
      </button>
      <span class="hidden h-5 w-px bg-neutral-800 sm:block"></span>
      <button type="button" class={BTN_ICON} title={locale.t("prompt_favourites.export")} aria-label={locale.t("prompt_favourites.export")} onclick={exportLibrary}>
        {@render IconDownload()}
      </button>
      <button type="button" class={BTN_ICON} title={locale.t("prompt_favourites.import")} aria-label={locale.t("prompt_favourites.import")} onclick={importLibrary}>
        {@render IconUpload()}
      </button>
      <div
        role="group"
        aria-label={locale.t("prompt_favourites.import_mode")}
        title={locale.t("prompt_favourites.import_mode")}
        class="flex items-center gap-0.5 rounded-lg border border-neutral-800 bg-neutral-900/70 p-0.5"
      >
        <button
          type="button"
          class="cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors {importMode === 'merge' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}"
          aria-pressed={importMode === "merge"}
          onclick={() => (importMode = "merge")}
        >{locale.t("prompt_favourites.import_mode_merge")}</button>
        <button
          type="button"
          class="cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors {importMode === 'replace' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}"
          aria-pressed={importMode === "replace"}
          onclick={() => (importMode = "replace")}
        >{locale.t("prompt_favourites.import_mode_replace")}</button>
      </div>
    </div>
    <!-- Hidden file input used only in browser mode -->
    <input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" onchange={onFilePicked} />
  </div>

  {#if status || statusError || promptFavourites.lastError}
    <div class="border-b border-neutral-800 px-2 py-1.5 text-[11px] sm:px-3">
      {#if statusError || promptFavourites.lastError}
        <span class="text-red-400">{statusError ?? promptFavourites.lastError}</span>
      {:else}
        <span class="text-neutral-400">{status}</span>
      {/if}
    </div>
  {/if}

  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-4 sm:p-3 space-y-3">
    {#if promptFavourites.loading}
      <p class="text-xs text-neutral-500">{locale.t("prompt_favourites.loading")}</p>
    {/if}
    {#each promptFavourites.groups as group}
      <section class="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/30">
        <div class="flex items-center gap-1.5 px-2 py-1.5 sm:px-3">
          <button
            type="button"
            class="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            aria-expanded={!group.collapsed}
            onclick={() => promptFavourites.toggleGroupCollapsed(group.id)}
          >
            <span class="shrink-0 text-neutral-500 transition-transform duration-150 group-hover:text-neutral-300 {group.collapsed ? '-rotate-90' : ''}">
              {@render IconChevronDown()}
            </span>
            <span class="truncate text-xs font-semibold text-neutral-200">{group.title}</span>
            <span class="shrink-0 rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
              {promptFavourites.entries.filter((e) => e.groupId === group.id).length}
            </span>
          </button>
          <button
            type="button"
            class={BTN_ICON}
            title={locale.t("prompt_favourites.rename_group")}
            aria-label={locale.t("prompt_favourites.rename_group")}
            onclick={(e) => { void renameGroup(group); showPressTag("rename", locale.t("prompt_favourites.rename_group"), e.currentTarget); }}
          >
            {@render IconPencil()}
          </button>
          <button
            type="button"
            class={BTN_ICON_DANGER}
            title={locale.t("prompt_favourites.delete_group")}
            aria-label={locale.t("prompt_favourites.delete_group")}
            onclick={(e) => { void deleteGroup(group); showPressTag("delete", locale.t("prompt_favourites.delete_group"), e.currentTarget); }}
          >
            {@render IconTrash()}
          </button>
        </div>
        {#if !group.collapsed}
          <div class="space-y-1.5 border-t border-neutral-800 p-2">
            {#each filtered.filter((e) => e.groupId === group.id) as entry}
              {@render Entry(entry)}
            {/each}
          </div>
        {/if}
      </section>
    {/each}
    <section>
      <h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{locale.t("prompt_favourites.prompt_library")}</h2>
      <div class="space-y-1.5">
        {#each filtered.filter((e) => !e.groupId) as entry}
          {@render Entry(entry)}
        {/each}
      </div>
    </section>
    <section class="border-t border-neutral-800 pt-3">
      <h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{locale.t("prompt_favourites.history")}</h2>
      <div class="space-y-1">
        {#each generation.promptHistory.slice(0, 30) as entry}
          <div class="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-xs transition-colors hover:border-neutral-800 hover:bg-neutral-900/50">
            <span class="min-w-0 flex-1 truncate text-neutral-300">{cleanPromptDisplay(entry.positivePrompt || entry.negativePrompt)}</span>
            <button
              type="button"
              class={BTN_SECONDARY}
              onclick={() => promptFavourites.addFromHistory(entry.id)}
            >
              {@render IconPlus()}
              <span>{locale.t("prompt_favourites.save")}</span>
            </button>
          </div>
        {/each}
      </div>
    </section>
  </div>
  {#if pressTag}
    <div
      class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-[11px] text-neutral-100 shadow-xl"
      style="left: {pressTag.x}px; top: {pressTag.y}px;"
    >{pressTag.text}</div>
  {/if}
</div>

{#if editingId}
  {#key editingId}
    <PromptFavouriteEditModal entryId={editingId} onclose={() => (editingId = null)} />
  {/key}
{/if}

{#snippet Entry(entry: PromptFavouriteEntry)}
  <div class="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-2 transition-colors hover:border-neutral-700 sm:flex-row sm:items-center sm:gap-2">
    <div class="min-w-0 flex-1 self-stretch">
      {#if renamingId === entry.id}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          autofocus
          class="mb-1 w-full rounded-md border border-indigo-500 bg-neutral-800 px-1.5 py-1 text-xs text-neutral-100 outline-none"
          bind:value={renameValue}
          placeholder={locale.t("prompt_favourites.name_placeholder")}
          onblur={() => void commitRename()}
          onkeydown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
            else if (e.key === "Escape") { e.preventDefault(); renamingId = null; }
          }}
        />
      {:else}
        <button
          type="button"
          class="mb-1 block max-w-full cursor-pointer truncate text-left text-[11px] font-medium text-neutral-400 transition-colors hover:text-indigo-300"
          title={locale.t("prompt_favourites.name")}
          onclick={() => startRename(entry)}
        >{displayName(entry)}</button>
      {/if}
      <button
        type="button"
        class="block w-full cursor-pointer text-left"
        onclick={() => promptFavourites.applyEntry(entry.id)}
      >
        <div class="line-clamp-2 text-xs text-neutral-200">{cleanPromptDisplay(entry.positive || locale.t("bottom_panel.empty_prompt"))}</div>
        {#if entry.negative}<div class="mt-1 line-clamp-1 text-[10px] text-neutral-500">{cleanPromptDisplay(entry.negative)}</div>{/if}
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap">
      <!-- Reorder + copy grouped into one segmented control. -->
      <div class="flex items-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800/70">
        <button
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title={locale.t("prompt_favourites.move_up")}
          aria-label={locale.t("prompt_favourites.move_up")}
          disabled={!promptFavourites.canMoveUp(entry.id)}
          onclick={(e) => { void promptFavourites.moveUp(entry.id); showPressTag("up", locale.t("prompt_favourites.move_up"), e.currentTarget); }}
        >{@render IconArrowUp()}</button>
        <span class="h-5 w-px bg-neutral-700"></span>
        <button
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title={locale.t("prompt_favourites.move_down")}
          aria-label={locale.t("prompt_favourites.move_down")}
          disabled={!promptFavourites.canMoveDown(entry.id)}
          onclick={(e) => { void promptFavourites.moveDown(entry.id); showPressTag("down", locale.t("prompt_favourites.move_down"), e.currentTarget); }}
        >{@render IconArrowDown()}</button>
        <span class="h-5 w-px bg-neutral-700"></span>
        <button
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-indigo-300"
          title={locale.t("prompt_favourites.copy")}
          aria-label={locale.t("prompt_favourites.copy")}
          onclick={(e) => void copyEntry(entry, e.currentTarget)}
        >{@render IconCopy()}</button>
      </div>
      <button
        type="button"
        class={BTN_ICON}
        title={locale.t("prompt_favourites.derive")}
        aria-label={locale.t("prompt_favourites.derive")}
        onclick={(e) => { void derive(entry); showPressTag("derive", locale.t("prompt_favourites.derive"), e.currentTarget); }}
      >{@render IconRefresh()}</button>
      <button
        type="button"
        class={BTN_ICON}
        title={locale.t("prompt_favourites.edit")}
        aria-label={locale.t("prompt_favourites.edit")}
        onclick={() => (editingId = entry.id)}
      >{@render IconPencil()}</button>
      <select
        aria-label={locale.t("prompt_favourites.group")}
        title={locale.t("prompt_favourites.group")}
        class="h-8 min-w-0 flex-1 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800/70 px-2 text-[11px] text-neutral-300 outline-none transition-colors hover:border-neutral-600 hover:bg-neutral-700 focus:border-indigo-500 sm:max-w-32 sm:flex-none"
        value={entry.groupId ?? ""}
        onchange={(e) => moveEntry(entry, e.currentTarget.value)}
      >
        <option value="">{locale.t("prompt_favourites.no_group")}</option>
        {#each promptFavourites.groups as group (group.id)}
          <option value={group.id}>{group.title}</option>
        {/each}
      </select>
      <button
        type="button"
        class={BTN_ICON_DANGER}
        title={locale.t("common.delete")}
        aria-label={locale.t("common.delete")}
        onclick={(e) => { void promptFavourites.remove(entry.id); showPressTag("remove", locale.t("common.delete"), e.currentTarget); }}
      >{@render IconTrash()}</button>
    </div>
  </div>
{/snippet}

<!-- Inline icon snippets: 14px stroke icons matching the rest of the app. -->
{#snippet IconSearch()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
{/snippet}

{#snippet IconPlus()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
{/snippet}

{#snippet IconFolderPlus()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" /><path d="M12 10v6" /><path d="M9 13h6" /></svg>
{/snippet}

{#snippet IconDownload()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
{/snippet}

{#snippet IconUpload()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
{/snippet}

{#snippet IconChevronDown()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
{/snippet}

{#snippet IconPencil()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
{/snippet}

{#snippet IconTrash()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
{/snippet}

{#snippet IconArrowUp()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5" /><polyline points="5 12 12 5 19 12" /></svg>
{/snippet}

{#snippet IconArrowDown()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14" /><polyline points="19 12 12 19 5 12" /></svg>
{/snippet}

{#snippet IconCopy()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
{/snippet}

{#snippet IconRefresh()}
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" /></svg>
{/snippet}
