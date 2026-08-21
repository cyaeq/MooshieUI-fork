<script lang="ts">
  import { onMount } from "svelte";
  import { browseDirectory, type DirectoryEntry, type DirectoryListing } from "../../utils/api.js";
  import { locale } from "../../stores/locale.svelte.js";

  interface Props {
    title: string;
    initialPath?: string;
    onselect: (path: string) => void;
    oncancel: () => void;
  }

  let { title, initialPath = "", onselect, oncancel }: Props = $props();
  let listing = $state<DirectoryListing | null>(null);
  let pathInput = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let history = $state<string[]>([]);
  let historyIndex = $state(-1);

  function pathLabel(path: string) {
    if (path === "/") return "/";
    return path.replace(/[\\/]$/, "");
  }

  async function load(path?: string, pushHistory = true) {
    loading = true;
    error = null;
    listing = null;
    try {
      const next = await browseDirectory(path);
      listing = next;
      pathInput = next.current_path ?? "";
      const current = next.current_path ?? "";
      if (pushHistory && current && history[historyIndex] !== current) {
        history = [...history.slice(0, historyIndex + 1), current];
        historyIndex = history.length - 1;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function goHistory(delta: number) {
    const nextIndex = historyIndex + delta;
    if (nextIndex < 0 || nextIndex >= history.length) return;
    historyIndex = nextIndex;
    void load(history[nextIndex], false);
  }

  function submitPath(event: SubmitEvent) {
    event.preventDefault();
    void load(pathInput.trim() || undefined);
  }

  function choose(entry: DirectoryEntry) {
    onselect(entry.path);
  }

  onMount(async () => {
    await load(initialPath.trim() || undefined);
    if (!listing && initialPath.trim()) await load();
  });
</script>

<div
  class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-5"
  role="presentation"
  onclick={(event) => { if (event.target === event.currentTarget) oncancel(); }}
  onkeydown={(event) => { if (event.key === "Escape") oncancel(); }}
>
  <div class="flex max-h-[min(760px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="server-directory-picker-title" tabindex="-1">
    <div class="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
      <h3 id="server-directory-picker-title" class="truncate text-sm font-medium text-neutral-100">{title}</h3>
      <button type="button" class="h-8 w-8 shrink-0 rounded border border-neutral-700 text-lg leading-none text-neutral-400 hover:border-neutral-500 hover:text-neutral-100" title={locale.t("common.close")} aria-label={locale.t("common.close")} onclick={oncancel}>&#215;</button>
    </div>

    <div class="flex flex-wrap items-center gap-1 border-b border-neutral-800 px-3 py-2">
      <button type="button" class="h-8 w-8 rounded border border-neutral-700 text-sm text-neutral-300 hover:border-indigo-500 disabled:opacity-35" disabled={historyIndex <= 0 || loading} title={locale.t("common.back")} aria-label={locale.t("common.back")} onclick={() => goHistory(-1)}>&lsaquo;</button>
      <button type="button" class="h-8 w-8 rounded border border-neutral-700 text-sm text-neutral-300 hover:border-indigo-500 disabled:opacity-35" disabled={historyIndex < 0 || historyIndex >= history.length - 1 || loading} title={locale.t("common.forward")} aria-label={locale.t("common.forward")} onclick={() => goHistory(1)}>&rsaquo;</button>
      <button type="button" class="h-8 w-8 rounded border border-neutral-700 text-sm text-neutral-300 hover:border-indigo-500 disabled:opacity-35" disabled={!listing?.parent_path || loading} title={locale.t("settings.paths.directory_picker.parent")} aria-label={locale.t("settings.paths.directory_picker.parent")} onclick={() => void load(listing?.parent_path ?? undefined)}>&uarr;</button>
      <div class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-1 text-xs text-neutral-400">
        {#each listing?.breadcrumbs ?? [] as crumb, index}
          <button type="button" class="rounded px-1.5 py-1 hover:bg-neutral-800 hover:text-indigo-300" onclick={() => void load(crumb.path)}>{index ? "/ " : ""}{crumb.name}</button>
        {/each}
      </div>
      <button type="button" class="h-8 rounded border border-neutral-700 px-2 text-xs text-neutral-300 hover:border-indigo-500 disabled:opacity-35" disabled={loading} title={locale.t("common.refresh")} aria-label={locale.t("common.refresh")} onclick={() => void load(listing?.current_path ?? undefined, false)}>&#8635;</button>
    </div>

    <form class="flex gap-2 border-b border-neutral-800 p-3" onsubmit={submitPath}>
      <input class="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:border-indigo-500 focus:outline-none" bind:value={pathInput} spellcheck="false" placeholder={locale.t("settings.paths.directory_picker.path_placeholder")} />
      <button type="submit" class="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:border-indigo-500 disabled:opacity-40" disabled={loading}>{locale.t("common.confirm")}</button>
    </form>

    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[180px_minmax(0,1fr)]">
      <aside class="flex gap-1 overflow-x-auto border-b border-neutral-800 p-2 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
        <p class="hidden px-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500 sm:block">{locale.t("settings.paths.directory_picker.locations")}</p>
        {#each listing?.locations ?? [] as location}
          <button type="button" class="shrink-0 rounded px-2 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 hover:text-indigo-300" onclick={() => void load(location.path)}>{pathLabel(location.name)}</button>
        {/each}
      </aside>

      <main class="min-h-0 overflow-y-auto p-2">
        {#if loading}
          <div class="flex h-48 items-center justify-center text-xs text-neutral-500">{locale.t("common.loading")}</div>
        {:else if listing && listing.entries.length === 0}
          <div class="flex h-48 items-center justify-center text-xs text-neutral-500">{locale.t("settings.paths.directory_picker.no_subdirectories")}</div>
        {:else}
          <div class="grid grid-cols-1 gap-1 md:grid-cols-2">
            {#each listing?.entries ?? [] as entry}
              <div class="group flex min-w-0 items-center gap-2 rounded border border-transparent px-2 py-1.5 hover:border-neutral-700 hover:bg-neutral-800">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-neutral-300 hover:text-indigo-300" title={entry.path} onclick={() => void load(entry.path)}>
                  <span class="shrink-0 text-amber-400">&#128193;</span>
                  <span class="truncate">{entry.name}</span>
                </button>
                <button type="button" class="shrink-0 rounded border border-neutral-700 px-2 py-1 text-[10px] text-neutral-400 opacity-100 transition-opacity hover:border-indigo-500 hover:text-indigo-300 sm:opacity-0 sm:group-hover:opacity-100" title={entry.path} onclick={() => choose(entry)}>{locale.t("common.select")}</button>
              </div>
            {/each}
          </div>
        {/if}
      </main>
    </div>

    {#if error}
      <div class="flex items-start justify-between gap-3 border-t border-red-900/60 bg-red-950/40 px-4 py-2 text-xs text-red-300"><span class="break-all">{error}</span><button type="button" class="shrink-0 underline" onclick={() => void load()}>{locale.t("common.retry")}</button></div>
    {/if}

    <div class="flex items-center justify-between gap-3 border-t border-neutral-800 px-4 py-3">
      <span class="min-w-0 truncate text-[11px] text-neutral-500" title={listing?.current_path ?? ""}>{listing?.current_path ? pathLabel(listing.current_path) : ""}</span>
      <div class="flex shrink-0 gap-2">
        <button type="button" class="rounded border border-neutral-700 px-4 py-2 text-xs text-neutral-300 hover:border-neutral-500" onclick={oncancel}>{locale.t("common.cancel")}</button>
        <button type="button" class="rounded bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40" disabled={!listing?.current_path || loading} onclick={() => { if (listing?.current_path) onselect(listing.current_path); }}>{locale.t("common.confirm")}</button>
      </div>
    </div>
  </div>
</div>
