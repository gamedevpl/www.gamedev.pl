// Matches shell commands; server text describes data instead.
export const SHELL_COMMAND =
  /\b(curl|wget)\s|--upload-file|--use-gl|chromium\.launch|\btar -x|\| *(ba)?sh\b|\bnpm run\b|\bnpx\s/i;
