// One game's source, before assembly into a single document.
export interface GameProject {
  title: string;
  description: string;
  html: string;
  js: string;
  css: string;
  // AGENT.json fields an agent must not observe.
  hiddenFields?: readonly string[];
}
