<script lang="ts">
  import { locale } from "../../stores/locale.svelte.js";
  import { prefsSync } from "../../stores/prefsSync.svelte.js";
  import { isBrowserMode } from "../../utils/ipc.js";

  interface Props {
    onOpenSettings?: () => void;
  }
  let { onOpenSettings }: Props = $props();

  let panelOpen = $state(false);
  let message = $state<"uploaded" | "downloaded" | "no_data" | null>(null);
  let transferError = $state<string | null>(null);

  async function upload() {
    if (!isBrowserMode || prefsSync.serverTransfer) return;
    if (!window.confirm(locale.t("settings.sync.upload_confirm"))) return;
    message = null;
    transferError = null;
    try {
      await prefsSync.uploadToServer();
      message = "uploaded";
    } catch (e) {
      transferError = e instanceof Error ? e.message : String(e);
    }
  }

  async function download() {
    if (!isBrowserMode || prefsSync.serverTransfer) return;
    if (!window.confirm(locale.t("settings.sync.download_confirm"))) return;
    message = null;
    transferError = null;
    try {
      message = (await prefsSync.downloadFromServer()) ? "downloaded" : "no_data";
    } catch (e) {
      transferError = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<div class="relative mx-auto">
  <button
    class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative {panelOpen
      ? 'bg-indigo-600 text-white'
      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'} {isBrowserMode
      ? ''
      : 'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-neutral-400'}"
    disabled={!isBrowserMode}
    onclick={() => (panelOpen = !panelOpen)}
    title={isBrowserMode
      ? locale.t("sidebar.sync.title")
      : locale.t("sidebar.sync.desktop_unavailable")}
    aria-label={locale.t("sidebar.sync.title")}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="w-4.5 h-4.5 {prefsSync.serverTransfer ? 'animate-spin' : ''}"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12a9 9 0 0 1-9 9c-4.97 0-9-4.03-9-9a9 9 0 0 1 9-9c2.83 0 5.35 1.3 7 3.34" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  </button>

  {#if panelOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-40"
      onmousedown={() => (panelOpen = false)}
      onkeydown={(e) => { if (e.key === "Escape") panelOpen = false; }}
    ></div>
    <div
      class="absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl z-50"
    >
      <div class="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h3 class="text-sm font-semibold text-neutral-100">{locale.t("sidebar.sync.title")}</h3>
        {#if onOpenSettings}
          <button
            class="text-[11px] text-indigo-400 transition-colors hover:text-indigo-300"
            onclick={() => {
              panelOpen = false;
              onOpenSettings?.();
            }}
          >
            {locale.t("sidebar.sync.open_settings")}
          </button>
        {/if}
      </div>
      <div class="space-y-3 px-4 py-3">
        <p class="text-[11px] text-neutral-500">{locale.t("settings.sync.server_desc")}</p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onclick={upload}
            disabled={prefsSync.serverTransfer !== null}
            class="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-100 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prefsSync.serverTransfer === "upload"
              ? locale.t("settings.sync.uploading")
              : locale.t("settings.sync.upload_button")}
          </button>
          <button
            type="button"
            onclick={download}
            disabled={prefsSync.serverTransfer !== null}
            class="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-indigo-500 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prefsSync.serverTransfer === "download"
              ? locale.t("settings.sync.downloading")
              : locale.t("settings.sync.download_button")}
          </button>
        </div>
        {#if prefsSync.lastSyncedAt}
          <p class="text-[11px] text-neutral-500">
            {locale.t("settings.sync.last_synced", {
              time: locale.formatDateTime(prefsSync.lastSyncedAt),
            })}
          </p>
        {/if}
        {#if message === "uploaded"}
          <p class="text-[11px] text-emerald-400">{locale.t("settings.sync.uploaded")}</p>
        {:else if message === "downloaded"}
          <p class="text-[11px] text-emerald-400">{locale.t("settings.sync.downloaded")}</p>
        {:else if message === "no_data"}
          <p class="text-[11px] text-amber-400">{locale.t("settings.sync.no_server_data")}</p>
        {/if}
        {#if transferError ?? prefsSync.lastSyncError}
          <p class="text-[11px] text-red-400">{transferError ?? prefsSync.lastSyncError}</p>
        {/if}
      </div>
    </div>
  {/if}
</div>
