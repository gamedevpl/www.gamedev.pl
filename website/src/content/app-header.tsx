import styled from 'styled-components';
import logo from '../logo-gamedev.png';
import githubIcon from '../assets/github-mark-white.svg';

export default function AppHeader() {
  return (
    <HeaderContainer className="App-header">
      <a href="https://www.gamedev.pl" className="logo">
        <img src={logo} alt="Gamedev.pl - Tworzymy gry" width="70" height="60" />
        gamedev<span className="turquoise">.pl</span>
      </a>
      <a href="https://github.com/gamedevpl/www.gamedev.pl" className="github">
        <img src={githubIcon} />
      </a>
    </HeaderContainer>
  );
}

const HeaderContainer = styled.header`
  display: flex;
  flex-direction: row;
  color: white;
  align-items: center;
  justify-content: space-between;

  .github img {
    height: 40px;
    margin-right: 10px;
  }
`;
