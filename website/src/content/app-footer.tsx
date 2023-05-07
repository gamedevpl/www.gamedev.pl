import React from "react";
import styled from "styled-components";

export default function AppFooter() {
  return (
    <FooterContainer>
      <p className="copyrights">
        Wszelkie prawa zastrzeżone przez{" "}
        <a href="//www.gamedev.pl">Gamedev.pl</a>
        {" | "}
        <a href="https://github.com/gamedevpl/www.gamedev.pl/discussions">
          Forum
        </a>
      </p>
    </FooterContainer>
  );
}

const FooterContainer = styled.footer`
  border-radius: 5px;
  clear: both;
  background-color: #231f20;
  margin-bottom: 80px;
  height: 60px;
  padding: 0 20px;

  > p {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    float: left;
    font-size: 0.86667em;
    font-weight: 600;
    line-height: 60px;
    color: #929191;
    margin: 0;
    padding: 0;
    border: 0;
    vertical-align: baseline;

    > a {
      color: #00e4ac;
    }
  }
`;
