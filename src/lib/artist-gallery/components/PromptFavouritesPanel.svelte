<script lang="ts">
  import { promptFavourites } from "../promptFavourites.svelte.js";
  import { generation } from "../../stores/generation.svelte.js";
  import { locale } from "../../stores/locale.svelte.js";
  import { cleanPromptDisplay } from "../../utils/promptClean.js";

  let search = $state("");
  const filtered = $derived(promptFavourites.entries.filter((e) => {
    const q = search.trim().toLowerCase();
    return !q || e.positive.toLowerCase().includes(q) || e.negative.toLowerCase().includes(q);
  }));
  function addGroup() {
    const title = window.prompt(locale.t("prompt_favourites.new_group"));
    if (title) promptFavourites.createGroup(title);
  }
  function derive(entry: any) {
    const positive = window.prompt(locale.t("prompt_favourites.positive_prompt_dialog"), entry.positive);
    if (positive !== null) promptFavourites.deriveEntry(entry.id, { positive });
  }
  function renameGroup(group: any) {
    const title = window.prompt(locale.t("prompt_favourites.rename_group_dialog"), group.title);
    if (title !== null) promptFavourites.renameGroup(group.id, title);
  }
  function deleteGroup(group: any) {
    if (window.confirm(locale.t("prompt_favourites.delete_group_confirm", { title: group.title }))) {
      promptFavourites.deleteGroup(group.id);
    }
  }
  function editEntry(entry: any) {
    const positive = window.prompt(locale.t("prompt_favourites.positive_prompt_dialog"), entry.positive);
    if (positive === null) return;
    const negative = window.prompt(locale.t("prompt_favourites.negative_prompt_dialog"), entry.negative);
    if (negative === null) return;
    promptFavourites.updateEntry(entry.id, { positive, negative });
  }
  function exportLibrary() {
    const blob = new Blob([promptFavourites.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "prompt-favourites.json"; a.click(); URL.revokeObjectURL(url);
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
</script>

<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-100">
  <div class="flex flex-wrap items-center gap-2 border-b border-neutral-800 p-2 sm:p-3">
    <input class="order-first min-w-0 basis-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm sm:flex-1 sm:basis-auto" placeholder={locale.t("prompt_favourites.search_placeholder")} bind:value={search} />
    <div class="flex min-w-0 max-w-full gap-2 overflow-x-auto">
      <button class="shrink-0 rounded border border-indigo-600 px-2 py-1.5 text-xs" onclick={() => promptFavourites.addFromCurrent()}>{locale.t("prompt_favourites.save_current")}</button>
      <button class="shrink-0 rounded border border-neutral-700 px-2 py-1.5 text-xs" onclick={addGroup}>{locale.t("prompt_favourites.new_group")}</button>
      <button class="shrink-0 rounded border border-neutral-700 px-2 py-1.5 text-xs" onclick={exportLibrary}>{locale.t("prompt_favourites.export")}</button>
    </div>
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-4 sm:p-3 space-y-3">
    {#each promptFavourites.groups as group}
      <section class="rounded border border-neutral-800">
        <div class="flex items-center gap-1.5 px-3 py-1.5">
          <button
            type="button"
            class="min-w-0 flex-1 truncate text-left text-sm"
            onclick={() => promptFavourites.toggleGroupCollapsed(group.id)}
          >
            <span class="truncate">{group.title}</span>
            <span class="text-neutral-500">({promptFavourites.entries.filter((e) => e.groupId === group.id).length})</span>
            <span class="ml-1 inline-block w-4 text-center text-neutral-500">{group.collapsed ? "+" : "-"}</span>
          </button>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 text-sm leading-none text-neutral-300 transition-colors hover:border-indigo-500 hover:text-indigo-200 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-[11px]"
            onclick={(e) => { renameGroup(group); showPressTag("rename", locale.t("prompt_favourites.rename_group"), e.currentTarget); }}
          >
            <span class="shrink-0">✎</span>
            <span class="hidden sm:inline">{locale.t("prompt_favourites.rename_group")}</span>
          </button>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 text-sm leading-none text-neutral-300 transition-colors hover:border-red-500 hover:text-red-300 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-[11px]"
            onclick={(e) => { deleteGroup(group); showPressTag("delete", locale.t("prompt_favourites.delete_group"), e.currentTarget); }}
          >
            <span class="shrink-0">🗑</span>
            <span class="hidden sm:inline">{locale.t("prompt_favourites.delete_group")}</span>
          </button>
        </div>
        {#if !group.collapsed}
          <div class="space-y-1 border-t border-neutral-800 p-2">
            {#each filtered.filter((e) => e.groupId === group.id) as entry}
              {@render Entry(entry)}
            {/each}
          </div>
        {/if}
      </section>
    {/each}
    <section>
      <h2 class="mb-2 text-xs font-semibold uppercase text-neutral-500">{locale.t("prompt_favourites.prompt_library")}</h2>
      <div class="space-y-1">
        {#each filtered.filter((e) => !e.groupId) as entry}
          {@render Entry(entry)}
        {/each}
      </div>
    </section>
    <section class="border-t border-neutral-800 pt-3">
      <h2 class="mb-2 text-xs font-semibold uppercase text-neutral-500">{locale.t("prompt_favourites.history")}</h2>
      {#each generation.promptHistory.slice(0, 30) as entry}
        <div class="flex items-center gap-2 border-b border-neutral-900 py-1 text-xs">
          <span class="min-w-0 flex-1 truncate">{cleanPromptDisplay(entry.positivePrompt || entry.negativePrompt)}</span>
          <button
            type="button"
            class="shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-indigo-300 transition-colors hover:border-indigo-500 hover:bg-neutral-700 hover:text-indigo-200"
            onclick={() => promptFavourites.addFromHistory(entry.id)}
          >{locale.t("prompt_favourites.save")}</button>
        </div>
      {/each}
    </section>
  </div>
  {#if pressTag}
    <div
      class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-[11px] text-neutral-100 shadow-xl"
      style="left: {pressTag.x}px; top: {pressTag.y}px;"
    >{pressTag.text}</div>
  {/if}
</div>

{#snippet Entry(entry: any)}
  <div class="flex items-start gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 p-2 transition-colors hover:border-neutral-700">
    <button
      type="button"
      class="min-w-0 flex-1 self-stretch text-left"
      onclick={() => promptFavourites.applyEntry(entry.id)}
    >
      <div class="line-clamp-2 text-xs">{cleanPromptDisplay(entry.positive || locale.t("bottom_panel.empty_prompt"))}</div>
      {#if entry.negative}<div class="mt-1 line-clamp-1 text-[10px] text-neutral-500">{cleanPromptDisplay(entry.negative)}</div>{/if}
    </button>
    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center self-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 text-sm leading-none text-neutral-300 transition-colors hover:border-indigo-500 hover:text-indigo-200 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
      onclick={(e) => { editEntry(entry); showPressTag("edit", locale.t("prompt_favourites.edit"), e.currentTarget); }}
    >
      <span class="shrink-0">✎</span>
      <span class="hidden sm:inline">{locale.t("prompt_favourites.edit")}</span>
    </button>
    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center self-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 text-sm leading-none text-indigo-300 transition-colors hover:border-indigo-500 hover:text-indigo-200 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
      onclick={(e) => { derive(entry); showPressTag("derive", locale.t("prompt_favourites.derive"), e.currentTarget); }}
    >
      <span class="shrink-0">↻</span>
      <span class="hidden sm:inline">{locale.t("prompt_favourites.derive")}</span>
    </button>
    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-md border border-neutral-700 bg-neutral-800 text-base leading-none text-neutral-400 transition-colors hover:border-red-500 hover:bg-red-600/10 hover:text-red-300 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
      onclick={(e) => { promptFavourites.remove(entry.id); showPressTag("remove", locale.t("common.delete"), e.currentTarget); }}
    >
      <span class="shrink-0">×</span>
      <span class="hidden sm:inline">{locale.t("common.delete")}</span>
    </button>
  </div>
{/snippet}
