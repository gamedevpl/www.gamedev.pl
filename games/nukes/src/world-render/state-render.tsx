import styled from 'styled-components';

import { State } from '../world/world-state-types';

export function StateRender(_props: { state: State }) {
  return <StateContainer />;
}

const StateContainer = styled.div``;
