<script lang="ts">
  import { gallery, isVideoImage } from "../../stores/gallery.svelte.js";
  import { locale } from "../../stores/locale.svelte.js";
  import { formatGenerationTime } from "../../utils/localeFormat.js";
  import { readImageMetadata } from "../../utils/api.js";
  import type { OutputImage } from "../../types/index.js";

  /**
   * Touch-optimised fullscreen lightbox for the mobile shell.
   * The desktop lightbox lives inline in App.svelte (which is not rendered when
   * `useMobileLayout` is true), so the mobile gallery needs its own overlay to
   * view images/videos. Reads the shared gallery store directly.
   */

  function currentIndex(): number {
    const imgs = gallery.images;
    if (!gallery.lastSelectedImage) return 0;
    const idx = imgs.indexOf(gallery.lastSelectedImage);
    return idx === -1 ? 0 : idx;
  }

  function navigate(direction: 1 | -1) {
    const imgs = gallery.images;
    if (imgs.length === 0) return;
    const next = imgs[(currentIndex() + direction + imgs.length) % imgs.length];
    if (next) void gallery.openLightbox(next);
  }

  function boardLabel(image: OutputImage): string {
    return gallery.getBoard(image);
  }

  let showMetadata = $state(false);
  let metadata = $state<Record<string, string> | null>(null);
  let loadingMetadata = $state(false);

  const promptKeys = ["positive_prompt", "negative_prompt"];
  const metadataLabels: Record<string, string> = {
    positive_prompt: "gallery.meta.prompt",
    negative_prompt: "gallery.meta.negative_prompt",
    model: "gallery.meta.model",
    vae: "gallery.meta.vae",
    seed: "gallery.meta.seed",
    steps: "gallery.meta.steps",
    cfg: "gallery.meta.cfg",
    sampler: "gallery.meta.sampler",
    scheduler: "gallery.meta.scheduler",
    denoise: "gallery.meta.denoise",
    mode: "gallery.meta.mode",
    size: "gallery.meta.size",
    loras: "gallery.meta.loras",
    bit_depth: "gallery.meta.bit_depth",
    upscale_model: "gallery.meta.upscale_model",
    upscale_scale: "gallery.meta.upscale_scale",
    upscale_denoise: "gallery.meta.upscale_denoise",
    mooshie_upscale_steps: "gallery.meta.upscale_steps",
    mooshie_upscale_tiling: "gallery.meta.upscale_tiling",
    mooshie_upscale_tile_size: "gallery.meta.upscale_tile_size",
    mooshie_soft_guidance: "gallery.meta.soft_guidance",
    mooshie_model_architecture: "gallery.meta.model_architecture",
    mooshie_smart_guidance: "gallery.meta.smart_guidance",
    mooshie_differential_diffusion: "gallery.meta.differential_diffusion",
    mooshie_controlnet_preset: "gallery.meta.controlnet_preset",
    mooshie_controlnet_model: "gallery.meta.controlnet_model",
    mooshie_controlnet_strength: "gallery.meta.controlnet_strength",
    mooshie_prompt_schedule: "gallery.meta.prompt_schedule",
    date: "gallery.meta.date",
    generation_time: "gallery.meta.generation_time",
  };

  // Explicit display order for the settings table so the details view is stable
  // and logically grouped instead of following raw object-insertion order.
  const settingsOrder = [
    "model",
    "vae",
    "mode",
    "size",
    "sampler",
    "scheduler",
    "steps",
    "cfg",
    "seed",
    "denoise",
    "loras",
    "bit_depth",
    "mooshie_model_architecture",
    "mooshie_smart_guidance",
    "mooshie_differential_diffusion",
    "mooshie_controlnet_preset",
    "mooshie_controlnet_model",
    "mooshie_controlnet_strength",
    "mooshie_prompt_schedule",
    "upscale_model",
    "upscale_scale",
    "upscale_denoise",
    "mooshie_upscale_steps",
    "mooshie_upscale_tiling",
    "mooshie_upscale_tile_size",
    "mooshie_soft_guidance",
    "date",
    "generation_time",
  ];

  function orderedSettingKeys(meta: Record<string, string>): string[] {
    const present = Object.keys(meta).filter((key) => !promptKeys.includes(key) && meta[key]);
    const ranked = settingsOrder.filter((key) => present.includes(key));
    const extras = present.filter((key) => !settingsOrder.includes(key));
    return [...ranked, ...extras];
  }

  function metadataLabel(key: string): string {
    const translationKey = metadataLabels[key];
    return translationKey ? locale.t(translationKey) : key;
  }

  async function loadMetadata() {
    if (!gallery.selectedImage) return;
    const image = gallery.selectedImage;
    if (image.metadata) {
      metadata = image.metadata;
      return;
    }
    if (!image.gallery_filename) {
      metadata = null;
      return;
    }
    loadingMetadata = true;
    try {
      const loaded = await readImageMetadata(image.gallery_filename);
      if (gallery.selectedImage === image) {
        metadata = loaded;
        image.metadata = loaded;
      }
    } catch {
      metadata = null;
    } finally {
      loadingMetadata = false;
    }
  }

  function closeMetadata() {
    showMetadata = false;
    gallery.lightboxInfoRequested = false;
  }

  $effect(() => {
    gallery.selectedImage;
    showMetadata = gallery.lightboxInfoRequested;
    metadata = null;
    if (showMetadata) void loadMetadata();
  });
</script>

{#if gallery.lightboxOpen}
  <div
    class="fixed inset-0 z-60 bg-black/95 flex flex-col tap-highlight-none"
    role="dialog"
    aria-modal="true"
    aria-label={gallery.selectedImage?.filename ?? ""}
  >
    <!-- Top bar -->
    <div class="shrink-0 flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 gap-2">
      <p class="text-xs text-neutral-300 truncate px-1">{gallery.selectedImage?.filename ?? ""}</p>
      <button
        type="button"
        class="shrink-0 w-9 h-9 touch-target flex items-center justify-center rounded-full bg-neutral-800/80 text-neutral-200 active:bg-neutral-700"
        aria-label={locale.t("common.close")}
        onclick={() => gallery.closeLightbox()}
      >
        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    {#if !showMetadata}
    <!-- Media -->
    <div class="flex-1 min-h-0 relative flex items-center justify-center px-2">
      {#if gallery.lightboxUrl}
        {#if gallery.selectedImage && isVideoImage(gallery.selectedImage)}
          <!-- svelte-ignore a11y_media_has_caption -- user-generated videos have no caption track -->
          <video
            src={gallery.lightboxUrl}
            controls
            autoplay
            playsinline
            class="max-h-full max-w-full rounded-lg"
          ></video>
        {:else}
          <img
            src={gallery.lightboxUrl}
            alt={gallery.selectedImage?.filename ?? ""}
            class="max-h-full max-w-full object-contain rounded-lg"
          />
        {/if}
      {/if}

      {#if gallery.images.length > 1}
        <button
          type="button"
          class="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 touch-target flex items-center justify-center rounded-full bg-black/60 text-neutral-100 active:bg-black/80"
          aria-label={locale.t("gallery.lightbox.prev_title")}
          onclick={() => navigate(-1)}
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button
          type="button"
          class="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 touch-target flex items-center justify-center rounded-full bg-black/60 text-neutral-100 active:bg-black/80"
          aria-label={locale.t("gallery.lightbox.next_title")}
          onclick={() => navigate(1)}
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      {/if}
    </div>

    <!-- Bottom info + actions -->
    {#if gallery.selectedImage}
      <div class="shrink-0 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] text-neutral-400 truncate">
            {#if gallery.selectedImage.generationTimeMs != null}
              {formatGenerationTime(gallery.selectedImage.generationTimeMs, locale.current)}
            {/if}
          </span>
          <select
            class="shrink-0 max-w-[60%] bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-200"
            value={boardLabel(gallery.selectedImage)}
            onchange={(e) => gallery.setBoard(gallery.selectedImage!, (e.target as HTMLSelectElement).value)}
          >
            <option value="Unsorted">{locale.t("gallery.unsorted")}</option>
            {#each gallery.boards as board}
              <option value={board}>{board}</option>
            {/each}
          </select>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 py-2.5 rounded-lg bg-neutral-800 active:bg-neutral-700 text-neutral-200 text-sm disabled:opacity-50 touch-target"
            disabled={gallery.saving}
            onclick={() => gallery.saveImageAs(gallery.selectedImage!)}
          >
            {locale.t(isVideoImage(gallery.selectedImage) ? "gallery.save_video_as" : "gallery.save")}
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 rounded-lg bg-red-900/70 active:bg-red-800 text-red-200 text-sm touch-target"
            onclick={() => gallery.deleteImage(gallery.selectedImage!)}
          >
            {locale.t("gallery.delete")}
          </button>
        </div>
      </div>
    {/if}
    {:else if gallery.selectedImage}
      <div class="metadata-view flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {#if loadingMetadata}
          <p class="metadata-muted text-sm">{locale.t("common.loading")}</p>
        {:else if metadata}
          {@const promptEntries = promptKeys.filter((key) => metadata[key])}
          {@const settingEntries = orderedSettingKeys(metadata)}
          {#each promptEntries as key}
            <section class="mb-3">
              <h3 class="metadata-label mb-1 text-[11px] font-medium uppercase tracking-wide">{metadataLabel(key)}</h3>
              <p class="metadata-prompt whitespace-pre-wrap wrap-break-word rounded-lg px-3 py-2 text-sm leading-relaxed">{metadata[key]}</p>
            </section>
          {/each}
          <div class="metadata-settings overflow-hidden rounded-lg border shadow-sm">
            {#each settingEntries as key}
              <div class="metadata-row flex items-start justify-between gap-3 px-3 py-2.5 text-xs">
                <span class="metadata-label shrink-0">{metadataLabel(key)}</span>
                <span class="metadata-value break-all text-right font-medium">{metadata[key]}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="metadata-muted text-sm">{locale.t("gallery.no_metadata")}</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .metadata-view {
    background: color-mix(in srgb, var(--theme-background) 94%, var(--theme-text) 6%);
    color: color-mix(in srgb, var(--theme-text) 88%, var(--theme-background));
  }

  .metadata-label,
  .metadata-muted {
    color: color-mix(in srgb, var(--theme-text) 54%, var(--theme-background));
  }

  .metadata-prompt {
    background: color-mix(in srgb, var(--theme-surface-800) 82%, var(--theme-background));
    border: 1px solid color-mix(in srgb, var(--theme-text) 12%, transparent);
    color: color-mix(in srgb, var(--theme-text) 90%, var(--theme-background));
  }

  .metadata-settings {
    background: color-mix(in srgb, var(--theme-surface-900) 88%, var(--theme-background));
    border-color: color-mix(in srgb, var(--theme-text) 14%, transparent);
  }

  .metadata-row + .metadata-row {
    border-top: 1px solid color-mix(in srgb, var(--theme-text) 10%, transparent);
  }

  .metadata-value {
    color: color-mix(in srgb, var(--theme-text) 82%, var(--theme-background));
  }
</style>
