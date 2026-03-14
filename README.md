# KSeF Monitor

Darmowa aplikacja desktopowa na Windows do automatycznego monitorowania i przeglądania faktur z Krajowego Systemu e-Faktur (KSeF).

## Dlaczego KSeF Monitor?

Od 2026 roku Krajowy System e-Faktur jest obowiązkowy dla wszystkich podatników VAT w Polsce. Niestety, korzystanie z KSeF wiąże się z realnymi problemami:

**Interfejs KSeF bywa niedostępny.** Portal webowy Ministerstwa Finansów notuje regularne przerwy techniczne, awarie i spowolnienia — szczególnie w okresach rozliczeniowych. Każde logowanie wymaga profilu zaufanego lub podpisu kwalifikowanego, co czyni szybki podgląd faktury procesem na kilka minut.

**Integratorzy żądają wysokich opłat.** Komercyjne rozwiązania do integracji z KSeF kosztują od kilkuset do kilku tysięcy złotych miesięcznie za firmę. Dla jednoosobowej działalności, małej firmy czy biura rachunkowego obsługującego kilku klientów to nieuzasadniony wydatek — szczególnie gdy potrzeba sprowadza się do monitorowania przychodzących faktur.

**Brak prostego narzędzia do monitoringu.** Istniejące rozwiązania to albo pełne systemy ERP z modułem KSeF (drogie, skomplikowane), albo sam portal KSeF (niewygodny, bez powiadomień). Brakuje lekkiej aplikacji, która po prostu sprawdza czy przyszły nowe faktury i powiadamia o nich.

**KSeF Monitor rozwiązuje te problemy:**

- Działa lokalnie na Twoim komputerze — zero kosztów abonamentowych
- Automatycznie sprawdza nowe faktury w tle i powiadamia dźwiękiem
- Przechowuje faktury w zaszyfrowanej lokalnej bazie — działasz nawet gdy KSeF jest niedostępny
- Obsługuje wiele firm z jednej aplikacji
- Wizualizuje faktury XML w czytelnej formie — bez konieczności logowania do portalu
- Open source (MIT) — możesz sprawdzić kod, zmodyfikować, wdrożyć we własnej infrastrukturze

## Funkcje

### Monitoring i synchronizacja
- **Automatyczne monitorowanie** — cykliczne sprawdzanie nowych faktur w tle (konfigurowalny interwał)
- **Synchronizacja** — pobieranie wszystkich faktur od wybranej daty z API KSeF do lokalnej bazy
- **System tray** — aplikacja działa w zasobniku systemowym, minimalizuje się zamiast zamykać
- **Autostart** — automatyczne uruchamianie przy starcie Windows (zminimalizowana do tray)
- **Powiadomienia** — toast notification + dźwięk przy nowych fakturach

### Faktury
- **Przeglądanie** — filtrowanie po datach, typie podmiotu, statusie, kontrahencie, sortowanie, paginacja
- **Wizualizacja XML** — czytelny podgląd faktury (dane sprzedawcy/nabywcy, pozycje, podsumowanie kwot, płatność) z możliwością przełączenia na surowy XML
- **Lokalna baza SQLite** — faktury dostępne offline, wyszukiwanie po numerze/kontrahentach
- **Statusy faktur** — nowy (niebieski), zsynchronizowany (zielony), zignorowany (żółty)
- **Masowa zmiana statusu** — zaznacz wiele faktur i zmień status jednym kliknięciem
- **Export do CSV** — eksport zaznaczonych faktur do pliku CSV (otwieralny w Excel)
- **Pobieranie XML** — pobierz oryginalny plik XML faktury

### Bezpieczeństwo
- **Szyfrowanie tokenów** — tokeny KSeF i hasła integracji szyfrowane przez Electron safeStorage (DPAPI na Windows)
- **Szyfrowanie bazy danych** — plik SQLite szyfrowany AES-256-GCM (klucz powiązany z kontem Windows)
- **Blokada PIN** — opcjonalny kod PIN do odblokowania aplikacji przy starcie
- **Dane lokalne** — wszystko przechowywane na Twoim komputerze, brak chmury, brak telemetrii

### Integracje (framework pluginów)
- **Infover ERP** — konfiguracja połączenia (adres, login, hasło, baza danych)
- **Webhook** — powiadomienia HTTP o nowych fakturach (Slack, Teams, własny endpoint)
- Każda integracja: włącz/wyłącz, auto-sync, niezależna konfiguracja

### Dashboard
- **Statystyki** — liczba faktur, suma netto/brutto/VAT z lokalnej bazy
- **Ostatnie faktury** — szybki podgląd z możliwością kliknięcia w wizualizację
- **Przycisk synchronizacji** — jednym kliknięciem pobierz wszystkie faktury
- **Status monitoringu** — uruchom/zatrzymaj cykliczne sprawdzanie

### Inne
- **Wiele firm** — obsługa wielu certyfikatów KSeF, każda firma z własnym certyfikatem i kluczem
- **Ciemny/jasny motyw** — przełączanie w ustawieniach, dynamiczne kolory paska tytułu
- **Auto-aktualizacja** — automatyczne pobieranie i instalacja nowych wersji z GitHub Releases
- **Logi** — podgląd aktywności API, synchronizacji i błędów w czasie rzeczywistym

## Dla kogo?

- **Jednoosobowa działalność gospodarcza** — monitoruj przychodzące faktury bez logowania do portalu KSeF
- **Małe i średnie firmy** — obsługa wielu firm z jednej aplikacji, statusy faktur, eksport
- **Biura rachunkowe** — szybki podgląd faktur klientów, masowe operacje, integracje z ERP
- **Programiści i integratorzy** — open source, framework pluginów, webhook do własnych systemów

## Wymagania

- Windows 10/11 (x64)
- Certyfikat kwalifikowany lub pieczęć elektroniczna do autoryzacji w KSeF (plik .crt/.cer/.pem + klucz prywatny .key/.pem)

## Instalacja

Pobierz najnowszy instalator z [GitHub Releases](https://github.com/ksefmonitor/ksefmonitor/releases):

1. Pobierz `KSeF-Monitor-X.X.X-Setup.exe`
2. Uruchom instalator
3. Po instalacji skonfiguruj połączenie w **Ustawienia**:
   - Dodaj firmę — podaj NIP, wskaż plik certyfikatu (.crt/.cer/.pem) i klucza prywatnego (.key/.pem)
   - Opcjonalnie ustaw interwał sprawdzania i PIN blokady
4. Na **Dashboard** kliknij **Synchronizuj** aby pobrać istniejące faktury

## Konfiguracja autoryzacji KSeF

Aplikacja autoryzuje się w KSeF za pomocą certyfikatu kwalifikowanego (podpis XAdES):

1. Przygotuj certyfikat (.cer lub .pem) i klucz prywatny (.key lub .pem)
2. W aplikacji przejdź do **Ustawienia → Dodaj firmę**
3. Podaj NIP firmy
4. Wskaż pliki certyfikatu i klucza prywatnego
5. Podaj hasło do klucza prywatnego (jeśli jest zaszyfrowany)

Hasło klucza jest szyfrowane lokalnie (DPAPI) i nigdy nie opuszcza komputera.

## Rozwój

### Wymagania

- Node.js 20+
- npm

### Instalacja zależności

```bash
npm install
```

### Uruchomienie w trybie developerskim

```bash
npm run dev
```

### Budowanie

```bash
npx electron-vite build
npx electron-builder --win
```

Instalator zostanie wygenerowany w katalogu `release/`.

### Publikacja nowej wersji

1. Zwiększ wersję:
```bash
npm version patch
```

2. Zbuduj i opublikuj:
```powershell
$env:GH_TOKEN="ghp_twoj_token"
npx electron-vite build
npx electron-builder --win --publish always
```

## Stack technologiczny

| Technologia | Wersja | Opis |
|---|---|---|
| Electron | 41 | Framework aplikacji desktopowej |
| React | 19 | Interfejs użytkownika |
| MUI | 7 | Komponenty Material Design |
| Vite | 7 | Bundler (electron-vite) |
| TypeScript | 5.8 | Typowanie statyczne |
| sql.js | - | SQLite w WASM (lokalna baza offline) |
| electron-updater | - | Auto-aktualizacje z GitHub Releases |
| electron-store | 11 | Persystencja konfiguracji (ESM) |
| xml-crypto | - | Podpis XAdES (autoryzacja certyfikatem) |

## Architektura

```
src/
├── main/               # Proces główny Electron
│   ├── main.ts          # Okno, tray, IPC handlers, autostart
│   ├── ksef-api.ts      # Klient API KSeF (auth flow, zapytania)
│   ├── database.ts      # Lokalna baza SQLite (sql.js) + szyfrowanie AES-256
│   ├── scheduler.ts     # Cykliczne sprawdzanie faktur
│   ├── store.ts         # Persystencja konfiguracji + szyfrowanie haseł
│   ├── crypto.ts        # Szyfrowanie safeStorage (DPAPI) + AES-256-GCM
│   └── xlsx-builder.ts  # Export CSV
├── preload/             # Context bridge (IPC API)
├── renderer/            # Frontend React
│   ├── components/      # Sidebar, InvoiceViewer, LockScreen
│   ├── pages/           # Dashboard, Faktury, Integracje, Logi, Ustawienia
│   └── theme.ts         # Motywy MUI (dark/light)
└── shared/              # Współdzielone typy TypeScript
```

### Przepływ autoryzacji KSeF

Aplikacja autoryzuje się w KSeF za pomocą podpisu XAdES:

1. Żądanie challenge z API (`POST /auth/challenge`)
2. Budowanie dokumentu XML `AuthTokenRequest` z NIP i typem `certificateSubject`
3. Podpis XAdES-BES certyfikatem kwalifikowanym (xml-crypto)
4. Wysłanie podpisanego XML (`POST /auth/xades-signature`)
5. Polling statusu autentykacji
6. Wymiana na access/refresh token (`POST /auth/token/redeem`)
7. Auto-odświeżanie tokenów z 60s marginesem bezpieczeństwa

### Bezpieczeństwo danych

- **Hasła kluczy prywatnych** — szyfrowane `safeStorage` (DPAPI na Windows, powiązane z kontem użytkownika)
- **Baza danych** — plik SQLite szyfrowany AES-256-GCM (klucz z safeStorage)
- **PIN** — szyfrowany tym samym mechanizmem
- **Zero chmury** — dane przechowywane wyłącznie lokalnie w `%APPDATA%/ksef-monitor/`
- **Zero telemetrii** — aplikacja komunikuje się tylko z API KSeF i GitHub (aktualizacje)
- **Open source** — pełny kod źródłowy do audytu

## Porównanie z alternatywami

| Funkcja | KSeF Monitor | Portal KSeF | Komercyjni integratorzy |
|---|---|---|---|
| Koszt | Darmowy (MIT) | Darmowy | 200-5000 zł/mies. |
| Automatyczny monitoring | Tak | Nie | Zależy od planu |
| Powiadomienia o nowych fakturach | Tak | Nie | Zależy od planu |
| Praca offline | Tak (lokalna baza) | Nie | Rzadko |
| Wiele firm | Tak | Osobne logowanie | Dodatkowa opłata |
| Wizualizacja faktur | Tak | Ograniczona | Tak |
| Export danych | CSV | Brak | Zależy od planu |
| Szyfrowanie lokalne | AES-256 + DPAPI | N/A | Rzadko |
| Open source | Tak | Nie | Nie |
| Wymagane logowanie | Certyfikat (jednorazowa konfiguracja) | Profil zaufany (każdorazowo) | Różnie |

## Licencja

MIT — używaj, modyfikuj i dystrybuuj bez ograniczeń.
