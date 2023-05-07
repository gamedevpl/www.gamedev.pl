import OurGames from "../content/our-games";
import AppHeader from "../content/app-header";
import React from "react";
import PageWrapper from "../components/page-wrapper";

export default function Games() {
  return (
    <PageWrapper title="Nasze gry - Gamedev.pl">
      <AppHeader />
      <OurGames />
    </PageWrapper>
  );
}
