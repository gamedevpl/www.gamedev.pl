export function linkifyTerminalText(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"']+/g, (url) =>
    [...url].some((ch) => ch.charCodeAt(0) < 32 || (ch.charCodeAt(0) >= 127 && ch.charCodeAt(0) <= 159))
      ? url
      : `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\`,
  );
}
