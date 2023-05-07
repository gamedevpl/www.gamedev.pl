import { useTranslation } from "react-i18next";
import { Heading2 } from "../components/headers";
import Section from "../components/section";
import styled from "styled-components";

import warGamesHighlight from "../games/wargames/highlight.png";

export default function OurGames() {
  const { t } = useTranslation();

  return (
    <Section isTransparent>
      <Heading2>Pierwsza gra już wkrótce...</Heading2>
      {/*<Heading2>{t("Nasze gry")}</Heading2>*/}
      {/*<GameBox*/}
      {/*  title={t("WarGames")}*/}
      {/*  description={t("Gra inspirowana filmem WarGames")}*/}
      {/*  highlight={warGamesHighlight}*/}
      {/*  href={"/games/wargames/"}*/}
      {/*/>*/}
    </Section>
  );
}

function GameBox(props: {
  title: string;
  description: string;
  highlight: string;
  href: string;
}) {
  return (
    <GameBoxContent href={props.href}>
      <h4>{props.title}</h4>
      <img src={props.highlight} alt={props.title} />
    </GameBoxContent>
  );
}

const GameBoxContent = styled.a`
  img {
    max-width: 300px;
  }
`;
