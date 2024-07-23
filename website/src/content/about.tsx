import { Heading3 } from "../components/headers";
import Section from "../components/section";
import { useTranslation } from "react-i18next";

export default function About() {
  const { t } = useTranslation();

  return (
    <Section>
      <Heading3>{t("O Gamedev.pl")}</Heading3>
      <p>
        {t(
          "Na tej stronie znajdziesz gry, projekty gier, lub pomysły na gry. Kod źródłowy tej strony, a także gier znajdziesz na GitHubie:"
        )}{" "}
        <a href="https://github.com/gamedevpl/www.gamedev.pl">
          https://github.com/gamedevpl/www.gamedev.pl
        </a>
        .
      </p>
    </Section>
  );
}
