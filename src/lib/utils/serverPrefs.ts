/** Server-side preference snapshots used by explicit browser upload/download. */

import { authHeaders, isBrowserMode } from "./ipc.js";

export interface UserPrefsData {
  generation?: Record<string, unknown>;
  prompt_history?: unknown[];
  prompt_presets?: unknown;
  styles?: unknown;
  lora_presets?: unknown;
  param_presets?: unknown;
  artist_favourites?: unknown;
  prompt_favourites?: unknown;
  gallery_boards?: unknown;
  autocomplete?: unknown;
  accessibility?: unknown;
  notes?: unknown;
  video_timeline?: unknown;
  locale?: string;
  updated_at?: string;
}

export async function fetchServerPrefs(): Promise<UserPrefsData | null> {
  if (!isBrowserMode) {
    throw new Error("Server preference download is only available in browser mode");
  }

  const response = await fetch("/internal-api/_user/prefs", {
    headers: authHeaders(),
  });
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Preference download failed (${response.status})`);
  }
  return (await response.json()) as UserPrefsData;
}

export async function pushServerPrefs(prefs: UserPrefsData): Promise<void> {
  if (!isBrowserMode) {
    throw new Error("Server preference upload is only available in browser mode");
  }

  const response = await fetch("/internal-api/_user/prefs", {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(prefs),
  });
  if (!response.ok) {
    throw new Error(`Preference upload failed (${response.status})`);
  }
}
