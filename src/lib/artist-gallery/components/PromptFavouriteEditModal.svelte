<script lang="ts">
  import { locale } from "../../stores/locale.svelte.js";
  import PromptTextarea from "../../components/generation/PromptTextarea.svelte";
  import { promptFavourites, type PromptFavouriteEntry } from "../promptFavourites.svelte.js";

  interface Props {
    entryId: string;
    onclose: () => void;
  }

  let { entryId, onclose }: Props = $props();

  const entry = $derived<PromptFavouriteEntry | undefined>(
    promptFavourites.entries.find((e) => e.id === entryId),
  );

  // Draft state is seeded once from the entry; the modal is keyed by entryId at
  // the call site, so a different entry remounts it rather than reusing drafts.
  let name = $state(entry?.name ?? "");
  let positive = $state(entry?.positive ?? "");
  let negative = $state(entry?.negative ?? "");
  let groupId = $state(entry?.groupId ?? "");
  let saving = $state(false);

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await promptFavourites.updateEntry(entryId, {
        name: name.trim(),
        positive,
        negative,
        groupId: groupId || null,
      });
      onclose();
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!confirm(locale.t("prompt_favourites.delete_confirm"))) return;
    await promptFavourites.remove(entryId);
    onclose();
  }
</script>

<div
  class="fixed inset-0 z-205 flex items-center justify-center bg-black/80 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  aria-label={locale.t("prompt_favourites.edit_title")}
>
  <button
    type="button"
    class="absolute inset-0 h-full w-full cursor-default"
    aria-label={locale.t("common.close")}
    onclick={onclose}
  ></button>

  {#if entry}
    <div class="relative z-10 w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-neutral-100">{locale.t("prompt_favourites.edit_title")}</h2>
          <p class="text-[11px] text-neutral-500">{locale.t("prompt_favourites.edit_desc")}</p>
        </div>
        <button
          type="button"
          class="text-neutral-500 hover:text-neutral-200 text-lg leading-none"
          onclick={onclose}
          aria-label={locale.t("common.close")}
        >✕</button>
      </div>

      <div class="space-y-4">
        <div>
          <label for="pf-name" class="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">{locale.t("prompt_favourites.name")}</label>
          <input
            id="pf-name"
            type="text"
            bind:value={name}
            placeholder={locale.t("prompt_favourites.name_placeholder")}
            class="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <span class="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">{locale.t("prompt_favourites.positive_prompt_dialog")}</span>
          <PromptTextarea bind:value={positive} rows={5} minHeight="min-h-25" bracketCheck={true} />
        </div>

        <div>
          <span class="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">{locale.t("prompt_favourites.negative_prompt_dialog")}</span>
          <PromptTextarea bind:value={negative} rows={3} minHeight="min-h-16" bracketCheck={true} />
        </div>

        <div>
          <label for="pf-group" class="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">{locale.t("prompt_favourites.group")}</label>
          <select
            id="pf-group"
            bind:value={groupId}
            class="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">{locale.t("prompt_favourites.no_group")}</option>
            {#each promptFavourites.groups as group (group.id)}
              <option value={group.id}>{group.title}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          class="cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800/70 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300"
          onclick={remove}
        >{locale.t("common.delete")}</button>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800/70 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-neutral-100"
            onclick={onclose}
          >{locale.t("common.cancel")}</button>
          <button
            type="button"
            class="cursor-pointer rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600"
            disabled={saving}
            onclick={save}
          >{locale.t("prompt_favourites.save")}</button>
        </div>
      </div>
    </div>
  {/if}
</div>
