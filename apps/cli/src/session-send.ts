import type { Steer } from './live-agent.js';
import type { SessionState } from './session-controller.js';
import type { Delivery } from './session-delivery.js';
import { splitEvidence } from './workbench-evidence.js';

export function createSessionSender(input: {
  get: () => SessionState;
  set: (state: SessionState) => void;
  emit: () => void;
  save: (lines: string[]) => void;
  remember: (text: string, resetIndex: boolean) => void;
  clearFollowup: (text: string) => void;
  clearUndo: () => void;
}) {
  let nextDelivery = 1;
  const updateDelivery = (id: number, status: Delivery['status']) => {
    const state = input.get();
    const delivery = state.deliveries.find((item) => item.id === id);
    if (
      !delivery ||
      (delivery.status !== 'pending' &&
        delivery.status !== 'queued' &&
        !(delivery.status === 'unconfirmed' && status === 'received'))
    )
      return;
    input.set({
      ...state,
      deliveries: state.deliveries.map((item) => (item.id === id ? { ...item, status } : item)),
      sendStatus:
        state.deliveries.at(-1)?.id === id
          ? status === 'received'
            ? 'Accepted by the agent'
            : 'Delivery not confirmed; the message may be queued.'
          : state.sendStatus,
    });
    input.emit();
  };
  return async (send: Steer, text: string, shown: string): Promise<boolean> => {
    input.set({ ...input.get(), sending: true, sendStatus: 'Sending to the active agent…' });
    input.emit();
    const typed = splitEvidence(text).text.trim();
    try {
      const receipt = await send(text);
      const status: Delivery['status'] = receipt?.status ?? 'received';
      const id = nextDelivery++;
      const line = `› [${status === 'received' ? 'sent to active agent' : 'message to agent'}] ${shown}`;
      input.save([line]);
      input.remember(typed, false);
      input.clearFollowup(text);
      const state = input.get();
      input.set({
        ...state,
        lines: [...state.lines, line],
        deliveries: [...state.deliveries, { id, text: shown, status }].slice(-50),
        sendStatus: status === 'received' ? 'Accepted by the agent' : 'Waiting for the agent; check delivery status.',
        ...(state.draft.trim() === text ? { draft: '', draftCursor: 0 } : {}),
      });
      if (!input.get().draft) input.clearUndo();
      if (receipt) {
        void receipt.confirmation.then(
          () => updateDelivery(id, 'received'),
          () => updateDelivery(id, 'unconfirmed'),
        );
      }
      return true;
    } catch (error) {
      const status = `${error instanceof Error ? error.message : 'Sending failed.'} Message saved in history.`;
      const line = `› [delivery not confirmed] ${shown}`;
      input.save([line, status]);
      input.remember(typed, true);
      input.set({ ...input.get(), lines: [...input.get().lines, line, status], sendStatus: status });
      return false;
    } finally {
      input.set({ ...input.get(), sending: false });
      input.emit();
    }
  };
}

export function markUndelivered(deliveries: Delivery[]): Delivery[] {
  return deliveries.map((item) =>
    item.status === 'pending' || item.status === 'queued' ? { ...item, status: 'unconfirmed' } : item,
  );
}
