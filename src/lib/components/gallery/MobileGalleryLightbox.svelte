<script lang="ts">
  import { gallery, isVideoImage } from "../../stores/gallery.svelte.js";
  import { locale } from "../../stores/locale.svelte.js";
  import { formatGenerationTime } from "../../utils/localeFormat.js";
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
  </div>
{/if}
