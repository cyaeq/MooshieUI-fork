/** Clean prompt text for display and re-filling without mutating stored data. */
export function cleanPromptDisplay(text: string): string {
  return Array.from(text ?? "")
    .filter((ch) => ch !== "\uFFFD" && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(ch))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return !(code >= 0xD800 && code <= 0xDFFF);
    })
    .join("");
}
