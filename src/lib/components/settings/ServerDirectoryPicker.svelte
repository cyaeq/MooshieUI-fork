<script lang="ts">
  import { onMount } from "svelte";
  import { browseDirectory, type DirectoryListing } from "../../utils/api.js";
  import { locale } from "../../stores/locale.svelte.js";

  interface Props {
    title: string;
    initialPath?: string;
    onselect: (path: string) => void;
    oncancel: () => void;
  }

  let { title, initialPath = "", onselect, oncancel }: Props = $props();
  let listing = $state<DirectoryListing | null>(null);
  let pathInput = $state(initialPath);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function load(path?: string) {
    loading = true;
    error = null;
    try {
      listing = await browseDirectory(path);
      pathInput = listing.current_path ?? "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function submitPath(event: SubmitEvent) {
    event.preventDefault();
    void load(pathInput.trim() || undefined);
  }

  onMount(async () => {
    if (initialPath.trim()) {
      await load(initialPath.trim());
      if (!listing) await load();
    } else {
      await load();
    }
  });
</script>

<div
  class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  aria-labelledby="server-directory-picker-title"
  tabindex="-1"
  onclick={(event) => { if (event.target === event.currentTarget) oncancel(); }}
  onkeydown={(event) => { if (event.key === "Escape") oncancel(); }}
>
  <div class="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl">
    <div class="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
      <h3 id="server-directory-picker-title" class="truncate text-sm font-medium text-neutral-100">{title}</h3>
      <button
        type="button"
        class="h-8 w-8 shrink-0 rounded border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
        title={locale.t("common.close")}
        aria-label={locale.t("common.close")}
        onclick={oncancel}
      >&#215;</button>
    </div>

    <form class="flex gap-2 border-b border-neutral-800 p-3" onsubmit={submitPath}>
      <button
        type="button"
        class="h-9 w-9 shrink-0 rounded border border-neutral-700 bg-neutral-800 text-sm text-neutral-300 hover:border-indigo-500 disabled:opacity-40"
        disabled={loading}
        title=".."
        onclick={() => void load(listing?.parent_path ?? undefined)}
      >..</button>
      <input
        class="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:border-indigo-500 focus:outline-none"
        bind:value={pathInput}
        spellcheck="false"
      />
      <button
        type="submit"
        class="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:border-indigo-500 disabled:opacity-40"
        disabled={loading}
      >{locale.t("common.confirm")}</button>
    </form>

    <div class="min-h-48 flex-1 overflow-y-auto p-2">
      {#if loading}
        <div class="flex h-40 items-center justify-center text-xs text-neutral-500">{locale.t("common.loading")}</div>
      {:else}
        <div class="space-y-1">
          {#each listing?.entries ?? [] as entry}
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-indigo-300"
              onclick={() => void load(entry.path)}
            >
              <span class="shrink-0 text-neutral-500">/</span>
              <span class="min-w-0 flex-1 truncate">{entry.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if error}
      <p class="border-t border-red-900/60 bg-red-950/40 px-4 py-2 text-xs text-red-300">{error}</p>
    {/if}

    <div class="flex justify-end gap-2 border-t border-neutral-800 px-4 py-3">
      <button
        type="button"
        class="rounded border border-neutral-700 px-4 py-2 text-xs text-neutral-300 hover:border-neutral-500"
        onclick={oncancel}
      >{locale.t("common.cancel")}</button>
      <button
        type="button"
        class="rounded bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        disabled={!listing?.current_path || loading}
        onclick={() => { if (listing?.current_path) onselect(listing.current_path); }}
      >{locale.t("common.confirm")}</button>
    </div>
  </div>
</div>
