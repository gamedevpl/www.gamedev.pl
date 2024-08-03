import { State, Strategy, WorldState } from '../world/world-state-types';
import { dispatchFullScreenMessage, useFullScreenMessageActionEvent } from './full-screen-messages';

const PROPOSAL_PREFIX = 'ALLIANCEPROPOSAL';

export function dispatchAllianceProposal(
  senderState: State,
  receiverState: State,
  worldState: WorldState,
  isAutomaticProposal: boolean = false,
) {
  const messageId = `${PROPOSAL_PREFIX}_${senderState.id}_${receiverState.id}`;
  const message = isAutomaticProposal
    ? `${senderState.name} has become friendly towards you. Do you want to form an alliance?`
    : `${senderState.name} proposes an alliance with ${receiverState.name}. Do you accept?`;
  const startTimestamp = worldState.timestamp;
  const endTimestamp = startTimestamp + 10; // 10 seconds to respond

  dispatchFullScreenMessage(
    message,
    startTimestamp,
    endTimestamp,
    messageId,
    [
      { id: 'accept', text: 'Accept' },
      { id: 'reject', text: 'Reject' },
    ],
    true,
  );
}

export function AllianceProposals({
  worldState,
  setWorldState,
}: {
  worldState: WorldState;
  setWorldState: (worldState: WorldState) => void;
}) {
  useFullScreenMessageActionEvent((event) => {
    if (event.messageId.startsWith(PROPOSAL_PREFIX)) {
      const [, senderId, receiverId] = event.messageId.split('_');
      const senderState = worldState.states.find((state) => state.id === senderId);
      const receiverState = worldState.states.find((state) => state.id === receiverId);

      if (!senderState || !receiverState?.isPlayerControlled) {
        // this should hot happen anyway, but just in case
        return;
      }

      if (event.actionId === 'accept') {
        // Update strategies to FRIENDLY for both states
        const updatedStates = worldState.states.map((state) => {
          if (state.id === senderId || state.id === receiverId) {
            return {
              ...state,
              strategies: {
                ...state.strategies,
                [senderId]: Strategy.FRIENDLY,
                [receiverId]: Strategy.FRIENDLY,
              },
            };
          }
          return state;
        });

        setWorldState({
          ...worldState,
          states: updatedStates,
        });

        // Dispatch a confirmation message
        dispatchFullScreenMessage(
          `Alliance formed between ${senderState.name} and ${receiverState.name}!`,
          worldState.timestamp,
          worldState.timestamp + 5,
        );
      } else if (event.actionId === 'reject') {
        // Dispatch a rejection message
        dispatchFullScreenMessage(
          `${receiverState.name} has rejected the alliance proposal from ${senderState.name}.`,
          worldState.timestamp,
          worldState.timestamp + 5,
        );
      }
    }
  });

  return null;
}
