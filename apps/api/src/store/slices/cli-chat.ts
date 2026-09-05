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
  getCliChat(uid: string): Promise<CliChatRecord | null>;
  putCliChat(uid: string, record: CliChatRecord): Promise<void>;
}

export function clipCliChatTurns(turns: CliChatTurn[]): CliChatTurn[] {
  return turns.slice(-MAX_CLI_CHAT_TURNS);
}

export class InMemoryCliChatStore implements CliChatStore {
  // Not private -- deleteAccountIdentity reaches this Map.
  chats = new Map<string, CliChatRecord>();

  async getCliChat(uid: string): Promise<CliChatRecord | null> {
    const record = this.chats.get(uid);
    return record
      ? {
          conversationId: record.conversationId,
          updatedAt: record.updatedAt,
          turns: record.turns.map((turn) => ({ ...turn })),
        }
      : null;
  }

  async putCliChat(uid: string, record: CliChatRecord): Promise<void> {
    this.chats.set(uid, {
      conversationId: record.conversationId,
      updatedAt: record.updatedAt,
      turns: record.turns.map((turn) => ({ ...turn })),
    });
  }
}

export class FirestoreCliChatStore implements CliChatStore {
  constructor(private db: Firestore) {}

  async getCliChat(uid: string): Promise<CliChatRecord | null> {
    const snap = await this.db.collection('cliChats').doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as CliChatRecord;
  }

  async putCliChat(uid: string, record: CliChatRecord): Promise<void> {
    await this.db.collection('cliChats').doc(uid).set(stripUndefined(record));
  }
}
