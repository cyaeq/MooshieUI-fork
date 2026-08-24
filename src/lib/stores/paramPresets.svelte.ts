import type { ParamPresetValues } from "../types/index.js";
import { triggerSync } from "../utils/syncTrigger.js";
import { locale } from "./locale.svelte.js";

const STORAGE_KEY = "mooshieui.paramPresets.v1";
const EXPORT_VERSION = 1;

export interface ParamPreset {
  id: string;
  name: string;
  params: Partial<ParamPresetValues>;
  createdAt: number;
  updatedAt: number;
}

interface PersistedState {
  version: number;
  presets: ParamPreset[];
}

/** Fields a preset may carry, with the primitive type each must be to survive sanitizing. */
const PARAM_FIELD_TYPES: Record<keyof ParamPresetValues, "number" | "boolean" | "string" | "string_or_null"> = {
  samplerName: "string",
  scheduler: "string",
  steps: "number",
  cfg: "number",
  denoise: "number",
  batchSize: "number",
  fluxGuidance: "number",
  smartGuidance: "boolean",
  width: "number",
  height: "number",
  upscaleEnabled: "boolean",
  upscaleMethod: "string",
  upscaleModel: "string_or_null",
  upscaleScale: "number",
  upscaleTargetScaleEnabled: "boolean",
  upscaleTargetScale: "number",
  upscaleDenoise: "number",
  upscaleSteps: "number",
  upscaleTileSize: "number",
  upscaleTiling: "boolean",
  upscaleFastRefine: "boolean",
  upscaleSoftGuidance: "boolean",
  upscaleSoftGuidanceMultiplier: "number",
  facefixEnabled: "boolean",
  facefixDetector: "string_or_null",
  facefixDenoise: "number",
  facefixSteps: "number",
  facefixGuideSize: "number",
  facefixMaxFaces: "number",
  facefixAutoPrompt: "boolean",
  controlnetEnabled: "boolean",
  controlnetMode: "string",
  controlnetPreset: "string_or_null",
  controlnetModel: "string_or_null",
  controlnetPreprocessor: "string_or_null",
  controlnetStrength: "number",
  controlnetStartPercent: "number",
  controlnetEndPercent: "number",
  styleTransferEnabled: "boolean",
  styleTransferLowScaleEnd: "number",
  styleTransferHighScaleStart: "number",
  styleTransferBeta: "number",
  styleTransferAdainStrength: "number",
  styleTransferRfMode: "string",
  styleTransferGamma: "number",
  styleTransferGammaCurve: "number",
  styleTransferNormStrength: "number",
  styleTransferPmiAlpha: "number",
  styleTransferMegapixels: "number",
  styleTransferBlocks: "string",
  outputFormat: "string",
  outputBitDepth: "string",
  metadataMode: "string",
};

function genId(): string {
  return `pps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeParams(raw: any): Partial<ParamPresetValues> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(PARAM_FIELD_TYPES)) {
    const value = raw[key];
    if (value === undefined) continue;
    if (kind === "number") {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    } else if (kind === "boolean") {
      if (typeof value === "boolean") out[key] = value;
    } else if (kind === "string") {
      if (typeof value === "string") out[key] = value;
    } else if (value === null || typeof value === "string") {
      out[key] = value;
    }
  }
  return out as Partial<ParamPresetValues>;
}

function sanitizePreset(raw: any): ParamPreset | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const now = Date.now();
  return {
    id: raw.id,
    name: raw.name.trim() || locale.t("param_presets.untitled"),
    params: sanitizeParams(raw.params),
    createdAt: typeof raw.createdAt === "number" && raw.createdAt > 0 ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" && raw.updatedAt > 0 ? raw.updatedAt : now,
  };
}

class ParamPresetsStore {
  presets = $state<ParamPreset[]>([]);

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (!Array.isArray(parsed.presets)) return;
      this.presets = parsed.presets.map(sanitizePreset).filter(Boolean) as ParamPreset[];
    } catch (e) {
      console.error("param-presets: load failed", e);
    }
  }

  private saveSettings() {
    try {
      const payload: PersistedState = { version: EXPORT_VERSION, presets: this.presets };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      triggerSync();
    } catch (e) {
      console.error("param-presets: save failed", e);
    }
  }

  getById(id: string): ParamPreset | null {
    return this.presets.find((preset) => preset.id === id) ?? null;
  }

  create(name: string, params: ParamPresetValues): ParamPreset {
    const now = Date.now();
    const preset: ParamPreset = {
      id: genId(),
      name: name.trim() || locale.t("param_presets.untitled"),
      params: sanitizeParams(params),
      createdAt: now,
      updatedAt: now,
    };
    this.presets = [preset, ...this.presets];
    this.saveSettings();
    return preset;
  }

  update(id: string, patch: { name?: string; params?: ParamPresetValues }): void {
    let changed = false;
    this.presets = this.presets.map((preset) => {
      if (preset.id !== id) return preset;
      changed = true;
      return {
        ...preset,
        name: typeof patch.name === "string" ? patch.name.trim() || preset.name : preset.name,
        params: patch.params ? sanitizeParams(patch.params) : preset.params,
        updatedAt: Date.now(),
      };
    });
    if (changed) this.saveSettings();
  }

  remove(id: string): void {
    if (!this.getById(id)) return;
    this.presets = this.presets.filter((preset) => preset.id !== id);
    this.saveSettings();
  }

  collectPrefs(): unknown {
    return { presets: this.presets };
  }

  applyServerPrefs(data: any): void {
    try {
      if (!Array.isArray(data?.presets)) return;
      const sanitized = data.presets.map(sanitizePreset).filter(Boolean) as ParamPreset[];
      this.presets = sanitized;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: EXPORT_VERSION, presets: sanitized }),
      );
    } catch (e) {
      console.error("param-presets: applyServerPrefs failed", e);
    }
  }
}

export const paramPresets = new ParamPresetsStore();
