import React from "react";
import logo from "../logo-gamedev.png";

export default function AppHeader() {
  return (
    <header className="App-header">
      <a href="https://www.gamedev.pl" className="logo">
        <img
          src={logo}
          alt="Gamedev.pl - Tworzymy gry"
          width="70"
          height="60"
        />
        gamedev<span className="turquoise">.pl</span>
      </a>
    </header>
  );
}
