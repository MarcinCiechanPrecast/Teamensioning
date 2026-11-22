# Opportunity Map

## Context

- **Project / context**: Teamensioning (Astro + React + Supabase na Cloudflare Workers; repo na GitHubie, PR-y do `master`). Scenariusz hipotetyczny: zespół przebudowuje workflow pod agentów AI, więc rośnie liczba dużych PR-ów, a status prac omawiany jest na długim, codziennym spotkaniu całego zespołu.
- **Data constraint**: mock / lokalne / read-only / niewrażliwe (eksporty z `gh` i z boardu zadań, bez `.env` i `.dev.vars`; aplikacja nie przechowuje danych klientów)
- **Date**: 2026-11-20

## Map

| #   | Signal                                                                                                                                                | Existing / default response                                                                                                                                          | Thin complement                                                                                                                       | First useful version                                                         | Data risk                         | Direction if valuable                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| 1   | Dużo dużych PR-ów generowanych przez agentów; każdy członek zespołu musi je przejrzeć; brak wstępnego przeglądu agentowego (ustalenie zespołu od lat) | `pr.yml` (wymagane checki: ci, smoke, migration-upgrade), husky pre-push, hooki agenta, `plan.md` + `reviews/` w `context/changes/<id>`, skill `/10x-impl-review-ci` | Digest tylko do odczytu per PR: rozmiar, obszary, zgodność z `plan.md`, flagi z `lessons.md`, punkty do sprawdzenia, link do PR-a     | Skrypt na 3-5 PR-ach z `gh pr view` / `gh pr diff` → raport Markdown         | lokalne / read-only / niewrażliwe | Review / CI gate (komentarz agenta pod PR-em w `pr.yml`)    |
| 2   | Codzienne, godzinne omówienie stanu projektów całym zespołem                                                                                          | Widoki i filtry boardu, powiadomienia GitHuba, asynchroniczny status na czacie; najtańsza odpowiedź to zmiana formatu spotkania (tylko blokery), bez kodu            | Poranny digest tylko do odczytu: co zmieniło się od wczoraj, PR-y bez review, czerwone CI, tickety bez ruchu, rozjazd status↔PR       | Statyczny raport Markdown/HTML z eksportu boardu (CSV) i `gh pr list --json` | lokalne / read-only / niewrażliwe | Async / remote work (cykliczny digest)                      |
| 3   | Pytania o rzeczy, które i tak widać na boardzie w taskach                                                                                             | Board z kolumnami i przypisaniami, link do ticketa; reguła "najpierw sprawdź board"                                                                                  | Ten sam digest co w #2: odpowiedzi na typowe pytania (kto, w jakim stanie, co blokuje) gotowe przed spotkaniem, z linkami do ticketów | Ten sam raport co w #2, sprawdzony na 2-3 dniach spotkań                     | lokalne / read-only / niewrażliwe | Wait / no build (może zniknąć po zmianie formatu spotkania) |

Sygnały #2 i #3 to ta sama przyczyna: status jest rozproszony, więc spotkanie służy za jego odczyt. Traktuję je razem jako jeden kandydat.

## Recommended First Candidate

```text
Candidate:
Poranny digest statusu zespołu

Reads:
Eksport boardu zadań (CSV lub JSON, bez danych wrażliwych), `gh pr list --json`
(stan, autor, wiek, recenzenci, wynik checków z pr.yml) oraz lista zmian
z context/changes/ (statusy planów).

Returns:
Jedna strona Markdown/HTML przed spotkaniem: zmiany od wczoraj, PR-y czekające
na review (kto i od jak dawna), PR-y z czerwonym CI, tickety bez ruchu,
rozjazdy (ticket "In Progress" bez PR-a, zmergowany PR przy otwartym tickecie),
3-5 punktów "do omówienia na żywo" i linki do ticketów oraz PR-ów.

Does not do:
Nie zmienia tickety ani PR-y, nie pisze na czacie, nie zastępuje boardu jako
źródła prawdy, nie ocenia ludzi, nie ma bazy, logowania ani harmonogramu.

Data risk:
Lokalne / read-only / niewrażliwe. Przed użyciem realnego boardu: ustalić,
kto może zobaczyć raport.

Direction if it proves valuable:
Async / remote work: cykliczny digest uruchamiany o stałej porze, a spotkanie
skrócone do punktów "do omówienia na żywo".
```

## Why This Candidate

Digest wygrywa z PR pre-review (#1), bo powtarza się codziennie, dotyczy całego zespołu (godzina razy liczba osób), łączy co najmniej dwa źródła (board i GitHub z CI) i da się go sprawdzić na eksporcie, bez dotykania procesu review. Ma też jasny rozmiar zysku: krótsze spotkanie i mniej pytań o to, co widać na boardzie. PR pre-review zostaje drugim kandydatem, gdy digest się sprawdzi.

Uwaga 1: zanim cokolwiek zbudujesz, wypróbuj najtańszą odpowiedź, czyli zmianę formatu spotkania (czytanie boardu, omawianie tylko blokerów). Jeśli to wystarczy, sygnały #2 i #3 znikają bez kodu.

Uwaga 2: część spotkania może mieć sens poza statusem (synchronizacja, decyzje, kontakt w zespole). To tarcie prawdopodobnie jest częściowo istotne, więc digest ma skracać odczyt statusu, a nie likwidować rozmowę.

Uwaga 3: sygnał #1 (review każdego PR-a przez każdego) wymaga osobnej rozmowy o tym, dlaczego reguła obowiązuje. W repo jest już `/10x-impl-review-ci`, który może pokrywać część pre-review.

## Next Direction If Valuable

Async / remote work: cykliczny digest przed spotkaniem (materiał M5L5). Następny krok: walidacja `/10x-mom-test`, potem ewentualnie `/10x-shape`.
