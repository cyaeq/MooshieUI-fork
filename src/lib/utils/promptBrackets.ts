/**
 * Bracket balance checking for prompt text, ported from A1111's
 * prompt-bracket-checker extension.
 *
 * Reports unbalanced `()`, `[]` and `{}` pairs so users notice a typo before
 * queueing a generation. Backslash escapes are honoured: `\(` is literal text.
 */

import { locale } from "../stores/locale.svelte.js";

type BracketPair = readonly [open: string, close: string, labelKey: string];

const PAIRS: readonly BracketPair[] = [
  ["(", ")", "prompt_brackets.round"],
  ["[", "]", "prompt_brackets.square"],
  ["{", "}", "prompt_brackets.curly"],
];

export interface BracketCheckResult {
  balanced: boolean;
  issues: string[];
}

/**
 * Counts bracket pairs in `value` and returns human-readable issues for any
 * that do not balance out. An empty `issues` array means the text is fine.
 */
export function checkBrackets(value: string): BracketCheckResult {
  const issues: string[] = [];

  for (const [open, close, labelKey] of PAIRS) {
    const label = locale.t(labelKey);
    let count = 0;
    let outOfOrder = false;
    let escaped = false;

    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === open) {
        count++;
      } else if (char === close) {
        count--;
        if (count < 0) {
          outOfOrder = true;
          break;
        }
      }
    }

    if (outOfOrder) {
      issues.push(locale.t("prompt_brackets.out_of_order", { brackets: label }));
    } else if (count > 0) {
      issues.push(locale.t("prompt_brackets.extra_opening", { count, brackets: label }));
    } else if (count < 0) {
      issues.push(locale.t("prompt_brackets.extra_closing", { count: -count, brackets: label }));
    }
  }

  return { balanced: issues.length === 0, issues };
}

export interface TagReorderResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Moves the comma-separated tag under the cursor one slot left or right,
 * ported from A1111's `edit-order.js`.
 *
 * Returns `null` when the move is a no-op (single tag, or already at the edge)
 * so callers can leave the textarea untouched.
 */
export function moveTag(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: -1 | 1,
): TagReorderResult | null {
  const items = value.split(",");
  if (items.length < 2) return null;

  // Locate the tag range covered by the current selection by counting commas.
  let indexStart = value.slice(0, selectionStart).split(",").length - 1;
  let indexEnd = value.slice(0, selectionEnd).split(",").length - 1;
  if (indexEnd < indexStart) [indexStart, indexEnd] = [indexEnd, indexStart];

  const target = direction < 0 ? indexStart - 1 : indexEnd + 1;
  if (target < 0 || target >= items.length) return null;

  const selected = items.splice(indexStart, indexEnd - indexStart + 1);
  items.splice(direction < 0 ? indexStart - 1 : indexStart + 1, 0, ...selected);

  const nextValue = items.join(",");
  const newIndexStart = indexStart + direction;
  const newIndexEnd = newIndexStart + (indexEnd - indexStart);

  // Recompute the selection so the moved tag stays highlighted.
  let start = 0;
  for (let i = 0; i < newIndexStart; i++) start += items[i].length + 1;
  let end = start;
  for (let i = newIndexStart; i <= newIndexEnd; i++) end += items[i].length + 1;
  end = Math.min(end - 1, nextValue.length);

  return { value: nextValue, selectionStart: start, selectionEnd: end };
}
