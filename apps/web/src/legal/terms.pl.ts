import type { LegalDocument } from './types.js';
import { CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, OPERATOR_LEGAL_NAME, SERVICE_DOMAIN, SERVICE_URL } from './operator.js';

/**
 * Regulamin — wersja polska (wiążąca).
 *
 * Realizuje trzy zestawy obowiązków naraz, dlatego sekcje wyglądają jak wyglądają:
 *   - art. 8 ustawy o świadczeniu usług drogą elektroniczną (rodzaj i zakres usług,
 *     wymagania techniczne, zakaz treści bezprawnych, tryb reklamacyjny);
 *   - art. 14, 16 i 17 aktu o usługach cyfrowych (opis moderacji, mechanizm
 *     zgłaszania treści nielegalnych, uzasadnienie decyzji);
 *   - art. 50 aktu o sztucznej inteligencji (ujawnienie, że treść tworzy AI).
 * Usuwając którąkolwiek z tych sekcji, sprawdź najpierw, który przepis ją trzyma.
 */
export const termsPl: LegalDocument = {
  id: 'terms',
  title: 'Regulamin serwisu',
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro:
    `Regulamin świadczenia usług drogą elektroniczną w serwisie ${SERVICE_DOMAIN}. Korzystając z Serwisu, ` +
    'akceptujesz poniższe zasady.',
  sections: [
    {
      id: 'uslugodawca',
      heading: '1. Usługodawca i kontakt',
      blocks: [
        {
          kind: 'p',
          text:
            `Serwis ${SERVICE_DOMAIN} („Serwis”) prowadzi ${OPERATOR_LEGAL_NAME} („Usługodawca”). ` +
            `Adres elektroniczny do kontaktu we wszystkich sprawach: [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
        },
        {
          kind: 'p',
          text:
            'Ten sam adres jest pojedynczym punktem kontaktowym w rozumieniu art. 11 i 12 aktu o usługach ' +
            'cyfrowych — służy zarówno użytkownikom, jak i organom państw członkowskich. Językiem kontaktu jest ' +
            'polski lub angielski.',
        },
      ],
    },
    {
      id: 'uslugi',
      heading: '2. Rodzaj i zakres usług',
      blocks: [
        { kind: 'p', text: 'Usługodawca świadczy drogą elektroniczną następujące usługi, nieodpłatnie:' },
        {
          kind: 'ul',
          items: [
            'Tworzenie gier — opisujesz pomysł na grę, a autonomiczny agent AI pisze jej kod i, po weryfikacji, ' +
              'publikuje ją w Serwisie.',
            'Katalog — granie w gry opublikowane w Serwisie, w tym w gry stworzone przez innych użytkowników.',
            'Tryb wieloosobowy — wspólna gra na jednym ekranie, w której telefony uczestników pełnią rolę ' +
              'kontrolerów.',
            'Śledzenie zgłoszeń — strona statusu Twojej gry, powiadomienia w Serwisie, powiadomienia push i ' +
              'wiadomości e-mail o postępie prac.',
            'Konto użytkownika — zakładane przez zalogowanie kontem Google.',
          ],
        },
        {
          kind: 'p',
          text:
            'Serwis działa obecnie w trybie zamkniętej bety. Dostęp jest ograniczony i przyznawany według uznania ' +
            'Usługodawcy; możesz zapisać się na listę oczekujących. Usługodawca nie gwarantuje przyznania dostępu.',
        },
      ],
    },
    {
      id: 'ai',
      heading: '3. Gry powstają z użyciem sztucznej inteligencji',
      blocks: [
        {
          kind: 'p',
          text:
            'Musisz to wiedzieć, zanim czegokolwiek użyjesz: gry w Serwisie nie są pisane przez ludzi. Kod, grafikę ' +
            'i dźwięk generują modele sztucznej inteligencji na podstawie opisu wpisanego przez użytkownika. ' +
            'Wchodząc w interakcję z kreatorem gry, rozmawiasz z systemem AI, a nie z człowiekiem.',
        },
        {
          kind: 'p',
          text:
            'Gry oznaczamy w Serwisie jako wygenerowane przez AI, a stosowną informację umieszczamy również w kodzie ' +
            'opublikowanej gry w formie możliwej do odczytu maszynowego. Realizuje to obowiązek przejrzystości ' +
            'z art. 50 rozporządzenia (UE) 2024/1689 (akt o sztucznej inteligencji).',
        },
        {
          kind: 'p',
          text:
            'Konsekwencja praktyczna: gry mogą zawierać błędy, działać niezgodnie z opisem albo nie powstać w ogóle. ' +
            'Usługodawca nie gwarantuje, że z Twojego zgłoszenia powstanie działająca gra ani że zostanie ona ' +
            'opublikowana.',
        },
      ],
    },
    {
      id: 'wymagania',
      heading: '4. Wymagania techniczne',
      blocks: [
        { kind: 'p', text: 'Do korzystania z Serwisu potrzebujesz:' },
        {
          kind: 'ul',
          items: [
            'urządzenia z dostępem do internetu i aktualnej przeglądarki (Chrome, Safari, Firefox lub Edge) ' +
              'z włączoną obsługą JavaScriptu i plików cookie;',
            'konta Google — logowanie kontem Google jest jedynym sposobem założenia konta;',
            'w trybie wieloosobowym — telefonu z aparatem do zeskanowania kodu QR;',
            'do powiadomień push — przeglądarki wspierającej ten mechanizm i wyrażenia zgody w jej oknie.',
          ],
        },
        {
          kind: 'p',
          text:
            'Usługodawca zastrzega, że korzystanie z internetu wiąże się ze standardowym ryzykiem (złośliwe ' +
            'oprogramowanie, przechwycenie transmisji). Serwis jest udostępniany wyłącznie przez szyfrowane ' +
            'połączenie HTTPS, a gry uruchamiane są w izolowanej ramce bez dostępu do Twojej sesji i danych.',
        },
      ],
    },
    {
      id: 'wiek',
      heading: '5. Kto może korzystać z Serwisu',
      blocks: [
        {
          kind: 'p',
          text:
            'Z Serwisu mogą korzystać osoby, które ukończyły 16 lat. Zakładając konto, oświadczasz, że spełniasz ' +
            'ten warunek.',
        },
        {
          kind: 'p',
          text: 'Konto jest osobiste. Nie udostępniaj go innym osobom i nie zakładaj konta w cudzym imieniu.',
        },
      ],
    },
    {
      id: 'zasady',
      heading: '6. Zasady korzystania — treści zabronione',
      blocks: [
        {
          kind: 'p',
          text:
            'Zakazane jest dostarczanie przez użytkownika treści o charakterze bezprawnym. W szczególności nie wolno ' +
            'zgłaszać opisów gier ani przesyłać materiałów, które:',
        },
        {
          kind: 'ul',
          items: [
            'naruszają prawo, w tym prawa autorskie, prawa do znaków towarowych lub dobra osobiste innych osób;',
            'zawierają treści pornograficzne, w szczególności z udziałem małoletnich, albo treści o charakterze ' +
              'seksualnym skierowane do małoletnich;',
            'nawołują do nienawiści, przemocy lub dyskryminacji, albo propagują totalitaryzm bądź terroryzm;',
            'zawierają drastyczną przemoc lub zachęcają do samobójstwa bądź samookaleczenia;',
            'zawierają dane osobowe innych osób lub Twoje własne dane kontaktowe;',
            'stanowią próbę manipulowania agentem kodującym lub obejścia zabezpieczeń Serwisu (tzw. prompt ' +
              'injection), a także próbę wydostania kodu gry poza izolowaną ramkę.',
          ],
        },
        {
          kind: 'p',
          text:
            'Zakazane jest również nadmierne obciążanie Serwisu, korzystanie z niego w sposób zautomatyzowany bez ' +
            'zgody Usługodawcy oraz omijanie limitów liczby zgłoszeń.',
        },
        {
          kind: 'p',
          text:
            'Ponosisz odpowiedzialność za treści, które przekazujesz do Serwisu, i oświadczasz, że masz do nich ' +
            'odpowiednie prawa.',
        },
      ],
    },
    {
      id: 'moderacja',
      heading: '7. Moderacja treści',
      blocks: [
        {
          kind: 'p',
          text:
            'Ten opis realizuje obowiązek z art. 14 aktu o usługach cyfrowych — masz prawo wiedzieć, jak i kiedy ' +
            'ingerujemy w treści.',
        },
        {
          kind: 'p',
          text:
            'Każdy opis gry przechodzi automatyczną moderację z użyciem modelu AI, jeszcze zanim trafi do agenta ' +
            'kodującego. Moderacja może odrzucić zgłoszenie automatycznie, bez udziału człowieka. Poza tym ' +
            'Usługodawca weryfikuje gry przed publikacją i może odmówić publikacji według własnego uznania — ' +
            'publikacja w katalogu jest decyzją kuratorską, a nie automatycznym następstwem zgłoszenia.',
        },
        { kind: 'p', text: 'W razie naruszenia Regulaminu Usługodawca może, proporcjonalnie do naruszenia:' },
        {
          kind: 'ul',
          items: [
            'odrzucić zgłoszenie lub odmówić publikacji gry;',
            'usunąć opublikowaną grę z katalogu albo ograniczyć dostęp do niej;',
            'ograniczyć limity zgłoszeń, zawiesić konto lub je usunąć w przypadku rażących bądź powtarzających się ' +
              'naruszeń.',
          ],
        },
        {
          kind: 'p',
          text:
            'O każdej takiej decyzji poinformujemy Cię, podając jej powód, zakres i sposób odwołania się od niej ' +
            '(uzasadnienie w rozumieniu art. 17 aktu o usługach cyfrowych). Od decyzji możesz odwołać się, pisząc ' +
            `na [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}); odwołanie rozpatruje człowiek, a nie automat.`,
        },
      ],
    },
    {
      id: 'zglaszanie',
      heading: '8. Zgłaszanie treści nielegalnych',
      blocks: [
        {
          kind: 'p',
          text:
            'Jeżeli uważasz, że gra lub inna treść w Serwisie jest nielegalna, zgłoś to. Przy każdej grze znajdziesz ' +
            `przycisk „Zgłoś grę”, możesz też napisać bezpośrednio na [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). ` +
            'Zgłoszenie może wysłać każdy — nie trzeba mieć konta.',
        },
        {
          kind: 'p',
          text: 'Żeby zgłoszenie dało się rozpatrzyć, powinno zawierać (zgodnie z art. 16 aktu o usługach cyfrowych):',
        },
        {
          kind: 'ul',
          items: [
            'wyjaśnienie, dlaczego Twoim zdaniem treść jest nielegalna;',
            'dokładne wskazanie treści — najlepiej adres URL gry;',
            'Twoje imię i adres e-mail (możesz je pominąć, jeśli zgłoszenie dotyczy przestępstw przeciwko ' +
              'wolności seksualnej i obyczajności);',
            'oświadczenie, że w dobrej wierze uważasz zawarte w zgłoszeniu informacje za prawdziwe i kompletne.',
          ],
        },
        {
          kind: 'p',
          text:
            'Potwierdzimy otrzymanie zgłoszenia bez zbędnej zwłoki i poinformujemy Cię o decyzji wraz z jej ' +
            'uzasadnieniem. Zgłoszenia rozpatrujemy terminowo, w sposób niearbitralny i obiektywny. Decyzję ' +
            'podejmuje człowiek.',
        },
      ],
    },
    {
      id: 'prawa-autorskie',
      heading: '9. Prawa do treści i gier',
      blocks: [
        {
          kind: 'p',
          text:
            'Zachowujesz wszelkie prawa do opisu gry i materiałów, które przesyłasz. Udzielasz jednocześnie ' +
            'Usługodawcy nieodpłatnej, niewyłącznej licencji na ich zwielokrotnianie, przechowywanie, ' +
            'przetwarzanie (w tym przez modele AI) i publiczne udostępnianie w zakresie niezbędnym do zbudowania ' +
            'i udostępnienia gry oraz do prowadzenia Serwisu. Licencja obowiązuje bezterminowo w odniesieniu do gier ' +
            'opublikowanych i wygasa wraz z usunięciem treści nieopublikowanych.',
        },
        {
          kind: 'p',
          text:
            'Kod gry powstaje w wyniku działania modelu AI. Status prawnoautorski takich wytworów jest w prawie ' +
            'polskim nierozstrzygnięty — utworem jest przejaw działalności twórczej człowieka, a wygenerowany kod ' +
            'może nim nie być. Usługodawca nie rozstrzyga tej kwestii i nie składa oświadczeń co do tego, komu ' +
            'przysługują prawa do wygenerowanego kodu.',
        },
        {
          kind: 'p',
          text:
            'Niezależnie od powyższego: w zakresie, w jakim Usługodawcy przysługują jakiekolwiek prawa do kodu gry ' +
            'wygenerowanego na podstawie Twojego opisu, Usługodawca udziela Ci nieodpłatnej, niewyłącznej, ' +
            'nieograniczonej terytorialnie i bezterminowej licencji na korzystanie z tego kodu w dowolnym celu, ' +
            'w tym komercyjnym, wraz z prawem do jego modyfikowania i dalszego udostępniania. Licencja ta nie ' +
            'obejmuje nazwy ani logo gamedev.pl, a także treści pochodzących od osób trzecich.',
        },
        {
          kind: 'p',
          text:
            'Możesz grać w gry opublikowane w Serwisie na własny użytek. Repozytorium gier nie jest obecnie ' +
            'publiczne; jeśli Usługodawca udostępni je na licencji otwartej, poinformuje o tym w Serwisie.',
        },
        {
          kind: 'p',
          text:
            'Nazwa i logo gamedev.pl oraz układ i grafika Serwisu należą do Usługodawcy i nie są objęte powyższymi ' +
            'zezwoleniami.',
        },
      ],
    },
    {
      id: 'reklamacje',
      heading: '10. Reklamacje',
      blocks: [
        {
          kind: 'p',
          text:
            `Reklamacje dotyczące działania Serwisu składasz na adres [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). ` +
            'W zgłoszeniu podaj adres e-mail powiązany z kontem, opis problemu oraz oczekiwany sposób jego ' +
            'załatwienia.',
        },
        {
          kind: 'p',
          text:
            'Reklamację rozpatrujemy w terminie 14 dni od jej otrzymania i w tym czasie przesyłamy odpowiedź na ' +
            'podany adres e-mail. Jeżeli podane informacje wymagają uzupełnienia, poprosimy o nie przed upływem ' +
            'tego terminu.',
        },
      ],
    },
    {
      id: 'odpowiedzialnosc',
      heading: '11. Odpowiedzialność i dostępność Serwisu',
      blocks: [
        {
          kind: 'p',
          text:
            'Serwis jest udostępniany nieodpłatnie, w wersji beta, w stanie „takim, w jakim jest”. Usługodawca ' +
            'dokłada starań, aby działał poprawnie, ale nie gwarantuje jego nieprzerwanej dostępności ani ' +
            'bezbłędności. Prace serwisowe i przerwy mogą wystąpić bez wcześniejszego zawiadomienia.',
        },
        {
          kind: 'p',
          text:
            'Usługodawca nie ponosi odpowiedzialności za treści gier w zakresie, w jakim pochodzą one od ' +
            'użytkowników lub zostały wygenerowane przez modele AI, na zasadach określonych w art. 6 aktu o ' +
            'usługach cyfrowych. Odpowiedzialność Usługodawcy wobec użytkownika ogranicza się do szkody wyrządzonej ' +
            'umyślnie, w granicach dopuszczalnych przez prawo. Niniejsze postanowienie nie ogranicza uprawnień ' +
            'konsumenta wynikających z przepisów bezwzględnie obowiązujących.',
        },
        {
          kind: 'p',
          text:
            'Usługodawca zastrzega sobie prawo do zakończenia zamkniętej bety, zmiany zakresu usług lub zamknięcia ' +
            'Serwisu. O zamknięciu Serwisu poinformuje z co najmniej 30-dniowym wyprzedzeniem, umożliwiając ' +
            'pobranie treści.',
        },
      ],
    },
    {
      id: 'rozwiazanie',
      heading: '12. Rezygnacja i usunięcie konta',
      blocks: [
        {
          kind: 'p',
          text:
            'Możesz w każdej chwili zrezygnować z korzystania z Serwisu i zaplanować usunięcie konta w ustawieniach konta albo napisać na ' +
            `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). Usunięcie następuje po 14-dniowym okresie na zmianę decyzji i jest anulowane po ` +
            'ponownym zalogowaniu. Umowa o świadczenie usług drogą elektroniczną rozwiązuje się z chwilą usunięcia konta.',
        },
        {
          kind: 'p',
          text:
            'Usługodawca może rozwiązać umowę z zachowaniem 14-dniowego okresu wypowiedzenia, a w przypadku ' +
            'rażącego naruszenia Regulaminu — ze skutkiem natychmiastowym, informując o powodzie.',
        },
        {
          kind: 'p',
          text: 'Skutki usunięcia konta dla gier już opublikowanych opisuje [Polityka prywatności](/privacy).',
        },
      ],
    },
    {
      id: 'zmiany',
      heading: '13. Zmiany Regulaminu',
      blocks: [
        {
          kind: 'p',
          text:
            'Usługodawca może zmienić Regulamin z ważnych przyczyn — zmiany przepisów, zakresu usług lub sposobu ' +
            'działania Serwisu. O zmianie poinformujemy w Serwisie oraz pocztą elektroniczną z co najmniej ' +
            '14-dniowym wyprzedzeniem. Jeżeli nie akceptujesz zmian, możesz zrezygnować z konta przed ich wejściem ' +
            'w życie.',
        },
      ],
    },
    {
      id: 'prawo',
      heading: '14. Prawo właściwe i spory',
      blocks: [
        {
          kind: 'p',
          text:
            'W sprawach nieuregulowanych Regulaminem stosuje się prawo polskie, w szczególności Kodeks cywilny oraz ' +
            'ustawę z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną, a także bezpośrednio ' +
            'obowiązujące przepisy prawa Unii Europejskiej. Wybór prawa polskiego nie pozbawia konsumenta ochrony ' +
            'wynikającej z bezwzględnie obowiązujących przepisów państwa jego zwykłego pobytu.',
        },
        {
          kind: 'p',
          text:
            'Konsument może korzystać z pozasądowych sposobów rozpatrywania sporów, w tym z platformy internetowego ' +
            'rozstrzygania sporów ODR Komisji Europejskiej ' +
            '([ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr)).',
        },
        {
          kind: 'p',
          text:
            'Zasady przetwarzania danych osobowych opisuje [Polityka prywatności](/privacy), stanowiąca integralną ' +
            `część Regulaminu. Aktualna wersja Regulaminu jest zawsze dostępna pod adresem ${SERVICE_URL}/terms.`,
        },
      ],
    },
  ],
};
