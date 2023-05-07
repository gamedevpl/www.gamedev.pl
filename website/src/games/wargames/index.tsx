import React from "react";
import PageWrapper from "../../components/page-wrapper";
import Section from "../../components/section";
import styled from "styled-components";
import highlight from "./highlight.png";

export default function WarGames() {
  return (
    <PageWrapper title="WarGames by Gamedev.pl">
      <Section isTransparent={false}>
        <h1>War Games</h1>
        <p>
          <a href="https://pl.wikipedia.org/wiki/Gry_wojenne_(film_1983)">
            WarGames
          </a>{" "}
          to film z 1983 roku, w którym głównę rolę gra komputer służący do
          symulacji globalnego konfliktu zbrojnego.
        </p>
        <p>
          <b>UWAGA: Gra jest w trakcie przygotowań!</b>
        </p>
      </Section>
    </PageWrapper>
  );
}

const WarGamesWrapper = styled.div`
  background: url(${highlight}) no-repeat;
  background-size: 100%;
  height: 100vh;
`;
