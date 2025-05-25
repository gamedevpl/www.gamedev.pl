import { useTranslation } from 'react-i18next';
import Section from '../components/section';
import styled from 'styled-components';

import nukesHighlight from '../assets/nukes-highlight.png';
import monsterStepsHighlight from '../assets/monster-steps-highlight.png';
import masterplanHighlight from '../assets/masterplan-highlight.png';
import xmasHighlight from '../assets/xmas-highlight.png';
import hungryLionHighlight from '../assets/hungry-lion-highlights.png';

export default function OurGames() {
  const { t } = useTranslation();

  return (
    <Section>
      <GameBox
        title={t('XMAS')}
        description={t('Świąteczna platformówka')}
        highlight={xmasHighlight}
        href={'/games/xmas/'}
        githubUrl="https://github.com/gamedevpl/www.gamedev.pl/tree/master/games/xmas"
        inProgress={false}
      />
      <GameBox
        title={t('Nukes')}
        description={t('Symulacja wojny nuklearnej')}
        highlight={nukesHighlight}
        href={'/games/nukes/'}
        githubUrl="https://github.com/gamedevpl/www.gamedev.pl/tree/master/games/nukes"
        inProgress={false}
      />
      <GameBox
        title={t('Monster steps')}
        description={t('Turowa gra logiczna')}
        highlight={monsterStepsHighlight}
        href={'/games/monster-steps/'}
        githubUrl="https://github.com/gamedevpl/www.gamedev.pl/tree/master/games/monster-steps"
        inProgress={false}
      />
      <GameBox
        title={t('MasterPlan')}
        description={t('Offline multiplayer strategy game')}
        highlight={masterplanHighlight}
        href={'/games/masterplan/'}
        githubUrl="https://github.com/gamedevpl/www.gamedev.pl/tree/master/games/masterplan"
        inProgress={false}
      />
      <GameBox
        title={t('Hungry Lion')}
        description={t('You are a hungry lion! You need to eat.')}
        highlight={hungryLionHighlight}
        href={'/games/hungry-lion/'}
        githubUrl={'https://github.com/gamedevpl/www.gamedev.pl/tree/master/games/hungry-lion'}
        inProgress={false}
      />
    </Section>
  );
}

function GameBox(props: {
  title: string;
  description: string;
  highlight: string;
  href: string;
  githubUrl: string;
  inProgress: boolean;
}) {
  return (
    <GameBoxContent href={props.href}>
      <img src={props.highlight} alt={props.title} />
      <h4>{props.title}</h4>
      {props.inProgress && <WorkInProgressBadge>Work in progress</WorkInProgressBadge>}
      <SourceCodeLink href={props.githubUrl} onClick={(e) => e.stopPropagation()} target="_blank">
        <SourceCodeIcon>&lt;/&gt;</SourceCodeIcon>
      </SourceCodeLink>
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

const SourceCodeLink = styled.a`
  position: absolute;
  bottom: 10px;
  right: 10px;
  z-index: 2;
  text-decoration: none;

  &:hover {
    > div {
      background: rgba(0, 0, 0, 0.8);
    }
  }
`;

const SourceCodeIcon = styled.div`
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border-radius: 4px;
  padding: 4px 8px;
  font-family: monospace;
  font-size: 14px;
  font-weight: bold;
  transition: background-color 0.2s;
`;
