# UMBRA 3.0 — Noir / Amethyst

Self-hosted komunikator na komputer i telefon (przeglądarka, responsywny interfejs). Jeden backend Fastify + Socket.IO, jedna baza dla kont/grup/wiadomości, lokalnie lub przez ngrok. **Nie jest komunikatorem E2EE**.

## WINDOWS — JEDEN PLIK BAT

1. Rozpakuj ZIP (nie uruchamiaj bez rozpakowania).
2. Kliknij **`START_UMBRA.bat` w GŁÓWNYM katalogu**.
3. Wybierz **1 / LOCAL** lub **2 / NGROK**.
4. Skrypt uruchamia serwer, wyświetla link **`http://127.0.0.1:3000`**, adres zaproszenia **`http://127.0.0.1:3000/k/67767`** i panel **`http://127.0.0.1:3000/panel`**. W Windows próbuje automatycznie otworzyć przeglądarkę.
5. Przy ngrok CLI i poprawnie skonfigurowanym tokenie skrypt dodatkowo próbuje odczytać z lokalnego API ngrok publiczny link HTTPS oraz adres `/k/67767` na tej domenie. **Nie gwarantuje** tunelu bez zainstalowania ngrok i konta.
6. Zamknij okno serwera lub Ctrl+C, aby zakończyć jego proces. Nie uruchamiaj kilku instancji na jednej bazie/porcie.

**Wymagane:** Windows z Node.js 20 lub nowszym. Paczka zawiera zależności `server/node_modules`; przy ich braku launcher wykona `npm ci --omit=dev`. NGROK wymaga osobno [ngrok CLI](https://ngrok.com/download) oraz `ngrok config add-authtoken ...`.

**Pierwszy administrator:** przy pierwszym uruchomieniu automatycznie tworzy się losowe silne hasło. Jest drukowane w konsoli i zapisane w `server/data/INITIAL_ADMIN_PASSWORD.txt`. Otwórz `/panel`, zaloguj się i **od razu zmień to hasło**. Po zmianie plik startowy znika i wszystkie wcześniejsze tokeny administratora tracą ważność.

**Klucz 67767:** automatycznie tworzony jednorazowy kod zaproszenia do **pierwszego konta**, a nie hasło administratora ani wspólny login dla wszystkich. Po aktywacji `/k/67767` służy do logowania tej jednej osoby za pomocą jej hasła. Kolejne konta twórz przez panel admina (`/panel`) z nowymi kodami. **67767 to łatwy do odgadnięcia kod**, nie traktuj go jako silnego sekretu. Podczas pierwszego użycia w publicznej sieci zadbaj, by niepowołana osoba nie aktywowała go pierwsza.

## Zmiany interfejsu

- Wizualny system NOIЯ: niemal czarne powierzchnie, gradienty ametystowe, spójne obramowania, subtelne cienie, profesjonalne karty, wyszukiwarki, panele i listy.
- Płynne wejścia elementów, animacja nowych wiadomości, status połączenia, delikatne reakcje na hover, preferencja `prefers-reduced-motion` wyłącza animacje.
- Responsywny layout dla telefonu/tabletu. Manifest do instalacji skrótu PWA (bez offline-cache, push i natywnego APK).
- Scroll zostaje na swojej pozycji podczas napływu wiadomości, jeśli użytkownik czyta historię, a przycisk „↓ Najnowsze” przenosi na koniec.
- Auto-wysokość kompozytora, Enter — wyślij, Shift+Enter — nowa linia; Esc — zamknij modal/menu; modal ma ograniczony fokus i powrót do poprzedniego elementu; skrót klawiaturowy kopiuje SID.
- Ponawianie identyfikowanej wiadomości nie zapisuje duplikatu. Przy braku real-time klient sprawdza historię co 8 sekund (HTTP fallback).

## Zapis danych i zabezpieczenia

- Po uruchomieniu stan trafia do **`server/data/state.enc`**, a nie jawnego `state.json`. AES-256-GCM + weryfikacja integralności, losowe IV i salt, `scrypt` do wyprowadzenia klucza. Zapis atomowy przez plik tymczasowy + `fsync` + rename.
- Klucz domyślnie bazuje na `server/data/secrets.json` (który zawiera również sekret do podpisywania sesji). **Samo posiadanie obu plików `state.enc` i `secrets.json` umożliwia odszyfrowanie danych.** Chroń folder przed dostępem nieuprawnionych osób.
- Opcjonalnie ustaw **`UMBRA_DATA_PASSPHRASE`** jako silną sekretną wartość dostarczaną spoza katalogu aplikacji, **przed utworzeniem bazy**. Potem używaj zawsze tej samej wartości; jej utrata oznacza brak odzyskania wiadomości. Nie wstawiaj tego hasła do frontendowego JS ani do repozytorium.
- Po poprawnej migracji usuwane są stare `state.json` i rozbite pliki `user.json`, `messages.json` itp., które mogły trzymać dane jawnie. **Przed pierwszą migracją wykonaj kopię danych, jeśli są ważne.** Nie nadpisuj starej bazy z różnych instancji naraz.
- Hasła kont i administratora są hashowane bcrypt, sesje JWT mają czas ważności, uprawnienia sprawdzane przy każdym API oraz wysłaniu Socket.IO, ograniczone są próby logowania i tempo wiadomości (45/min/użytkownika). Panel admina wymaga oddzielnego tokenu i jest blokowany po zmianie hasła.
- Nie ma E2EE, MFA, pełnego audytu aplikacji ani zewnętrznego HSM. Operator serwera może odszyfrować historię, klient przeglądarkowy może zostać poddany analizie, ngrok terminates TLS na swojej infrastrukturze. HTTPS po stronie ngrok, lokalny HTTP między tunelem a aplikacją na tym komputerze.

## C++ — co jest rzeczywiście natywne

**C++ / OpenSSL AES-256-GCM:** kod `native/umbra_crypto.cc` (Node-API C++20), testowany na Linux (kompilacja i szyfrowanie). Windows kompilacja opcjonalna przez `native/BUILD_NATIVE_WINDOWS.bat` — wymaga Visual Studio Build Tools (C++), CMake, nagłówków Node i OpenSSL developer binaries. Po skompilowaniu `native/build/umbra_crypto.node` serwer automatycznie używa modułu. Jeśli go nie ma, działa identyczne szyfrowanie przez **Node.js `node:crypto`, natywnie implementowane w OpenSSL/C++**. Na Windows gotowy addon C++ nie jest dołączony, bo nie można bezpiecznie podmienić kompilacji Linux na binarium Windows.

**C++ / Windows launcher:** `native/desktop/UmbraDesktop.cpp` to program Win32 C++ z czarno-fioletowym oknem przycisków LOCAL, NGROK i otwarcia komunikatora. Aby zbudować na Windows, uruchom `native/desktop/BUILD_DESKTOP_WINDOWS.bat` z **x64 Developer Command Prompt for Visual Studio 2022+**. Jest to **natywny launcher**, a nie przepisany w całości messenger C++; korzysta z Node serwera i klienta WWW. Windowsowa kompilacja desktopowego C++ nie została tu zweryfikowana — standardowy `START_UMBRA.bat` działa niezależnie od niej.

**Czego nie da się ukryć w przeglądarce:** JS/HTML/CSS i ewentualne WebAssembly skompilowane z C++ są dostarczane użytkownikowi, więc można je analizować. Żaden algorytm nie może wymagać ukrytego sekretu w kodzie przeglądarkowym. Dlatego auth, dane i klucze pozostały po stronie serwera. Telefon korzysta z responsywnego WWW; nie dostarczono natywnego APK/iOS ani w pełni C++ mobilnego klienta.

## TESTY

Na Windows: kliknij **`TEST_UMBRA.bat`**. Na innych platformach (w głównym folderze):

```bash
node --test tests/integration.test.js tests/security.test.js tests/vault.test.js
```

Sprawdzone: dwa transporty HTTP/Socket.IO, konta, SID i grupy, próby niedozwolonych działań, dostęp admina, unieważnienie starej sesji, potwierdzenie zapisu po restarcie, idempotencja wysłania, szyfrowanie/odszyfrowywanie, integralność AES-GCM, migracja starych danych i błąd bez klucza. **Nie udało się uruchomić interakcyjnego testu Chromium — nawigację blokuje środowisko testowe.** Win32 launcher i rzeczywista sesja ngrok nie zostały wykonane na tym środowisku.

## Struktura

```text
START_UMBRA.bat        — główny uruchamiacz
TEST_UMBRA.bat         — testy
OPEN_67767.url         — lokalny skrót konta pierwszego
scripts/launch.mjs     — zarządzanie serwerem i ngrok
server/index.js        — HTTP, autoryzacja, grupy, Socket.IO
server/store.js        — migracja i stan
server/vault.js        — AES-GCM + C++ opcjonalnie
server/data/           — stan, sekrety (NIE udostępniaj)
web/                   — frontend web/mobile i manifest
native/                — natywne C++ źródła i skrypty budowy
legacy/                — stare źródła, nie są wykonywane
tests/                 — integracyjne i bezpieczeństwo
```

Istotne: brak resetu hasła użytkownika, dostępu do nieograniczonej historii, uploadu plików, audio/wideo, moderacji, E2EE oraz natywnych klientów Android/iOS. Nie należy reklamować tych rzeczy jako wykonanych.
