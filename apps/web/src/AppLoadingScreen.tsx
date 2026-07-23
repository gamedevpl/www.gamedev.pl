export function AppLoadingScreen() {
  return (
    <div className="app-loading-screen">
      <div className="app-loading-screen__content">
        <div className="app-loading-screen__logo">
          <span className="app-loading-screen__logo-main">gamedev</span>
          <span className="app-loading-screen__logo-tld">.pl</span>
        </div>
        <div className="app-loading-screen__spinner" />
      </div>
    </div>
  );
}
