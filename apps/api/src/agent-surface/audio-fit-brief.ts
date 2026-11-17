// A copied starter block passes every gate; the brief must ask.
const AUDIO_FIT =
  'No shared mood fits: write the game its own `music.json`. Name sounds the catalog lacks in `audio.wanted`, and report your picks in `report_progress`.';
const AUDIO_FIT_SHELL = `- Fit audio to this game’s theme; a starter’s \`audio\` block is a placeholder. Run \`npm run audio:find -- <words>\` per sound event and \`-- --music\` for moods (script missing: grep \`"subject"\` in \`shared/audio/sourced.json\`). ${AUDIO_FIT}`;
const AUDIO_FIT_TOOLS = `- Fit audio to this game’s theme; the exemplar’s \`audio\` block is a placeholder. Take music from the moods in get_kit_api’s Audio catalog and effects from \`search_kit_files\` (prefix \`shared/audio\`, one theme word per query). ${AUDIO_FIT}`;

export const audioFitLine = (shell: boolean): string => (shell ? AUDIO_FIT_SHELL : AUDIO_FIT_TOOLS);
