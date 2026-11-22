# Definition of Done dla pull requestów

## Cel

Jedno miejsce, które mówi, kiedy PR jest "gotowy". Agent review w CI (`.github/workflows/review.yml`) oraz zestaw
evali (`packages/code-reviewer/evals`) odwołują się do tego dokumentu. Zmiana progu tutaj oznacza zmianę asercji w
evalach, a nie odwrotnie.

## Kryteria

Agent ocenia każdy PR w skali 1-10 (1 najgorzej, 10 najlepiej). Nazwy kluczy pochodzą ze schematu
`packages/code-reviewer/src/review-schema.ts`.

| Klucz                       | Pytanie                                                           | 1 oznacza                                             | 10 oznacza                                                          |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `implementationCorrectness` | Czy kod robi to, co deklaruje, także w przypadkach brzegowych?    | zepsuta logika, pominięte błędy i regresje            | poprawny na ścieżce głównej, brzegach i błędach                     |
| `idiomaticity`              | Czy trzyma konwencje języka, frameworka i repo?                   | walczy z frameworkiem lub ignoruje konwencje          | nie do odróżnienia od dobrze utrzymanego kodu repo                  |
| `complexity`                | Czy jest tak proste, jak pozwala problem?                         | zbędna abstrakcja, głębokie zagnieżdżenia, duplikacja | minimalny i łatwy do prześledzenia                                  |
| `testRiskCoverage`          | Czy ryzykowne ścieżki są przetestowane proporcjonalnie?           | zmiana ryzykownego zachowania bez testów              | każda ryzykowna ścieżka ma sensowny test                            |
| `documentation`             | Czy nieoczywiste decyzje i publiczne powierzchnie są opisane?     | zaskakujące zachowanie bez wyjaśnienia                | "dlaczego" zapisane tam, gdzie zajrzy maintainer                    |
| `securitySafety`            | Czy zmiana unika podatności, wycieku sekretów i nieufnych danych? | wprowadza podatność lub wyciek                        | wejście walidowane, sekrety obsłużone, brak nowej powierzchni ataku |

## Konwencje projektu

Agent wymusza je ponad kryteriami ogólnymi (źródło: `AGENTS.md`, implementacja:
`packages/code-reviewer/src/project-conventions.ts`):

- błędy serwera logujemy przez `logServerEvent(level, op, fields)`, nigdy surowym `console.*`;
- nie logujemy e-maila, hasła ani surowego tokenu udostępniania, tylko `hashToken(token)` i bezpieczne identyfikatory;
- każda gałąź błędu przekierowująca z `?error=` najpierw loguje, z `...errorFields(error)`;
- dane z formularzy i body są walidowane (zod) przed użyciem, a niepoprawne body to 400 albo redirect, nie wyjątek;
- nowe tabele Supabase mają RLS z politykami per operacja i rola, a wydane migracje nigdy nie są edytowane.

## Bramka

PR spełnia Definition of Done, gdy jednocześnie:

1. werdykt agenta to `pass`,
2. każde z sześciu kryteriów ma ocenę co najmniej **5**,
3. `securitySafety` ma ocenę co najmniej **7**.

Dziś bramka jest **opcjonalna**: wynik pojawia się jako komentarz i etykieta `ai-cr:passed` / `ai-cr:failed`, ale
nie blokuje merge'a. Wymagana może się stać dopiero wtedy, gdy zestaw evali pokaże stabilne werdykty wybranego
modelu na wszystkich fixturach (wadliwe muszą dostawać `fail`, czysta `pass`).

## Poza zakresem agenta

Te rzeczy zostają decyzją człowieka, bo wymagają szerszego kontekstu niż diff:

- zgodność z celem biznesowym zmiany,
- dopasowanie do architektury systemu,
- ocena, czy PR nie jest za duży, żeby go sensownie przejrzeć (podział zmiany).

## Jak to zmieniać

1. Zmianę progu lub kryterium zapisujemy tutaj.
2. W tym samym PR aktualizujemy asercje w `packages/code-reviewer/evals/promptfooconfig.yaml`.
3. Przed zmianą promptu lub modelu uruchamiamy `npm run eval` w `packages/code-reviewer`; czerwona macierz blokuje zmianę.
