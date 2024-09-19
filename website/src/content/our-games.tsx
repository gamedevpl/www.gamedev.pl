import { useTranslation } from 'react-i18next';
import Section from '../components/section';
import styled from 'styled-components';

import nukesHighlight from '../assets/nukes-highlight.png';
import monsterStepsHighlight from '../assets/monster-steps-highlight.png';
import masterplanHighlight from '../assets/masterplan-highlight.png';

export default function OurGames() {
  const { t } = useTranslation();

  return (
    <Section>
      <GameBox
        title={t('Nukes')}
        description={t('Symulacja wojny nuklearnej')}
        highlight={nukesHighlight}
        href={'/games/nukes/'}
        inProgress={true}
      />
      <GameBox
        title={t('Monster steps')}
        description={t('Turowa gra logiczna')}
        highlight={monsterStepsHighlight}
        href={'/games/monster-steps/'}
        inProgress={false}
      />
      <GameBox
        title={t('MasterPlan')}
        description={t('Offline multiplayer strategy game')}
        highlight={masterplanHighlight}
        href={'/games/masterplan/'}
        inProgress={true}
      />
    </Section>
  );
}

function GameBox(props: { title: string; description: string; highlight: string; href: string; inProgress: boolean }) {
  return (
    <GameBoxContent href={props.href}>
      <img src={props.highlight} alt={props.title} />
      <h4>{props.title}</h4>
      {props.inProgress && <WorkInProgressBadge>Work in progress</WorkInProgressBadge>}
    </GameBoxContent>
  );
}

const GameBoxContent = styled.a`
  position: relative;
  margin-right: 20px;
  overflow: hidden;
  display: inline-block;
  img {
    max-width: 300px;
    width: 300px;
    height: 300px;
  }
  h4 {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 10px;
    margin: 0;
    background: rgba(0, 0, 0, 0.5);
  }
`;

const WorkInProgressBadge = styled.div`
  position: absolute;
  top: 30px;
  right: -35px;
  background: black;
  color: white;
  padding: 5px 40px;
  font-size: 12px;
  font-weight: bold;
  transform: rotate(45deg);
  text-align: center;
  z-index: 1;
`;
