import type { LegalDocument } from './types.js';
import { CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, OPERATOR_LEGAL_NAME, SERVICE_DOMAIN } from './operator.js';

/**
 * Polityka prywatności — wersja polska (wiążąca).
 *
 * Treść odpowiada temu, co serwis faktycznie robi z danymi (audyt kodu z 2026-07-25),
 * a nie temu, co robi typowy serwis. Zmieniając przepływ danych, zmień też ten plik —
 * rozjazd między kodem a tym dokumentem jest naruszeniem, nie literówką.
 */
export const privacyPl: LegalDocument = {
  id: 'privacy',
  title: 'Polityka prywatności',
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro:
    `Ten dokument wyjaśnia, jakie dane osobowe zbiera serwis ${SERVICE_DOMAIN}, po co, na jakiej podstawie prawnej ` +
    'i jak długo je przechowujemy. Napisaliśmy go tak, żeby dało się go przeczytać — bez ściany prawniczego żargonu.',
  sections: [
    {
      id: 'administrator',
      heading: '1. Kto jest administratorem danych',
      blocks: [
        {
          kind: 'p',
          text:
            `Administratorem Twoich danych osobowych jest ${OPERATOR_LEGAL_NAME} — operator serwisu ` +
            `${SERVICE_DOMAIN} („Serwis”). Kontakt we wszystkich sprawach dotyczących danych osobowych: ` +
            `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
        },
        {
          kind: 'p',
          text:
            'Nie wyznaczyliśmy inspektora ochrony danych (IOD) — przy tej skali przetwarzania przepisy tego nie ' +
            'wymagają. Wszystkie zgłoszenia trafiają bezpośrednio na adres podany wyżej.',
        },
      ],
    },
    {
      id: 'dane',
      heading: '2. Jakie dane przetwarzamy i na jakiej podstawie',
      blocks: [
        {
          kind: 'p',
          text:
            'Poniższa tabela to pełna lista. Jeżeli jakiejś kategorii tu nie ma, to znaczy, że jej nie zbieramy. ' +
            'Podstawy prawne odsyłają do art. 6 ust. 1 RODO.',
        },
        {
          kind: 'table',
          head: ['Dane', 'Po co', 'Podstawa prawna', 'Jak długo'],
          rows: [
            [
              'Dane konta Google: identyfikator konta, zweryfikowany adres e-mail, imię/nazwa i zdjęcie profilowe',
              'Założenie i obsługa konta, przypisanie Twoich gier do Ciebie, limity dzienne',
              'art. 6 ust. 1 lit. b — wykonanie umowy (Regulamin)',
              'Do usunięcia konta',
            ],
            [
              'Adres e-mail na liście oczekujących (jeśli zapiszesz się w zamkniętej becie)',
              'Powiadomienie Cię o przyznaniu dostępu',
              'art. 6 ust. 1 lit. b — działania przed zawarciem umowy',
              'Do końca zamkniętej bety lub do wycofania zapisu',
            ],
            [
              'Zgłoszenia z formularza kontaktowego: imię lub nazwa, adres e-mail oraz treść wiadomości',
              'Odczytanie Twojego zapytania i udzielenie odpowiedzi',
              'art. 6 ust. 1 lit. f — nasz prawnie uzasadniony interes w odpowiadaniu osobom, które do nas piszą, ' +
                'oraz lit. c — gdy wiadomość jest żądaniem, które musimy rozpatrzyć z mocy prawa',
              'Do 24 miesięcy po zamknięciu sprawy',
            ],
            [
              'Treści, które tworzysz: opis gry, tytuł, odpowiedzi na pytania doprecyzowujące, uwagi do gotowej gry, ' +
                'przesłane szkice i obrazy',
              'Zbudowanie gry przez agenta AI i jej opublikowanie',
              'art. 6 ust. 1 lit. b — wykonanie umowy',
              'Bezterminowo dla gier opublikowanych (są częścią historii projektu); zgłoszenia nieopublikowane — 24 miesiące',
            ],
            [
              'Publiczny profil twórcy, który zajmujesz przed publikacją: unikalny handle, nazwa wyświetlana, krótkie ' +
                'bio oraz wybór, czy pokazać zdjęcie z Google, czy inicjał (nie tworzymy własnego adresu avatara)',
              'Przypisanie opublikowanych gier do Ciebie w katalogu i playerze oraz prowadzenie publicznej strony profilu',
              'art. 6 ust. 1 lit. b — wykonanie umowy (publikacja wymaga profilu); dane są publiczne przez Twój ' +
                'wybór zajęcia handle',
              'Do usunięcia konta (rezerwacja handle jest kasowana razem z kontem)',
            ],
            [
              'Twoje reakcje na gry, w które grasz: ocena kciukiem w górę/w dół oraz wpisane uwagi — zapisywane wraz ' +
                'z identyfikatorem Twojego konta, aby jeden głos liczył się raz, a uwagi dało się powiązać z autorem ' +
                'w razie nadużycia',
              'Ulepszanie gier i decydowanie, co poprawić w następnej kolejności; utrzymanie użyteczności formularza uwag',
              'art. 6 ust. 1 lit. f — nasz prawnie uzasadniony interes w ulepszaniu gier i bezpieczeństwie Serwisu',
              'Do usunięcia konta',
            ],
            [
              'Które opublikowane gry otwierasz po zalogowaniu (licznik i ostatni czas otwarcia każdej) — zapisywane ' +
                'wraz z Twoim kontem, aby strona główna mogła proponować Ci gry. To osobne od anonimowych statystyk ' +
                'rozgrywki, które nigdy nie są powiązane z kontem',
              'Personalizacja kolejności gier na stronie głównej',
              'art. 6 ust. 1 lit. f — nasz prawnie uzasadniony interes w pomaganiu Ci znaleźć gry, które mogą Ci się spodobać',
              'Do usunięcia konta',
            ],
            [
              'Twoje postępy w grach, które je zapisują (np. osiągnięty poziom lub odblokowane przedmioty) — ' +
                'zapisywane wraz z identyfikatorem Twojego konta, aby gra mogła je przywrócić przy kolejnej wizycie',
              'Umożliwienie Ci kontynuowania gry od miejsca, w którym ją przerwałeś',
              'art. 6 ust. 1 lit. b — wykonanie umowy',
              'Do usunięcia konta lub do usunięcia postępów z poziomu samej gry',
            ],
            [
              'To, co zbudujesz lub zostawisz we wspólnym świecie gry (np. zasadzona roślina albo przypięta ' +
                'notatka) — zapisywane wraz z identyfikatorem Twojego konta, aby tylko Ty mógł to zmienić lub ' +
                'usunąć. Inni gracze widzą to, co stworzyłeś, ale nigdy nie widzą, kto to zrobił: gra otrzymuje ' +
                'kod, a nie Twoje imię ani konto',
              'Umożliwienie graczom wspólnego budowania jednego miejsca na przestrzeni wielu wizyt',
              'art. 6 ust. 1 lit. b — wykonanie umowy',
              'Do usunięcia konta lub do usunięcia tego z poziomu samej gry',
            ],
            [
              'W trakcie gry we wspólnym świecie — to, że w nim jesteś i mniej więcej gdzie: przybliżona pozycja ' +
                'na siatce kafelków, a nie dokładna lokalizacja. Przechowywane wyłącznie w pamięci przez około ' +
                '40 sekund od Twojego ostatniego ruchu i nigdy niezapisywane w żadnej bazie danych. Inni gracze ' +
                'widzą krótki kod i kafelek: nigdy Twoje imię, konto ani kod powiązany z tym, co tam zbudowałeś',
              'Umożliwienie graczom zobaczenia, że inni są w tym samym świecie w tym samym czasie',
              'art. 6 ust. 1 lit. b — wykonanie umowy',
              'Około 40 sekund po zakończeniu gry. Nie pozostaje nic, co można by później usunąć',
            ],
            [
              'Wynik moderacji Twojego opisu (czy i dlaczego został odrzucony)',
              'Niedopuszczenie do powstania treści bezprawnych lub szkodliwych',
              'art. 6 ust. 1 lit. c — obowiązek prawny (akt o usługach cyfrowych) oraz lit. f — nasz prawnie ' +
                'uzasadniony interes w bezpieczeństwie Serwisu',
              '24 miesiące',
            ],
            [
              'Subskrypcja powiadomień push (adres punktu końcowego przeglądarki i klucze szyfrujące)',
              'Wysłanie Ci powiadomienia, gdy Twoja gra jest gotowa',
              'art. 6 ust. 1 lit. a — zgoda (wyrażona w oknie przeglądarki)',
              'Do wyłączenia powiadomień lub wygaśnięcia subskrypcji',
            ],
            [
              'Powiadomienia w Serwisie i wiadomości e-mail o statusie Twoich zgłoszeń',
              'Informowanie Cię o postępie prac nad Twoją grą',
              'art. 6 ust. 1 lit. b — wykonanie umowy',
              '12 miesięcy',
            ],
            [
              'Nazwa gracza wpisana w trybie wieloosobowym oraz ruch sterowania telefonem',
              'Umożliwienie wspólnej gry na jednym ekranie',
              'art. 6 ust. 1 lit. b — wykonanie umowy',
              'Tylko na czas trwania pokoju — nie zapisujemy tego',
            ],
            [
              'Techniczne logi serwera: adres IP, typ przeglądarki, czas żądania',
              'Bezpieczeństwo, diagnostyka awarii, przeciwdziałanie nadużyciom',
              'art. 6 ust. 1 lit. f — prawnie uzasadniony interes',
              'Do 90 dni',
            ],
          ],
        },
      ],
    },
    {
      id: 'telemetria',
      heading: '3. Statystyki rozgrywki — celowo bez Twojej tożsamości',
      blocks: [
        {
          kind: 'p',
          text:
            'Zbieramy dane o tym, jak działają gry: że gra została otwarta, jak długo trwała rozgrywka, czy w grze ' +
            'wystąpił błąd, czy obraz się nie zaciął. Służy to wyłącznie poprawianiu jakości gier.',
        },
        {
          kind: 'p',
          text:
            'Te dane nie są danymi osobowymi i nie da się ich z Tobą powiązać, ponieważ zbudowaliśmy je tak, żeby to ' +
            'było niemożliwe: każde otwarcie gry dostaje losowy identyfikator sesji istniejący wyłącznie w pamięci ' +
            'karty przeglądarki, nigdy zapisywany w pliku cookie ani w pamięci urządzenia. Do serwera nie trafia ' +
            'ani identyfikator Twojego konta, ani adres IP. Dwa otwarcia tej samej gry przez tę samą osobę są dla ' +
            'nas dwiema niepowiązanymi sesjami. Mierzymy gry, nie ludzi.',
        },
        {
          kind: 'p',
          text:
            'Niektóre gry mogą pokazać obraz z kamery urządzenia pod powierzchnią gry, a niektóre mogą oszacować ' +
            'pozycję dłoni do sterowania. To przetwarzanie odbywa się tylko w przeglądarce na czas sesji; klatki ' +
            'i punkty dłoni nigdy nie są nagrywane, przesyłane ani włączane do powyższych statystyk rozgrywki.',
        },
      ],
    },
    {
      id: 'ai',
      heading: '4. Sztuczna inteligencja — co dzieje się z Twoim opisem gry',
      blocks: [
        {
          kind: 'p',
          text: 'Serwis opiera się na modelach AI, więc treść, którą wpisujesz, jest przez nie przetwarzana. Konkretnie:',
        },
        {
          kind: 'ul',
          items: [
            'Twój opis gry przechodzi automatyczną moderację (model Google Gemini), która może go odrzucić.',
            'Opis jest następnie doprecyzowywany przez model AI, który może zadać Ci pytania pomocnicze.',
            'Zaakceptowany opis trafia jako zadanie do agenta kodującego (GitHub Copilot), który pisze kod gry ' +
              'w naszym prywatnym repozytorium. Repozytorium gier nie jest publiczne — Twój opis nie staje się ' +
              'publicznie widoczny w wyniku samego zgłoszenia.',
            'Opublikowana gra jest widoczna dla wszystkich użytkowników Serwisu wraz z tytułem i — jeśli ją ' +
              'podałeś/podałaś — nazwą twórcy.',
          ],
        },
        {
          kind: 'p',
          text:
            'Nie wykorzystujemy Twoich treści do trenowania własnych modeli AI. Nie przekazujemy ich też dostawcom ' +
            'modeli w celu trenowania ich modeli — korzystamy z usług w wariancie, który tego nie przewiduje.',
        },
        {
          kind: 'p',
          text:
            'Automatyczna moderacja może odrzucić Twój opis bez udziału człowieka. Nie jest to decyzja wywołująca ' +
            'wobec Ciebie skutki prawne w rozumieniu art. 22 RODO — możesz po prostu przeredagować opis i spróbować ' +
            `ponownie. Jeśli jednak uważasz, że odrzucenie było błędne, napisz na [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}), ` +
            'a sprawę oceni człowiek.',
        },
        {
          kind: 'p',
          text:
            'Osobno: gdy jesteś właścicielem/właścicielką gry i funkcja podpowiedzi w edytorze kodu jest włączona, ' +
            'kod wokół kursora jest automatycznie wysyłany do tego samego modelu AI (Google Gemini, przez Google ' +
            'Cloud Vertex AI) chwilę po tym, jak przestajesz pisać, aby zaproponować uzupełnienie. Dotyczy to ' +
            'wyłącznie edytora kodu w Twojej własnej grze i — tak jak powyżej — nigdy nie jest wykorzystywane do ' +
            'trenowania modeli.',
        },
      ],
    },
    {
      id: 'agent',
      heading: '5. Podłączenie własnego asystenta AI (interfejs agenta)',
      blocks: [
        {
          kind: 'p',
          text:
            'Możesz też budować i ulepszać swoje gry, podłączając do Serwisu wybranego przez siebie asystenta AI ' +
            '(np. ChatGPT, Claude albo edytor kodu z funkcjami AI) przez nasz interfejs agenta (MCP). Nic z ' +
            'poniższego nie dzieje się, dopóki samodzielnie nie podłączysz asystenta — kluczem twórcy, który ' +
            'generujesz, albo logując się przez asystenta (OAuth). Gdy asystent jest podłączony, interfejs zwraca ' +
            'mu — wyłącznie dla Twoich gier — następujące kategorie danych:',
        },
        {
          kind: 'ul',
          items: [
            'brief Twojej gry: tytuł, Twój opis i odpowiedzi na pytania doprecyzowujące, Twoje wiadomości ' +
              'sterujące i opinie — w tym stronicowany zapis tej rozmowy obejmujący wcześniejsze rundy budowy;',
            'szkice i obrazy referencyjne, które załączysz do gry;',
            'pliki źródłowe Twojej gry (opublikowane, robocze i zmiany w poczekalni) oraz materiały referencyjne ' +
              'platformy (Creator Kit);',
            'zapisy budowy Twojej gry: notatki o postępie, zrzuty ekranu, werdykty automatycznej bramki jakości ' +
              'oraz wytworzone przez nią zrzuty i nagrania rozgrywki;',
            'techniczne metadane statusu towarzyszące tym odpowiedziom: identyfikatory rundy i dostawy, ' +
              'znaczniki czasu, stan przepływu pracy i doradcze kody ostrzeżeń.',
          ],
        },
        {
          kind: 'p',
          text:
            'Interfejs zwraca wyłącznie dane o grze i rundzie budowy. Nie zwraca Twojego adresu e-mail, imienia ' +
            'i nazwiska, identyfikatora konta ani niepublicznych danych innych twórców — asystent widzi Twoją ' +
            'grę, nie Twoje konto.',
        },
        {
          kind: 'p',
          text:
            'To, co podłączony asystent robi z otrzymanymi danymi, reguluje Twoja umowa z jego dostawcą (np. ' +
            'OpenAI lub Anthropic) — asystent działa na Twoje polecenie, jako wybrany przez Ciebie odbiorca, a nie ' +
            'nasz podwykonawca. Nie wysyłamy mu niczego z własnej inicjatywy: każda z powyższych kategorii jest ' +
            'zwracana wyłącznie w odpowiedzi na żądanie asystenta, gdy masz go podłączonego.',
        },
      ],
    },
    {
      id: 'odbiorcy',
      heading: '6. Komu przekazujemy dane',
      blocks: [
        {
          kind: 'p',
          text:
            'Nie sprzedajemy danych i nie udostępniamy ich w celach marketingowych. Korzystamy natomiast z ' +
            'dostawców, którzy przetwarzają dane w naszym imieniu:',
        },
        {
          kind: 'table',
          head: ['Dostawca', 'Rola', 'Gdzie'],
          rows: [
            [
              'Google Cloud Platform',
              'Hosting aplikacji i baza danych',
              'Unia Europejska (region europe-west1, Belgia)',
            ],
            ['Google (logowanie kontem Google)', 'Uwierzytelnianie', 'USA — Data Privacy Framework'],
            [
              'Google Cloud Vertex AI (Gemini)',
              'Moderacja i doprecyzowanie opisu gry; podpowiedzi uzupełnień kodu w edytorze kodu',
              'USA / globalnie — standardowe klauzule umowne',
            ],
            [
              'Meta (Muse Spark, Meta Model API)',
              'Wygenerowanie wstępnego szkicu gry na podstawie Twojego opisu, zanim zajmie się nią agent kodujący',
              'USA — standardowe klauzule umowne',
            ],
            ['GitHub (Microsoft)', 'Repozytorium gier i agent kodujący', 'USA — Data Privacy Framework'],
            ['Resend', 'Wysyłka wiadomości e-mail', 'USA — standardowe klauzule umowne'],
            [
              'Google / Apple / Mozilla',
              'Dostarczenie powiadomień push do Twojej przeglądarki (tylko jeśli je włączysz)',
              'USA / UE',
            ],
          ],
        },
        {
          kind: 'p',
          text:
            'Część dostawców znajduje się poza Europejskim Obszarem Gospodarczym. Przekazanie danych do nich odbywa ' +
            'się na podstawie decyzji Komisji Europejskiej o odpowiednim stopniu ochrony (EU–US Data Privacy ' +
            'Framework) albo standardowych klauzul umownych zatwierdzonych przez Komisję Europejską.',
        },
        {
          kind: 'p',
          text: 'Dane możemy też udostępnić uprawnionym organom państwowym, jeżeli zażądają tego zgodnie z prawem.',
        },
      ],
    },
    {
      id: 'cookies',
      heading: '7. Pliki cookie i pamięć przeglądarki',
      blocks: [
        {
          kind: 'p',
          text:
            'Serwis nie używa plików cookie do celów analitycznych, marketingowych ani profilujących. Nie korzystamy ' +
            'z Google Analytics ani żadnego innego zewnętrznego narzędzia śledzącego. Dlatego nie wyświetlamy Ci ' +
            'banera zgody na cookies — nie ma na co się zgadzać.',
        },
        {
          kind: 'p',
          text: 'Używamy wyłącznie tego, co jest niezbędne do działania Serwisu:',
        },
        {
          kind: 'ul',
          items: [
            'jednego pliku cookie sesji, ustawianego po zalogowaniu, który utrzymuje Twoje zalogowanie;',
            'pamięci lokalnej przeglądarki (localStorage), w której trzymamy wybrany język interfejsu oraz listę ' +
              'Twoich zgłoszeń, żebyś mógł/mogła do nich wrócić na tym urządzeniu.',
          ],
        },
        {
          kind: 'p',
          text:
            'Zgodnie z art. 399 Prawa komunikacji elektronicznej dostęp do informacji niezbędnych do świadczenia ' +
            'usługi żądanej przez użytkownika nie wymaga zgody. Dane z pamięci lokalnej nie są wysyłane na nasz ' +
            'serwer — możesz je w każdej chwili usunąć, czyszcząc dane witryny w przeglądarce.',
        },
      ],
    },
    {
      id: 'prawa',
      heading: '8. Twoje prawa',
      blocks: [
        { kind: 'p', text: 'W związku z przetwarzaniem Twoich danych przysługuje Ci prawo do:' },
        {
          kind: 'ul',
          items: [
            'dostępu do danych i otrzymania ich kopii (art. 15 RODO);',
            'sprostowania danych nieprawidłowych (art. 16 RODO);',
            'usunięcia danych — „prawo do bycia zapomnianym” (art. 17 RODO);',
            'ograniczenia przetwarzania (art. 18 RODO);',
            'przenoszenia danych w formacie nadającym się do odczytu maszynowego (art. 20 RODO);',
            'sprzeciwu wobec przetwarzania opartego na naszym prawnie uzasadnionym interesie (art. 21 RODO);',
            'wycofania zgody w dowolnym momencie — dotyczy powiadomień push; wycofanie nie wpływa na zgodność ' +
              'z prawem przetwarzania sprzed wycofania.',
          ],
        },
        {
          kind: 'p',
          text:
            `Aby skorzystać z któregokolwiek z tych praw, napisz na [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). ` +
            'Odpowiadamy bez zbędnej zwłoki, najpóźniej w ciągu miesiąca od otrzymania żądania.',
        },
        {
          kind: 'p',
          text:
            'Jeśli uważasz, że przetwarzamy Twoje dane niezgodnie z prawem, masz prawo wnieść skargę do Prezesa ' +
            'Urzędu Ochrony Danych Osobowych, ul. Stawki 2, 00-193 Warszawa ([uodo.gov.pl](https://uodo.gov.pl)).',
        },
      ],
    },
    {
      id: 'usuniecie',
      heading: '9. Usunięcie konta',
      blocks: [
        {
          kind: 'p',
          text:
            `Możesz w każdej chwili zaplanować usunięcie konta w ustawieniach konta albo napisać na [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). ` +
            'Usunięcie następuje po 14-dniowym okresie na zmianę decyzji. Ponowne zalogowanie przed wykonaniem usunięcia anuluje dyspozycję. ' +
            'Po upływie tego okresu usuwamy dane Twojego konta, adres e-mail, subskrypcje powiadomień, oddane przez Ciebie głosy i ' +
            'wpisane uwagi do gier, zapis tego, które gry otwierałeś na potrzeby rekomendacji, zapisane postępy w grach, które je przechowują, wszystko, co zbudowałeś we ' +
            'wspólnych światach gier, Twój publiczny profil twórcy (handle, nazwę wyświetlaną, bio, preferencję avatara) ' +
            'oraz rezerwację handle, i powiązanie zgłoszeń z Twoją osobą. Usunięcie tego, co ' +
            'zbudowałeś we wspólnym świecie, usuwa to również z widoku innych graczy.',
        },
        {
          kind: 'p',
          text:
            'Gry, które zostały już opublikowane w arkadzie, pozostają dostępne, ale bez powiązania z Twoim kontem — ' +
            'inni gracze mogą z nich korzystać, a my nie możemy wycofać kodu, który stał się częścią projektu. Po ' +
            'usunięciu podpis w katalogu wraca do nazwy platformy. Jeśli ' +
            'chcesz, żeby konkretna gra została zdjęta z arkady, napisz o tym wprost w zgłoszeniu, a rozpatrzymy je ' +
            'osobno.',
        },
      ],
    },
    {
      id: 'bezpieczenstwo',
      heading: '10. Bezpieczeństwo',
      blocks: [
        {
          kind: 'p',
          text:
            'Połączenie z Serwisem jest szyfrowane (HTTPS). Gry uruchamiają się w izolowanej ramce przeglądarki bez ' +
            'dostępu do Twojej sesji, ciasteczek i danych — kod gry, nawet gdyby był złośliwy, nie ma jak sięgnąć po ' +
            'Twoje konto. Dostęp do danych po stronie serwera ma wyłącznie administrator.',
        },
        {
          kind: 'p',
          text:
            'Gdyby doszło do naruszenia ochrony danych osobowych, zgłosimy je Prezesowi UODO w ciągu 72 godzin, a ' +
            'jeśli naruszenie będzie się wiązać z wysokim ryzykiem dla Ciebie — powiadomimy również Ciebie.',
        },
      ],
    },
    {
      id: 'wiek',
      heading: '11. Wiek użytkowników',
      blocks: [
        {
          kind: 'p',
          text:
            'Serwis jest przeznaczony dla osób, które ukończyły 16 lat. Nie zbieramy świadomie danych osób młodszych. ' +
            `Jeśli jesteś rodzicem lub opiekunem i sądzisz, że Twoje dziecko przekazało nam swoje dane, napisz na ` +
            `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) — usuniemy je.`,
        },
      ],
    },
    {
      id: 'zmiany',
      heading: '12. Zmiany polityki',
      blocks: [
        {
          kind: 'p',
          text:
            'Możemy aktualizować tę politykę, gdy zmieni się sposób działania Serwisu albo przepisy. O istotnych ' +
            'zmianach poinformujemy w Serwisie z co najmniej 14-dniowym wyprzedzeniem. Data wejścia w życie tej ' +
            'wersji jest podana na górze strony.',
        },
      ],
    },
  ],
};
