/**
 * Tag-level prompt merging for the "merge" apply mode of saved prompts.
 *
 * Kept separate from `animadex/characterInsert.ts` so the generation store does
 * not have to depend on an animadex module.
 */

function splitTags(prompt: string): string[] {
  return prompt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Literal dedupe key: weighted tags like `(tag:1.2)` stay distinct from `tag`. */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Appends the tags of `incoming` that are absent from `existing` (and from
 * `extra`, the extra prompt boxes) to the end of `existing`, preserving order.
 */
export function mergePromptTags(
  existing: string,
  incoming: string,
  extra?: string[],
): { text: string; added: number } {
  const base = splitTags(existing);
  const seen = new Set(base.map(tagKey));
  for (const box of extra ?? []) {
    for (const tag of splitTags(box)) seen.add(tagKey(tag));
  }
  const appended: string[] = [];
  for (const tag of splitTags(incoming)) {
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    appended.push(tag);
  }
  return { text: [...base, ...appended].join(", "), added: appended.length };
}
