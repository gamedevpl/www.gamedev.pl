import { createCreatorNotesTools, type CreatorNotesToolsDeps } from './mcp-creator-notes-tools.js';
import { createPlayJournalTools } from './mcp-play-journal-tools.js';
export function createManagedContextTools(deps: CreatorNotesToolsDeps) {
  return { ...createCreatorNotesTools(deps), ...createPlayJournalTools(deps) };
}
