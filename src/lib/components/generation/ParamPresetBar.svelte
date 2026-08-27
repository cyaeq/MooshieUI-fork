<script lang="ts">
  import { generation } from "../../stores/generation.svelte.js";
  import { locale } from "../../stores/locale.svelte.js";
  import { paramPresets } from "../../stores/paramPresets.svelte.js";

  let selectedPresetId = $state("");
  let newPresetName = $state("");
  let presetStatus = $state<string | null>(null);
  let presetError = $state<string | null>(null);

  function clearMessages() {
    presetStatus = null;
    presetError = null;
  }

  function createPresetFromCurrent() {
    clearMessages();
    const fallbackName = locale.t("param_presets.default_name", {
      n: String(paramPresets.presets.length + 1),
    });
    const created = paramPresets.create(
      newPresetName.trim() || fallbackName,
      generation.snapshotParamPreset(),
    );
    newPresetName = "";
    selectedPresetId = created.id;
    presetStatus = locale.t("param_presets.saved", { name: created.name });
  }

  function updatePresetFromCurrent() {
    clearMessages();
    if (!selectedPresetId) {
      presetError = locale.t("param_presets.error.select_first");
      return;
    }
    const selected = paramPresets.getById(selectedPresetId);
    if (!selected) {
      presetError = locale.t("param_presets.error.not_found");
      return;
    }
    paramPresets.update(selected.id, { params: generation.snapshotParamPreset() });
    presetStatus = locale.t("param_presets.updated", { name: selected.name });
  }

  function applySelectedPreset() {
    clearMessages();
    if (!selectedPresetId) {
      presetError = locale.t("param_presets.error.select_first");
      return;
    }
    const selected = paramPresets.getById(selectedPresetId);
    if (!selected) {
      presetError = locale.t("param_presets.error.not_found");
      return;
    }
    generation.applyParamPreset(selected.params);
    presetStatus = locale.t("param_presets.applied");
  }

  function deleteSelectedPreset() {
    clearMessages();
    if (!selectedPresetId) {
      presetError = locale.t("param_presets.error.select_first");
      return;
    }
    const selected = paramPresets.getById(selectedPresetId);
    if (!selected) return;
    if (!confirm(locale.t("param_presets.delete_confirm", { name: selected.name }))) return;
    paramPresets.remove(selected.id);
    selectedPresetId = "";
    presetStatus = locale.t("param_presets.deleted");
  }
</script>

<div class="rounded border border-neutral-800 bg-neutral-900/60 p-2 text-[11px] space-y-2">
  <p class="text-neutral-400">{locale.t("param_presets.title")}</p>
  <div class="flex items-center gap-2">
    <select
      bind:value={selectedPresetId}
      class="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[11px] text-neutral-100 focus:outline-none focus:border-indigo-500"
    >
      <option value="">{locale.t("param_presets.select_placeholder")}</option>
      {#each paramPresets.presets as preset (preset.id)}
        <option value={preset.id}>{preset.name}</option>
      {/each}
    </select>
    <button
      type="button"
      class="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-200 hover:border-indigo-500 cursor-pointer"
      onclick={applySelectedPreset}
    >
      {locale.t("param_presets.apply")}
    </button>
  </div>
  <div class="flex items-center gap-2">
    <input
      type="text"
      bind:value={newPresetName}
      placeholder={locale.t("param_presets.name_placeholder")}
      class="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[11px] text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
    />
    <button
      type="button"
      class="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-200 hover:border-indigo-500 cursor-pointer"
      onclick={createPresetFromCurrent}
    >
      {locale.t("param_presets.save_current")}
    </button>
    <button
      type="button"
      class="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300 hover:border-indigo-500 cursor-pointer"
      onclick={updatePresetFromCurrent}
    >
      {locale.t("param_presets.update")}
    </button>
    <button
      type="button"
      class="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-red-300 hover:border-red-500/50 cursor-pointer"
      onclick={deleteSelectedPreset}
    >
      {locale.t("param_presets.delete")}
    </button>
  </div>
  {#if presetStatus}
    <p class="text-emerald-400">{presetStatus}</p>
  {/if}
  {#if presetError}
    <p class="text-amber-300">{presetError}</p>
  {/if}
</div>
