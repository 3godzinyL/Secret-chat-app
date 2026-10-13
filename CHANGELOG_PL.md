# UMBRA 3.0 — co zostało zmienione względem wersji 2.0

## 1. Użytkownik i klucz

- Wstępnie rezerwowany `67767`: jednorazowa aktywacja pierwszego konta (w przypadku nowej bazy); później login istniejącego użytkownika. Klucz nie służy jako hasło admina. Nie jest ponownie tworzony po ręcznym unieważnieniu (flaga `initialInviteInitialized`).
- Nowy launcher w folderze głównym `START_UMBRA.bat` z dwoma trybami. Serwer jest podnoszony przez `scripts/launch.mjs`, a nie losowo uruchamiane w tle osobne pod-serwery. Health-check zanim ogłosi gotowość, wydruk linków, automatyczne otwarcie browsera na Windows, próba pobrania publicznego HTTPS z ngrok API 4040.
- `TEST_UMBRA.bat` umożliwia sprawdzenie projektu po rozpakowaniu.

## 2. Design + UX

- Styl Noir/Amethyst, kolorystyka czarny/fioletowy, przebudowana hierarchia kontrastu, tła i kart.
- CSS transform/opacity motion + prefer-reduced-motion. Obsługa wielu rozmiarów ekranów.
- Skok do ostatniej wiadomości, brak przymusowego przewijania podczas czytania historii, auto-resize textarea, fokus i Escape w modalach, kopiowanie SID z klawiatury.
- Spójniejszy wygląd czatu, logowania, strony głównej i panelu admina, animowane stany statusu połączenia.
- Brak duplikowania wiadomości po timeout i ponownej próbie. HTTP polling historii jeśli Socket.IO niepołączone (8 s), aby tryb awaryjny nie był jednostronny.
- Manifest PWA dla telefonu — nie oznacza to natywnego programu mobilnego C++.

## 3. Security & save

- `state.json` zostaje przeniesiony do `state.enc`: AES-256-GCM, losowy IV, random salt/scrypt, auth tag, atomowy zapis + fsync, odrzucenie zmodyfikowanych plików.
- Szyfrowanie zewnętrznym kluczem za pomocą zmiennej `UMBRA_DATA_PASSPHRASE` opcjonalnie, bez niej wymaga zachowania osobno `secrets.json`.
- Odmowa uruchomienia jeśli stan istnieje, a plik sekretów zniknął: nie następuje nadpisanie błędnym kluczem.
- Usuwanie starych jawnych split JSON po udanej migracji. Pamiętaj o backupie przed przejściem na nowy format.
- Unieważnianie JWT admina po zmianie hasła, limit 45 wiadomości/min na użytkownika (w tym Socket.IO), walidacja payload, deduplikacja przez clientMessageId, dodatkowe nagłówki ochronne.
- Test w C++ i OpenSSL dla AES-GCM. Kod źródłowy C++ i skrypty budowy dołączone; Linux build sprawdzony, nie udajemy ukończonego pełnego portu aplikacji na C++.

## 4. Native C++

- `native/umbra_crypto.cc`: rzeczywisty moduł kryptograficzny N-API C++20 + OpenSSL EVP, bez jawnych kluczy po stronie WWW.
- `native/desktop/UmbraDesktop.cpp`: natywny program Windows (okno sterowania startem Node/ngrok i przyciskiem otwarcia przeglądarki). Wymaga kompilacji na Windows z MSVC. Nie jest samodzielnym natywnym silnikiem messengerów.
- Pozostawiono backend Fastify/Node z funkcjonalnym Socket.IO: jego całkowite przeprogramowanie byłoby odrębnym projektem z koniecznością zapewnienia protokołu, testów i kompatybilności. W tej wersji bezpieczeństwo ważniejsze niż deklaracja nierealnego ukrycia klienta.

## 5. Weryfikacja / ograniczenia

- Testy Node: HTTP+Socket.IO, tworzenie kont, wiadomości, członkostwa, odmowy dostępu, zmiana hasła admina i anulowanie tokenu, zapisy po restarcie, AES-GCM i migracja.
- Składnia JS sprawdzona. Elementy DOM używane przez klienta i panel admina istnieją w HTML.
- **Bez pełnego manualnego E2E w Chromium**: przeglądarka uruchamia się, ale polityka środowiska blokuje nawet nawigację testową (`ERR_BLOCKED_BY_ADMINISTRATOR`). Windows C++ nie kompilowano na Linux; ngrok wymaga tokenu i nie został przetestowany w chmurze.
- Niezaimplementowane: natywne pełne C++ desktop/mobile, ukrywalny kod frontendu, E2EE, połączenia audio/wideo, pliki, push, MFA, reset haseł, produkcyjna infrastruktura bazodanowa.
