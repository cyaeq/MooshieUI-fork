<script lang="ts">
  import { locale } from "../../stores/locale.svelte.js";

  interface Props {
    entries: number;
    groups: number;
    current: number;
    currentGroups: number;
    onmerge: () => void;
    onreplace: () => void;
    onclose: () => void;
  }

  let { entries, groups, current, currentGroups, onmerge, onreplace, onclose }: Props = $props();

  let step = $state<"choose" | "confirm_replace">("choose");
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose();
  }}
  onkeydown={(e) => {
    if (e.key === "Escape") onclose();
  }}
  role="presentation"
>
  <div
    class="w-full max-w-lg rounded-[var(--app-panel-radius)] border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="prompt-favourites-import-title"
  >
    {#if step === "choose"}
      <h2 id="prompt-favourites-import-title" class="mb-1 text-sm font-semibold text-neutral-100">
        {locale.t("prompt_favourites.import_confirm_title")}
      </h2>
      <p class="mb-4 text-xs leading-relaxed text-neutral-400">
        {locale.t("prompt_favourites.import_confirm_body", { entries, groups })}
      </p>
      <div class="mb-4 space-y-2 text-[11px] leading-relaxed text-neutral-500">
        <p>{locale.t("prompt_favourites.import_merge_desc")}</p>
        <p>{locale.t("prompt_favourites.import_replace_desc")}</p>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500"
          onclick={onclose}
        >
          {locale.t("common.cancel")}
        </button>
        <button
          type="button"
          class="rounded-md border border-red-800 bg-neutral-800 px-3 py-1.5 text-xs text-red-300 hover:border-red-500"
          onclick={() => (step = "confirm_replace")}
        >
          {locale.t("prompt_favourites.import_mode_replace")}
        </button>
        <button
          type="button"
          class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          onclick={onmerge}
        >
          {locale.t("prompt_favourites.import_mode_merge")}
        </button>
      </div>
    {:else}
      <h2 id="prompt-favourites-import-title" class="mb-1 text-sm font-semibold text-red-300">
        {locale.t("prompt_favourites.import_replace_title")}
      </h2>
      <p class="mb-4 text-xs leading-relaxed text-neutral-400">
        {locale.t("prompt_favourites.import_replace_body", { current, groups: currentGroups })}
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500"
          onclick={() => (step = "choose")}
        >
          {locale.t("common.back")}
        </button>
        <button
          type="button"
          class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
          onclick={onreplace}
        >
          {locale.t("prompt_favourites.import_replace_confirm")}
        </button>
      </div>
    {/if}
  </div>
</div>
