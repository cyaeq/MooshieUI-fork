<script lang="ts">
  import {
    generation,
    DEFAULT_ANIMA_POSITIVE_QUALITY,
    DEFAULT_ANIMA_NEGATIVE_QUALITY,
    DEFAULT_ILLUSTRIOUS_POSITIVE_QUALITY,
    DEFAULT_ILLUSTRIOUS_NEGATIVE_QUALITY,
    DEFAULT_PONY_POSITIVE_QUALITY,
    DEFAULT_PONY_NEGATIVE_QUALITY,
    DEFAULT_NANOSAUR_POSITIVE_QUALITY,
    DEFAULT_NANOSAUR_NEGATIVE_QUALITY,
  } from "../../stores/generation.svelte.js";
  import { locale } from "../../stores/locale.svelte.js";

  type Family = "anima" | "illustrious" | "pony" | "nanosaur";

  const family = $derived<Family | null>(
    generation.isAnima
      ? "anima"
      : generation.isIllustrious
        ? "illustrious"
        : generation.isPony
          ? "pony"
          : generation.isNanosaur
            ? "nanosaur"
            : null,
  );

  const familyLabel = $derived(family ? locale.t(`settings.performance.${family}`) : "");

  const positiveValue = $derived(
    family === "anima"
      ? generation.customAnimaPositiveQuality
      : family === "illustrious"
        ? generation.customIllustriousPositiveQuality
        : family === "pony"
          ? generation.customPonyPositiveQuality
          : family === "nanosaur"
            ? generation.customNanosaurPositiveQuality
            : "",
  );

  const negativeValue = $derived(
    family === "anima"
      ? generation.customAnimaNegativeQuality
      : family === "illustrious"
        ? generation.customIllustriousNegativeQuality
        : family === "pony"
          ? generation.customPonyNegativeQuality
          : family === "nanosaur"
            ? generation.customNanosaurNegativeQuality
            : "",
  );

  function setPositive(value: string) {
    if (family === "anima") generation.customAnimaPositiveQuality = value;
    else if (family === "illustrious") generation.customIllustriousPositiveQuality = value;
    else if (family === "pony") generation.customPonyPositiveQuality = value;
    else if (family === "nanosaur") generation.customNanosaurPositiveQuality = value;
  }

  function setNegative(value: string) {
    if (family === "anima") generation.customAnimaNegativeQuality = value;
    else if (family === "illustrious") generation.customIllustriousNegativeQuality = value;
    else if (family === "pony") generation.customPonyNegativeQuality = value;
    else if (family === "nanosaur") generation.customNanosaurNegativeQuality = value;
  }

  function resetFamily() {
    if (family === "anima") {
      generation.customAnimaPositiveQuality = DEFAULT_ANIMA_POSITIVE_QUALITY;
      generation.customAnimaNegativeQuality = DEFAULT_ANIMA_NEGATIVE_QUALITY;
    } else if (family === "illustrious") {
      generation.customIllustriousPositiveQuality = DEFAULT_ILLUSTRIOUS_POSITIVE_QUALITY;
      generation.customIllustriousNegativeQuality = DEFAULT_ILLUSTRIOUS_NEGATIVE_QUALITY;
    } else if (family === "pony") {
      generation.customPonyPositiveQuality = DEFAULT_PONY_POSITIVE_QUALITY;
      generation.customPonyNegativeQuality = DEFAULT_PONY_NEGATIVE_QUALITY;
    } else if (family === "nanosaur") {
      generation.customNanosaurPositiveQuality = DEFAULT_NANOSAUR_POSITIVE_QUALITY;
      generation.customNanosaurNegativeQuality = DEFAULT_NANOSAUR_NEGATIVE_QUALITY;
    }
    generation.saveSettings();
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between gap-2">
    <label class="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
      <input
        type="checkbox"
        checked={generation.autoQualityTags}
        onchange={(e) => {
          generation.autoQualityTags = (e.target as HTMLInputElement).checked;
          generation.saveSettings();
        }}
        class="w-3.5 h-3.5 accent-indigo-500 rounded"
      />
      {locale.t('settings.performance.auto_quality_tags')}
    </label>
    {#if family}
      <span class="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">{familyLabel}</span>
    {/if}
  </div>

  {#if !family}
    <p class="text-[10px] text-neutral-500">{locale.t('generation.quality_tags.unsupported')}</p>
  {:else}
    <div class="{generation.autoQualityTags ? '' : 'opacity-50 pointer-events-none'} space-y-1.5">
      <div>
        <label for="quality-tags-positive" class="text-[10px] text-neutral-500">{locale.t('settings.performance.positive')}</label>
        <textarea
          id="quality-tags-positive"
          value={positiveValue}
          oninput={(e) => setPositive((e.target as HTMLTextAreaElement).value)}
          onblur={() => generation.saveSettings()}
          rows="2"
          class="w-full mt-0.5 px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500/50 resize-y"
          placeholder={locale.t('settings.prompt.positive_example')}
        ></textarea>
      </div>
      <div>
        <label for="quality-tags-negative" class="text-[10px] text-neutral-500">{locale.t('settings.performance.negative')}</label>
        <textarea
          id="quality-tags-negative"
          value={negativeValue}
          oninput={(e) => setNegative((e.target as HTMLTextAreaElement).value)}
          onblur={() => generation.saveSettings()}
          rows="2"
          class="w-full mt-0.5 px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500/50 resize-y"
          placeholder={locale.t('settings.prompt.negative_example')}
        ></textarea>
      </div>
      <div class="flex items-center justify-between gap-2">
        <p class="text-[10px] text-amber-400/70">{locale.t('settings.performance.quality_tags_warning')}</p>
        <button
          type="button"
          onclick={resetFamily}
          class="shrink-0 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer whitespace-nowrap"
        >
          {locale.t('settings.performance.reset_defaults')}
        </button>
      </div>
    </div>
  {/if}
</div>
