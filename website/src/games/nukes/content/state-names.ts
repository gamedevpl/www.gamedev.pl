// get a random subset of fantasy state names collection
export function getRandomStateNames(count: number) {
  return [...STATE_NAMES]
    .sort(() => Math.random() - Math.random())
    .slice(0, count);
}

// Fantasy names for states
export const STATE_NAMES = [
  "Unittoria",
  "Zaratopia",
  "Novo Brasil",
  "Industia",
  "Chimerica",
  "Ruslavia",
  "Generistan",
  "Eurasica",
  "Pacifika",
  "Afrigon",
  "Arablend",
  "Mexitana",
  "Canadia",
  "Germaine",
  "Italica",
  "Portugo",
  "Francette",
  "Iberica",
  "Scotlund",
  "Norgecia",
  "Suedland",
  "Fennia",
  "Australis",
  "Zealandia",
  "Argentum",
  "Chileon",
  "Peruvio",
  "Bolivar",
  "Colombera",
  "Venezuelaa",
  "Arcticia",
  "Antausia",
];
