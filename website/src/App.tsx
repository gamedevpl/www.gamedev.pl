import './index.css';
import './App.css';
import AppHeader from './content/app-header';
import OurGames from './content/our-games';
import About from './content/about';
import PageWrapper from './components/page-wrapper';
import AppFooter from './content/app-footer';

export function App() {
  return (
    <PageWrapper title="Gamedev.pl - Tworzymy gry!">
      <AppHeader />
      <About />
      <OurGames />
      <AppFooter />
    </PageWrapper>
  );
}
