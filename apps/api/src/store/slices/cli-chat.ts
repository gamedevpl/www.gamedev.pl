import type { Firestore } from '@google-cloud/firestore';
import { stripUndefined } from '../firestore-util.js';

export const MAX_CLI_CHAT_TURNS = 16;

export type CliChatTurn = { role: 'user' | 'assistant'; text: string };

export type CliChatRecord = {
  conversationId: string;
  turns: CliChatTurn[];
  updatedAt: string;
};

export interface CliChatStore {
  getCliChat(uid: string, conversationId?: string): Promise<CliChatRecord | null>;
  putCliChat(uid: string, record: CliChatRecord): Promise<void>;
}

export function clipCliChatTurns(turns: CliChatTurn[]): CliChatTurn[] {
  return turns.slice(-MAX_CLI_CHAT_TURNS);
}

const MAX_CONVERSATIONS = 8;
const MAX_HISTORY_BYTES = 700_000;
type SavedChats = CliChatRecord & { previous?: CliChatRecord[] };

function select(record: SavedChats | undefined, id?: string): CliChatRecord | null {
  const found =
    !id || record?.conversationId === id ? record : record?.previous?.find((chat) => chat.conversationId === id);
  return found
    ? {
        conversationId: found.conversationId,
        updatedAt: found.updatedAt,
        turns: found.turns.map((turn) => ({ ...turn })),
      }
    : null;
}

function retain(existing: SavedChats | undefined, record: CliChatRecord): SavedChats {
  const previous = [existing, ...(existing?.previous ?? [])]
    .filter((chat): chat is SavedChats => Boolean(chat) && chat!.conversationId !== record.conversationId)
    .slice(0, MAX_CONVERSATIONS - 1)
    .map((chat) => select(chat)!);
  const next = { ...select(record)!, previous };
  while (previous.length && Buffer.byteLength(JSON.stringify(next)) > MAX_HISTORY_BYTES) previous.pop();
  return next;
}

export class InMemoryCliChatStore implements CliChatStore {
  // Not private -- deleteAccountIdentity reaches this Map.
  chats = new Map<string, SavedChats>();

  async getCliChat(uid: string, conversationId?: string): Promise<CliChatRecord | null> {
    return select(this.chats.get(uid), conversationId);
  }

  async putCliChat(uid: string, record: CliChatRecord): Promise<void> {
    this.chats.set(uid, retain(this.chats.get(uid), record));
  }
}

export class FirestoreCliChatStore implements CliChatStore {
  constructor(private db: Firestore) {}

  async getCliChat(uid: string, conversationId?: string): Promise<CliChatRecord | null> {
    const snap = await this.db.collection('cliChats').doc(uid).get();
    return select(snap.exists ? (snap.data() as SavedChats) : undefined, conversationId);
  }

  async putCliChat(uid: string, record: CliChatRecord): Promise<void> {
    const ref = this.db.collection('cliChats').doc(uid);
    await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const existing = snap.exists ? (snap.data() as SavedChats) : undefined;
      transaction.set(ref, stripUndefined(retain(existing, record)));
    });
  }
}
