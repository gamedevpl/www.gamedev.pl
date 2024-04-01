import styled from 'styled-components';

import { State } from '../world/world-state-types';

export function StateRender({ state }: { state: State }) {
  return <StateContainer />;
}

const StateContainer = styled.div``;
