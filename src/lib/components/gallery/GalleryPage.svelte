<script lang="ts">
  import { gallery, isVideoImage } from "../../stores/gallery.svelte.js";
  import { locale } from "../../stores/locale.svelte.js";
  import { generation } from "../../stores/generation.svelte.js";
  import { progress } from "../../stores/progress.svelte.js";
  import { canvas } from "../../stores/canvas.svelte.js";
  import { connection } from "../../stores/connection.svelte.js";
  import { lazyThumbnail } from "../../utils/lazyThumbnail.js";
  import { uploadOutputImageForGenerationInput } from "../../utils/galleryActions.js";
  import { prepareOutputImageForEditMode } from "../../utils/editImagePreparation.js";
  import { uploadImageBytes } from "../../utils/api.js";
  import { formatGenerationTime } from "../../utils/localeFormat.js";
  import { useMobileLayout } from "../../utils/device.js";
  import type { OutputImage } from "../../types/index.js";
  import MobileGalleryLightbox from "./MobileGalleryLightbox.svelte";

  interface Props {
    onSwitchToGenerate?: () => void;
  }

  let { onSwitchToGenerate }: Props = $props();

  /** True when rendered inside the touch-optimised mobile shell. */
  const isMobile = useMobileLayout;

  const GALLERY_PREFS_KEY = "mooshieui.gallery.prefs.v1";

  let galleryImagesPerRow = $state(5);
  let gallerySortBy = $state<"date" | "name" | "size">("date");
  let gallerySortDir = $state<"asc" | "desc">("desc");
  let galleryGroupBy = $state<"none" | "date" | "month" | "mode" | "prompt" | "board">("none");
  let galleryBoardFilter = $state<string>("all");
  let newBoardName = $state("");
  let galleryView = $state<"huge" | "large" | "small" | "details">("large");
  let galleryRenderLimit = $state(48);
  let dirPickerImage = $state<OutputImage | null>(null);
  // Mobile: the filter toolbar collapses behind a toggle, and per-image actions
  // open in a bottom sheet instead of a hover overlay.
  let mobileFiltersOpen = $state(false);
  let mobileActionImage = $state<OutputImage | null>(null);

  function loadMoreGallery(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) galleryRenderLimit += 48;
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return { destroy() { observer.disconnect(); } };
  }

  function getImageTimestamp(image: OutputImage): number {
    return image.generated_at_ms ?? 0;
  }

  /** Compare button label: pin the first image, then pick the second (issue #517). */
  function comparePinTitle(image: OutputImage): string {
    if (!gallery.comparePin) return locale.t("gallery.compare.pin");
    if (gallery.comparePin === image) return locale.t("gallery.compare.unpin");
    return locale.t("gallery.compare.with_pinned");
  }

  function getImageSize(image: OutputImage): number {
    return image.file_size_bytes ?? 0;
  }

  function formatDate(ts: number | undefined): string {
    if (!ts) return "Unknown";
    return locale.formatDateTime(ts);
  }

  function formatDateGroup(ts: number | undefined): string {
    if (!ts) return "Unknown Date";
    return new Date(ts).toLocaleDateString(locale.intlTag, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatMonthGroup(ts: number | undefined): string {
    if (!ts) return "Unknown Month";
    return new Date(ts).toLocaleDateString(locale.intlTag, {
      year: "numeric",
      month: "long",
    });
  }

  function modeLabel(mode: OutputImage["generation_mode"]): string {
    if (mode === "txt2img") return locale.t("gallery.mode.txt2img");
    if (mode === "img2img") return locale.t("gallery.mode.img2img");
    if (mode === "inpainting") return locale.t("gallery.mode.inpainting");
    if (mode === "video") return locale.t("gallery.mode.video");
    return locale.t("gallery.mode.unknown");
  }

  function formatBytes(bytes: number | undefined): string {
    if (!bytes || bytes <= 0) return "-";
    return locale.formatBytes(bytes);
  }

  /** m:ss for the grid duration badge. 5.2 -> "0:05", 65 -> "1:05". */
  function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function viewColumns(view: "huge" | "large" | "small" | "details"): number {
    if (isMobile) {
      // Touch-friendly fixed density — the per-row slider is hidden on mobile
      // and the details (table) view is replaced by the grid.
      if (view === "huge") return 2;
      if (view === "small") return 3;
      return 2;
    }
    if (view === "huge") return Math.max(2, galleryImagesPerRow - 2);
    if (view === "small") return Math.min(10, galleryImagesPerRow + 2);
    return galleryImagesPerRow;
  }

  function boardLabel(image: OutputImage): string {
    return gallery.getBoard(image);
  }

  function assignBoard(image: OutputImage, board: string) {
    gallery.setBoard(image, board);
  }

  function addBoard() {
    const name = newBoardName.trim();
    if (!name) return;
    gallery.addBoard(name);
    galleryBoardFilter = name;
    newBoardName = "";
  }

  function loadGalleryPrefs() {
    try {
      const raw = localStorage.getItem(GALLERY_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        imagesPerRow?: number;
        sortBy?: "date" | "name" | "size";
        sortDir?: "asc" | "desc";
        groupBy?: "none" | "date" | "month" | "mode" | "prompt" | "board";
        boardFilter?: string;
        view?: "huge" | "large" | "small" | "details";
      };
      if (typeof parsed.imagesPerRow === "number") galleryImagesPerRow = Math.max(2, Math.min(8, Math.round(parsed.imagesPerRow)));
      if (parsed.sortBy) gallerySortBy = parsed.sortBy;
      if (parsed.sortDir) gallerySortDir = parsed.sortDir;
      if (parsed.groupBy) galleryGroupBy = parsed.groupBy;
      if (parsed.boardFilter) galleryBoardFilter = parsed.boardFilter;
      if (parsed.view) galleryView = parsed.view;
    } catch {}
  }

  async function loadImageForMode(image: OutputImage, mode: "img2img" | "inpainting") {
    try {
      const prepared = await prepareOutputImageForEditMode(image, mode);
      const response = await uploadImageBytes(prepared.uploadBytes, prepared.uploadFilename);
      generation.inputImage = response.name;
      canvas.clearMask();
      generation.mode = mode;
      generation.upscaleEnabled = false;
      if (mode === "inpainting" && prepared.normalized) {
        const normalized = prepared.normalized;
        generation.width = normalized.width;
        generation.height = normalized.height;
        progress.setLastOutputForMode("inpainting", null);
        canvas.setInpaintDrawMode("mask");
        canvas.isCanvasMode = true;
        canvas.clearStaging();
        canvas.setInpaintOriginalSource({
          previewUrl: normalized.previewUrl,
          width: normalized.width,
          height: normalized.height,
          uploadedInputName: response.name,
        });
        if (canvas.layers.length === 0 || canvas.canvasWidth !== normalized.width || canvas.canvasHeight !== normalized.height) {
          canvas.initCanvas(normalized.width, normalized.height);
        }
      }
      onSwitchToGenerate?.();
      gallery.showToast(
        mode === "inpainting" ? locale.t("gallery.toast.loaded_inpaint") : locale.t("gallery.toast.loaded_img2img"),
        "success",
      );
    } catch (e) {
      console.error(`Failed to set up ${mode}:`, e);
      gallery.showToast(locale.t("gallery.toast.failed_load"), "error");
    }
  }

  async function img2imgImage(image: OutputImage) {
    await loadImageForMode(image, "img2img");
  }

  async function inpaintImage(image: OutputImage) {
    await loadImageForMode(image, "inpainting");
  }

  async function upscaleImage(image: OutputImage) {
    try {
      generation.inputImage = await uploadOutputImageForGenerationInput(image, "refine_input.png");
      generation.mode = "img2img";
      generation.upscaleEnabled = true;
      onSwitchToGenerate?.();
      gallery.showToast(locale.t("gallery.toast.loaded_upscale"), "success");
    } catch (e) {
      console.error("Failed to set up upscale:", e);
      gallery.showToast(locale.t("gallery.toast.failed_load"), "error");
    }
  }

  async function rescanGalleryMetadata() {
    await gallery.rescanMetadata();
  }

  async function sortGalleryByArtist() {
    const result = await gallery.autoSortByArtist(connection.artistGalleryManifestUrl);
    if (result.sorted === 0 && result.scanned > 0) {
      gallery.showToast(locale.t("gallery.sort_by_artist_none"), "info");
    } else if (result.sorted > 0) {
      gallery.showToast(
        locale.t("gallery.sort_by_artist_done", { sorted: String(result.sorted), boards: String(result.boards.length) }),
        "success",
      );
    }
  }

  function saveToDir(image: OutputImage) {
    const dirs = generation.autoSaveDirs.filter(Boolean);
    if (dirs.length === 0) {
      gallery.saveImageAs(image);
    } else if (dirs.length === 1) {
      gallery.saveImageToDir(image, dirs[0]!);
    } else {
      dirPickerImage = image;
    }
  }

  const sortedGalleryImages = $derived.by(() => {
    const sorted = [...gallery.images].sort((a, b) => {
      if (gallerySortBy === "name") {
        const cmp = a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" });
        return gallerySortDir === "asc" ? cmp : -cmp;
      }
      if (gallerySortBy === "size") {
        const cmp = getImageSize(a) - getImageSize(b);
        return gallerySortDir === "asc" ? cmp : -cmp;
      }
      const cmp = getImageTimestamp(a) - getImageTimestamp(b);
      return gallerySortDir === "asc" ? cmp : -cmp;
    });
    return galleryBoardFilter === "all" ? sorted : sorted.filter((image) => gallery.getBoard(image) === galleryBoardFilter);
  });

  const groupedGalleryImages = $derived.by(() => {
    if (galleryGroupBy !== "none") {
      const grouped = new Map<string, OutputImage[]>();
      for (const image of sortedGalleryImages) {
        const key =
          galleryGroupBy === "date"
            ? formatDateGroup(image.generated_at_ms)
            : galleryGroupBy === "month"
              ? formatMonthGroup(image.generated_at_ms)
              : galleryGroupBy === "mode"
                ? modeLabel(image.generation_mode)
                : galleryGroupBy === "board"
                  ? gallery.getBoard(image)
                  : (image.prompt_id || locale.t("gallery.no_prompt_id"));
        const bucket = grouped.get(key) ?? [];
        bucket.push(image);
        grouped.set(key, bucket);
      }
      return Array.from(grouped.entries()).map(([label, images]) => ({ label, images }));
    }
    return [{ label: locale.t("gallery.all_images"), images: sortedGalleryImages }];
  });

  const galleryTotalCount = $derived(groupedGalleryImages.reduce((sum, g) => sum + g.images.length, 0));
  const galleryGroupsVisible = $derived.by(() => {
    let remaining = galleryRenderLimit;
    const result: Array<{ label: string; images: OutputImage[] }> = [];
    for (const group of groupedGalleryImages) {
      if (remaining <= 0) break;
      const images = group.images.slice(0, remaining);
      remaining -= images.length;
      if (images.length > 0) result.push({ label: group.label, images });
    }
    return result;
  });

  const thumbSize = $derived(viewColumns(galleryView) <= 3 ? 480 : 384);

  if (typeof window !== "undefined") loadGalleryPrefs();

  $effect(() => {
    void gallerySortBy;
    void gallerySortDir;
    void galleryGroupBy;
    void galleryBoardFilter;
    galleryRenderLimit = 48;
  });

  $effect(() => {
    void galleryImagesPerRow;
    void gallerySortBy;
    void gallerySortDir;
    void galleryGroupBy;
    void galleryBoardFilter;
    void galleryView;
    try {
      localStorage.setItem(
        GALLERY_PREFS_KEY,
        JSON.stringify({
          imagesPerRow: galleryImagesPerRow,
          sortBy: gallerySortBy,
          sortDir: gallerySortDir,
          groupBy: galleryGroupBy,
          boardFilter: galleryBoardFilter,
          view: galleryView,
        }),
      );
    } catch {}
  });
</script>

<div class="studio-page studio-gallery-page p-3 md:p-6 h-full overflow-y-auto">
  {#if gallery.loading}
    <div class="flex items-center justify-center h-full text-neutral-500">{locale.t("gallery.loading")}</div>
  {:else if gallery.images.length === 0}
    <div class="flex items-center justify-center h-full text-neutral-500">{locale.t("gallery.empty_generate")}</div>
  {:else}
    <div class="space-y-4">
      {#if gallery.hasExpiry}
        <div class="px-4 py-3 rounded-xl bg-amber-900/30 border border-amber-700/50 text-amber-300 text-sm flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>
            <p class="font-medium text-amber-200">{locale.t("gallery.expiry_warning")}</p>
            <p class="text-amber-400/80 text-xs mt-1">{locale.t("gallery.expiry_hint")}</p>
            {#if gallery.expiringWithin24h > 0}
              <p class="text-amber-200 text-xs mt-1 font-semibold">{locale.t("gallery.expiry_soon", { count: String(gallery.expiringWithin24h) })}</p>
            {/if}
            {#if gallery.storageInfo}
              <p class="text-amber-400/60 text-xs mt-1">{locale.t("gallery.storage_usage")}: {gallery.storageLabel}</p>
            {/if}
          </div>
        </div>
      {/if}

      <div class="studio-gallery-toolbar rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 space-y-3">
        {#if isMobile}
        <div class="flex items-center justify-between">
          <span class="text-xs text-neutral-400">{locale.t("gallery.filter")}</span>
          <button
            type="button"
            class="flex items-center gap-1 px-3 py-2 text-xs rounded-lg border border-neutral-700 text-neutral-300 hover:border-neutral-500 active:bg-neutral-800 transition-colors touch-target"
            onclick={() => (mobileFiltersOpen = !mobileFiltersOpen)}
            aria-expanded={mobileFiltersOpen}
          >
            {mobileFiltersOpen ? locale.t("gallery.filter_hide") : locale.t("gallery.filter_show")}
            <svg class="w-3.5 h-3.5 transition-transform {mobileFiltersOpen ? 'rotate-180' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        {/if}
        {#if !isMobile || mobileFiltersOpen}
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-3 items-end">
          <div class="lg:col-span-2">
            <div class="text-xs text-neutral-400 mb-1">{locale.t("gallery.images_per_row")} {viewColumns(galleryView)}</div>
            <input type="range" bind:value={galleryImagesPerRow} min="2" max="8" step="1" class="w-full accent-indigo-500" disabled={galleryView === "details"} />
          </div>
          <div>
            <div class="text-xs text-neutral-400 mb-1">{locale.t("gallery.sort_by")}</div>
            <select bind:value={gallerySortBy} class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-neutral-200">
              <option value="date">{locale.t("gallery.sort_date")}</option>
              <option value="name">{locale.t("gallery.sort_name")}</option>
              <option value="size">{locale.t("gallery.sort_size")}</option>
            </select>
          </div>
          <div>
            <div class="text-xs text-neutral-400 mb-1">{locale.t("gallery.group_by")}</div>
            <select bind:value={galleryGroupBy} class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-neutral-200">
              <option value="none">{locale.t("gallery.group_none")}</option>
              <option value="date">{locale.t("gallery.group_date")}</option>
              <option value="month">{locale.t("gallery.group_month")}</option>
              <option value="mode">{locale.t("gallery.group_mode")}</option>
              <option value="prompt">{locale.t("gallery.group_prompt")}</option>
              <option value="board">{locale.t("gallery.group_board")}</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-3 items-end">
          <div>
            <div class="text-xs text-neutral-400 mb-1">{locale.t("gallery.board_filter")}</div>
            <select bind:value={galleryBoardFilter} class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-neutral-200">
              <option value="all">{locale.t("gallery.all_boards")}</option>
              <option value="Unsorted">{locale.t("gallery.unsorted")}</option>
              {#each gallery.boards as board}
                <option value={board}>{board}</option>
              {/each}
            </select>
          </div>
          <div class="lg:col-span-3">
            <div class="text-xs text-neutral-400 mb-1">{locale.t("gallery.create_board")}</div>
            <div class="flex items-center gap-2">
              <input type="text" bind:value={newBoardName} class="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-neutral-100 placeholder-neutral-500" placeholder={locale.t("gallery.placeholder_board")} />
              <button class="px-3 py-2 text-xs rounded border border-neutral-700 text-neutral-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors" onclick={addBoard} disabled={!newBoardName.trim()}>{locale.t("gallery.add")}</button>
            </div>
          </div>
        </div>

        <div>
          <div class="text-xs text-neutral-400 mb-2">{locale.t("gallery.view")}</div>
          <div class="flex flex-wrap gap-2">
            <button onclick={() => (gallerySortDir = gallerySortDir === "asc" ? "desc" : "asc")} class="px-3 py-1.5 text-xs rounded border transition-colors border-neutral-700 text-neutral-300 hover:border-neutral-500">{gallerySortDir === "asc" ? locale.t("gallery.ascending") : locale.t("gallery.descending")}</button>
            <button onclick={() => (galleryView = "huge")} class="px-3 py-1.5 text-xs rounded border transition-colors {galleryView === 'huge' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}">{locale.t("gallery.huge_icons")}</button>
            <button onclick={() => (galleryView = "large")} class="px-3 py-1.5 text-xs rounded border transition-colors {galleryView === 'large' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}">{locale.t("gallery.large_icons")}</button>
            <button onclick={() => (galleryView = "small")} class="px-3 py-1.5 text-xs rounded border transition-colors {galleryView === 'small' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}">{locale.t("gallery.small_icons")}</button>
            <button onclick={() => (galleryView = "details")} class="px-3 py-1.5 text-xs rounded border transition-colors {galleryView === 'details' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}">{locale.t("gallery.detailed_view")}</button>
            <button onclick={rescanGalleryMetadata} class="px-3 py-1.5 text-xs rounded border transition-colors border-amber-700/70 text-amber-300 hover:border-amber-500 hover:text-amber-200">{locale.t("gallery.rescan_metadata")}</button>
            <button onclick={sortGalleryByArtist} disabled={gallery.autoSorting} class="px-3 py-1.5 text-xs rounded border transition-colors border-indigo-700/70 text-indigo-300 hover:border-indigo-500 hover:text-indigo-200 disabled:opacity-50">{gallery.autoSorting ? locale.t("gallery.sort_by_artist_running") : locale.t("gallery.sort_by_artist")}</button>
            <label class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-700 text-neutral-300 cursor-pointer hover:border-neutral-500">
              <input
                type="checkbox"
                class="accent-indigo-500"
                checked={gallery.showGenerationTime}
                onchange={(e) => gallery.setShowGenerationTime((e.target as HTMLInputElement).checked)}
              />
              {locale.t("gallery.show_generation_time")}
            </label>
          </div>
        </div>
        {/if}
      </div>

      {#each galleryGroupsVisible as group}
        <section class="space-y-2">
          {#if galleryGroupBy !== "none"}
            <h3 class="text-sm text-neutral-300 font-medium">{group.label}</h3>
          {/if}
          {#if galleryView === "details" && !isMobile}
            <div class="rounded-xl border border-neutral-800 overflow-hidden">
              <div class="grid grid-cols-[72px_1fr_150px_120px_320px] gap-2 px-3 py-2 bg-neutral-900 text-[11px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
                <div>{locale.t("gallery.col_preview")}</div><div>{locale.t("gallery.col_name")}</div><div>{locale.t("gallery.col_date")}</div><div>{locale.t("gallery.col_size")}</div><div>{locale.t("gallery.col_actions")}</div>
              </div>
              {#each group.images as image}
                <div class="grid grid-cols-[72px_1fr_150px_120px_320px] gap-2 px-3 py-2 items-center border-b border-neutral-900/80 last:border-b-0">
                  <button class="w-14 h-14 rounded border border-neutral-800 overflow-hidden" onclick={() => gallery.openLightbox(image)}>
                    <img use:lazyThumbnail={{ image, size: thumbSize }} alt={image.filename} class="w-full h-full object-cover" />
                  </button>
                  <div class="text-sm text-neutral-200 truncate" title={image.filename}>{image.filename}</div>
                  <div class="text-xs text-neutral-400">
                    {formatDate(image.generated_at_ms)}
                    {#if gallery.showGenerationTime && image.generationTimeMs != null}
                      <span class="text-amber-300/80">· {formatGenerationTime(image.generationTimeMs, locale.current)}</span>
                    {/if}
                  </div>
                  <div class="text-xs text-neutral-400">{formatBytes(image.file_size_bytes)}</div>
                  <div class="flex flex-wrap gap-1">
                    <select class="px-2 py-1 text-[11px] rounded bg-neutral-800 border border-neutral-700 text-neutral-200" value={boardLabel(image)} onchange={(e) => assignBoard(image, (e.target as HTMLSelectElement).value)}>
                      <option value="Unsorted">{locale.t("gallery.unsorted")}</option>
                      {#each gallery.boards as board}
                        <option value={board}>{board}</option>
                      {/each}
                    </select>
                    {#if generation.manualSaveMode && !image.gallery_filename}
                      <button class="px-2 py-1 text-[11px] rounded bg-indigo-700 hover:bg-indigo-600 text-neutral-100" onclick={() => saveToDir(image)}>{locale.t("gallery.save_to_folder")}</button>
                    {/if}
                    {#if !isVideoImage(image)}
                      <button class="px-2 py-1 text-[11px] rounded bg-[#FFCC00] hover:bg-[#FFDD4D] text-black font-semibold" onclick={() => img2imgImage(image)}>{locale.t("gallery.i2i")}</button>
                      <button class="px-2 py-1 text-[11px] rounded bg-[#FFCC00] hover:bg-[#FFDD4D] text-black font-semibold" onclick={() => inpaintImage(image)}>{locale.t("gallery.inpaint")}</button>
                      {#if !image.is_upscaled}
                        <button class="px-2 py-1 text-[11px] rounded bg-[#FFCC00] hover:bg-[#FFDD4D] text-black font-semibold" onclick={() => upscaleImage(image)}>{locale.t("gallery.upscale")}</button>
                      {/if}
                      <button class="px-2 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-100" onclick={() => gallery.copyToClipboard(image)}>{locale.t("gallery.copy")}</button>
                      <button class="px-2 py-1 text-[11px] rounded text-neutral-100 {gallery.comparePin === image ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-neutral-800 hover:bg-neutral-700'}" title={comparePinTitle(image)} onclick={() => gallery.toggleComparePin(image)}>{locale.t("gallery.compare.short")}</button>
                    {/if}
                    <button class="px-2 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-100 disabled:opacity-50" disabled={gallery.saving} onclick={() => gallery.saveImageAs(image)}>{gallery.saving ? locale.t("gallery.saving") : locale.t("gallery.save")}</button>
                    <button class="px-2 py-1 text-[11px] rounded bg-red-900/80 hover:bg-red-800 text-neutral-100" onclick={() => gallery.deleteImage(image)}>{locale.t("gallery.delete")}</button>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="grid {isMobile ? 'gap-2' : 'gap-3'}" style="grid-template-columns: repeat({viewColumns(galleryView)}, minmax(0, 1fr));">
              {#each group.images as image}
                <div class="group relative rounded-lg overflow-hidden border border-neutral-800 hover:border-indigo-500 transition-colors {galleryView === 'huge' ? 'aspect-4/3' : 'aspect-square'}" style="content-visibility: auto; contain-intrinsic-size: auto 240px;">
                  <button
                    class="w-full h-full"
                    title={isVideoImage(image) ? locale.t("gallery.play_video") : image.filename}
                    onclick={() => gallery.openLightbox(image)}
                  >
                    <img use:lazyThumbnail={{ image, size: thumbSize }} alt={image.filename} class="w-full h-full object-cover" />
                  </button>
                  {#if isMobile}
                    <button
                      type="button"
                      class="absolute top-1 right-1 w-9 h-9 touch-target flex items-center justify-center rounded-full bg-black/70 text-neutral-100 active:bg-black/90"
                      title={locale.t("gallery.actions")}
                      aria-label={locale.t("gallery.actions")}
                      onclick={(e) => { e.stopPropagation(); mobileActionImage = image; }}
                    >
                      <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                  {/if}
                  {#if isVideoImage(image)}
                    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div class="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                        <svg class="w-5 h-5 text-white translate-x-px" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                    {#if image.duration_seconds != null}
                      <div class="absolute {isMobile ? 'top-12' : 'top-1'} right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono pointer-events-none">
                        {formatDuration(image.duration_seconds)}
                      </div>
                    {/if}
                  {/if}
                  {#if !isMobile && gallery.showGenerationTime && image.generationTimeMs != null}
                    <div class="absolute {isVideoImage(image) && image.duration_seconds != null ? 'top-7' : 'top-1'} right-1 px-1.5 py-0.5 rounded bg-black/70 text-amber-300 text-[10px] font-mono pointer-events-none">
                      {formatGenerationTime(image.generationTimeMs, locale.current)}
                    </div>
                  {/if}
                  <div class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-neutral-200 pointer-events-none">{boardLabel(image)}</div>
                  {#if !isMobile && generation.manualSaveMode && !image.gallery_filename}
                    <div class="absolute top-0 right-0 pt-1 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button class="w-7 h-7 flex items-center justify-center rounded bg-indigo-700/90 hover:bg-indigo-600 text-neutral-100 shadow" title={locale.t("gallery.save_to_folder")} onclick={(e) => { e.stopPropagation(); saveToDir(image); }}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                      </button>
                    </div>
                  {/if}
                  {#if !isMobile}
                  <div class="absolute bottom-0 inset-x-0 flex justify-center items-center gap-1 px-1.5 pb-1.5 pt-6 opacity-0 group-hover:opacity-100 transition-opacity bg-linear-to-t from-black/80 to-transparent">
                    {#if !isVideoImage(image)}
                      <button class="w-7 h-7 flex items-center justify-center rounded bg-[#FFCC00]/95 hover:bg-[#FFCC00] text-black text-[11px] font-bold shadow" title={locale.t("gallery.img2img")} onclick={(e) => { e.stopPropagation(); img2imgImage(image); }}>I2I</button>
                      <button class="w-7 h-7 flex items-center justify-center rounded bg-[#FFCC00]/95 hover:bg-[#FFCC00] text-black shadow" title={locale.t("gallery.inpaint")} onclick={(e) => { e.stopPropagation(); inpaintImage(image); }}>✎</button>
                      {#if !image.is_upscaled}
                        <button class="w-7 h-7 flex items-center justify-center rounded bg-[#FFCC00]/95 hover:bg-[#FFCC00] text-black shadow" title={locale.t("gallery.upscale")} onclick={(e) => { e.stopPropagation(); upscaleImage(image); }}>+</button>
                      {/if}
                      <button class="w-7 h-7 flex items-center justify-center rounded bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 shadow" title={locale.t("gallery.copy")} onclick={(e) => { e.stopPropagation(); gallery.copyToClipboard(image); }}>⧉</button>
                      <button class="w-7 h-7 flex items-center justify-center rounded shadow {gallery.comparePin === image ? 'bg-indigo-600 hover:bg-indigo-500 text-neutral-100' : 'bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200'}" title={comparePinTitle(image)} onclick={(e) => { e.stopPropagation(); gallery.toggleComparePin(image); }}>⇄</button>
                    {/if}
                    <button class="w-7 h-7 flex items-center justify-center rounded bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 shadow disabled:opacity-50" disabled={gallery.saving} title={locale.t(isVideoImage(image) ? "gallery.save_video_as" : "gallery.save_as")} onclick={(e) => { e.stopPropagation(); gallery.saveImageAs(image); }}>↓</button>
                    <button class="w-7 h-7 flex items-center justify-center rounded bg-red-900/80 hover:bg-red-800 text-red-300 hover:text-red-200 shadow" title={locale.t("gallery.delete")} onclick={(e) => { e.stopPropagation(); gallery.deleteImage(image); }}>×</button>
                  </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
      {#if galleryRenderLimit < galleryTotalCount}
        <div use:loadMoreGallery class="h-4 w-full"></div>
      {/if}
    </div>
  {/if}
</div>

{#if dirPickerImage}
  <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
    <div class="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4">
      <h3 class="text-sm font-semibold text-neutral-100 mb-3">{locale.t("gallery.choose_save_folder")}</h3>
      <div class="space-y-2 max-h-64 overflow-y-auto">
        {#each generation.autoSaveDirs.filter(Boolean) as dir}
          <button class="w-full text-left px-3 py-2 rounded border border-neutral-700 hover:border-indigo-500 hover:text-indigo-300 text-sm text-neutral-200 transition-colors" onclick={() => { gallery.saveImageToDir(dirPickerImage!, dir!); dirPickerImage = null; }}>
            {dir}
          </button>
        {/each}
      </div>
      <button class="mt-3 w-full px-3 py-2 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500" onclick={() => (dirPickerImage = null)}>{locale.t("common.cancel")}</button>
    </div>
  </div>
{/if}

{#if isMobile && mobileActionImage}
  {@const action = mobileActionImage}
  <div
    class="fixed inset-0 z-60 bg-black/60 no-scroll-chain"
    role="presentation"
    onclick={() => (mobileActionImage = null)}
  ></div>
  <div class="fixed bottom-0 inset-x-0 z-60 bg-neutral-900 border-t border-neutral-800 rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl">
    <div class="bottom-sheet-handle"></div>
    <div class="px-4 pb-2 space-y-1">
      <div class="flex items-center gap-3 py-1">
        <img use:lazyThumbnail={{ image: action, size: 160 }} alt={action.filename} class="w-12 h-12 rounded-lg border border-neutral-800 object-cover shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-sm text-neutral-100 truncate">{action.filename}</p>
          <select
            class="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-200"
            value={boardLabel(action)}
            onchange={(e) => assignBoard(action, (e.target as HTMLSelectElement).value)}
          >
            <option value="Unsorted">{locale.t("gallery.unsorted")}</option>
            {#each gallery.boards as board}
              <option value={board}>{board}</option>
            {/each}
          </select>
        </div>
        <button
          type="button"
          class="shrink-0 w-9 h-9 touch-target flex items-center justify-center rounded-lg text-neutral-400 active:bg-neutral-800"
          aria-label={locale.t("common.close")}
          onclick={() => (mobileActionImage = null)}
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="h-px bg-neutral-800 my-1"></div>
      <div class="grid grid-cols-4 gap-2 pt-1">
        {#if isVideoImage(action)}
          <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-neutral-800 active:bg-neutral-700 text-neutral-200" onclick={() => { gallery.openLightbox(action); mobileActionImage = null; }}>
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            <span class="text-[10px] leading-none">{locale.t("gallery.play_video")}</span>
          </button>
        {:else}
          <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-[#FFCC00] active:bg-[#FFDD4D] text-black font-semibold" onclick={() => { img2imgImage(action); mobileActionImage = null; }}>
            <span class="text-[11px] font-bold leading-none">I2I</span>
            <span class="text-[10px] leading-none">{locale.t("gallery.img2img")}</span>
          </button>
          <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-[#FFCC00] active:bg-[#FFDD4D] text-black font-semibold" onclick={() => { inpaintImage(action); mobileActionImage = null; }}>
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            <span class="text-[10px] leading-none">{locale.t("gallery.inpaint")}</span>
          </button>
          {#if !action.is_upscaled}
            <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-[#FFCC00] active:bg-[#FFDD4D] text-black font-semibold" onclick={() => { upscaleImage(action); mobileActionImage = null; }}>
              <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="text-[10px] leading-none">{locale.t("gallery.upscale")}</span>
            </button>
          {:else}
            <button type="button" disabled class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-neutral-800 text-neutral-600 opacity-50">
              <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="text-[10px] leading-none">{locale.t("gallery.upscale")}</span>
            </button>
          {/if}
          <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-neutral-800 active:bg-neutral-700 text-neutral-200" onclick={() => { gallery.copyToClipboard(action); mobileActionImage = null; }}>
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="text-[10px] leading-none">{locale.t("gallery.copy")}</span>
          </button>
          <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-neutral-800 active:bg-neutral-700 text-neutral-200" onclick={() => { gallery.toggleComparePin(action); mobileActionImage = null; }}>
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            <span class="text-[10px] leading-none">{locale.t("gallery.compare.short")}</span>
          </button>
        {/if}
        <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-neutral-800 active:bg-neutral-700 text-neutral-200 disabled:opacity-50" disabled={gallery.saving} onclick={() => { gallery.saveImageAs(action); mobileActionImage = null; }}>
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span class="text-[10px] leading-none">{locale.t("gallery.save")}</span>
        </button>
        <button type="button" class="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-red-900/70 active:bg-red-800 text-red-200" onclick={() => { gallery.deleteImage(action); mobileActionImage = null; }}>
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span class="text-[10px] leading-none">{locale.t("gallery.delete")}</span>
        </button>
      </div>
    </div>
  </div>
{/if}

{#if isMobile && gallery.lightboxOpen}
  <MobileGalleryLightbox />
{/if}
