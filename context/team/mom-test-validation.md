# Mom Test Validation Plan

## Input Idea

Poranny digest statusu zespołu (tylko do odczytu): board zadań + `gh pr list --json` + statusy w `context/changes/`. Skraca godzinne, codzienne spotkanie o stanie projektów i zmniejsza liczbę pytań o to, co widać na boardzie. Drugi kandydat: PR pre-review digest. Źródło: `context/team/opportunity-map.md` (scenariusz hipotetyczny).

## Hypotheses

- **User/role**: członkowie zespołu deweloperskiego (recenzenci PR-ów, uczestnicy spotkania) oraz menedżer.
- **Friction**: godzinne codzienne spotkanie całego zespołu; pytania o rzeczy widoczne na boardzie; dużo dużych PR-ów generowanych przez agentów, które każdy musi przejrzeć.
- **Current workaround**: spotkanie na żywo, ręczne zaglądanie do boardu i PR-ów, powiadomienia GitHuba.
- **Risky assumptions**:
  - spotkanie służy głównie do odczytu statusu (może służyć decyzjom i synchronizacji);
  - ludzie przeczytają digest i przestaną pytać o board;
  - status na boardzie jest aktualny (inaczej pytania są uzasadnione);
  - reguła "każdy przegląda każdy PR" jest zaszłością, a nie ma powodu.
- **Evidence already present**: tylko opis problemu przez autora mapy. Brak pomiaru czasu, brak rozmów, brak danych z boardu.

## Critique

- "Digest przed spotkaniem" to rozwiązanie. Problemem jest koszt godziny razy liczba osób, a nikt nie sprawdził, na co ona schodzi.
- Założenia o przyszłości ("przeczytają", "przestaną pytać") trzeba zastąpić pytaniami o to, co ludzie robią dziś rano przed spotkaniem.
- Digest jest tak dobry jak board. Nieaktualne statusy mogą czynić pytania uzasadnionymi.
- Część tarcia może być istotna (decyzje, synchronizacja, kontakt w zespole).
- Zmiana formatu spotkania (czytanie boardu, tylko blokery) może wystarczyć bez kodu.
- Mocny dowód: kilka osób niezależnie opisuje ostatnie pytanie o rzecz widoczną na boardzie i szacuje jego koszt.

## Interview Guide

Rozmówcy: 3-5 osób z zespołu i menedżer. Nie pokazuj pomysłu, nie wspominaj o digeście. Czas: 20-30 min.

1. Jaka jest Twoja rola i jak wygląda typowy dzień pracy z zadaniami i PR-ami?
2. Opowiedz o ostatnim codziennym spotkaniu: co się działo od początku do końca?
3. Przypomnij sobie ostatni raz, gdy na spotkaniu padło pytanie o coś, co było na boardzie. Co to było i co się potem stało?
4. Co robiłeś rano, zanim wszedłeś na spotkanie? Zaglądałeś do boardu, PR-ów, CI? Ile to trwało?
5. Kiedy ostatnio dowiedziałeś się na spotkaniu czegoś, czego nie mogłeś znaleźć sam? Co to było?
6. Kiedy ostatnio status zadania na boardzie nie zgadzał się z rzeczywistością? Jak to wyszło?
7. Opowiedz o ostatnim PR-ze, który musiałeś przejrzeć. Od czego zacząłeś, ile to zajęło i co było najtrudniejsze?
8. Jak wybierasz, który PR przejrzeć najpierw? Skąd wiesz, że jakiś na Ciebie czeka?
9. Czego próbowaliście wcześniej, żeby skrócić spotkanie albo review (inny format, async na czacie, filtry, etykiety)? Co z tego zostało?
10. Co by się stało, gdyby spotkanie jutro trwało 15 minut? Kto by o czym nie wiedział?
11. Kto w zespole najczęściej pyta o status, a kto najczęściej odpowiada? (do menedżera: skąd wzięła się obecna forma spotkania?)
12. Czy mogę zobaczyć (zanonimizowany) przykład boardu albo listy PR-ów z ostatniego tygodnia?

Follow-upy: "Ile to trwało?", "Kto jeszcze był przy tym?", "Co zrobiłeś zamiast?", "Kiedy to było ostatnio?".

## Survey

1. **Screener:** Czy bierzesz udział w codziennym spotkaniu o statusie projektów? (tak / nie, kończ)
2. Ile czasu dziennie zajmuje Ci to spotkanie razem z przygotowaniem? (<15 min / 15-30 / 30-60 / >60)
3. Jak często w ostatnim tygodniu na spotkaniu padło pytanie, na które odpowiedź była na boardzie? (0 / 1-2 / 3-5 / >5)
4. Czy przed spotkaniem sprawdzasz board lub PR-y? (zawsze / czasem / nigdy)
5. Jak często status zadania na boardzie był nieaktualny w ostatnich dwóch tygodniach? (nigdy / raz / kilka razy / często)
6. Ile PR-ów w ostatnim tygodniu musiałeś przejrzeć? (0-2 / 3-5 / 6-10 / >10)
7. Ile czasu zajmuje Ci przeglądanie jednego dużego PR-a? (<15 min / 15-30 / 30-60 / >60)
8. Jak dowiadujesz się, że jakiś PR czeka na Twoje review? (powiadomienie / czat / spotkanie / sprawdzam sam)
9. **Otwarte:** Opisz ostatnią sytuację, w której spotkanie lub review zabrało więcej czasu, niż powinno. Co się stało?
10. **Otwarte:** Co na spotkaniu jest dla Ciebie naprawdę nie do zastąpienia?

## Decision Criteria

- **Proceed**: co najmniej 3 z 5 rozmówców niezależnie opisuje ostatnie pytanie o rzecz widoczną na boardzie, a koszt (czas na osobę dziennie) da się oszacować; w ankiecie co najmniej 40% zespołu deklaruje takie pytania co tydzień lub częściej i status na boardzie jest zwykle aktualny.
- **Narrow scope**: pain dotyczy głównie PR-ów (pytania 7-8, ankieta 6-8), a nie spotkania. Kandydat wraca do PR pre-review digest, a digest statusu odpada.
- **Do not build yet**: rozmówcy mówią, że spotkanie służy głównie decyzjom i synchronizacji, albo nie podają konkretnego, niedawnego przykładu.
- **Try existing tool/process first**: zmiana formatu spotkania (czytanie boardu, tylko blokery), filtry lub CODEOWNERS wystarczają, albo board jest nieaktualny (najpierw poprawić dyscyplinę statusów).
