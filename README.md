# KSeF Monitor

Aplikacja desktopowa na Windows do automatycznego monitorowania i przeglądania faktur z Krajowego Systemu e-Faktur (KSeF).

## Funkcje

### Monitoring i synchronizacja
- **Automatyczne monitorowanie** — cykliczne sprawdzanie nowych faktur w tle (konfigurowalny interwał)
- **Synchronizacja** — pobieranie wszystkich faktur od wybranej daty z API KSeF do lokalnej bazy
- **System tray** — aplikacja działa w zasobniku systemowym, minimalizuje się zamiast zamykać
- **Autostart** — automatyczne uruchamianie przy starcie Windows (zminimalizowana do tray)
- **Powiadomienia** — dźwięk i dymek w tray przy nowych fakturach

### Faktury
- **Przeglądanie** — filtrowanie po datach, typie podmiotu, statusie, sortowanie, paginacja
- **Wizualizacja XML** — czytelny podgląd faktury (dane sprzedawcy/nabywcy, pozycje, podsumowanie kwot, płatność) z możliwością przełączenia na surowy XML
- **Lokalna baza SQLite** — faktury dostępne offline, wyszukiwanie po numerze/kontrahentach
- **Statusy faktur** — nowy (niebieski), zsynchronizowany (zielony), zignorowany (żółty)
- **Masowa zmiana statusu** — zaznacz wiele faktur i zmień status jednym kliknięciem
- **Export do Excel** — eksport zaznaczonych faktur do pliku .xlsx
- **Pobieranie XML** — pobierz oryginalny plik XML faktury

### Bezpieczeństwo
- **Szyfrowanie tokenów** — tokeny KSeF i hasła integracji szyfrowane przez Electron safeStorage (DPAPI na Windows)
- **Blokada PIN** — opcjonalny kod PIN do odblokowania aplikacji przy starcie

### Integracje (framework pluginów)
- **Infover ERP** — konfiguracja połączenia (adres, login, hasło, baza danych)
- **Comarch Optima** — konfiguracja serwera SQL i baz danych
- **Webhook** — powiadomienia HTTP o nowych fakturach (Slack, Teams, własny endpoint)
- Każda integracja: włącz/wyłącz, auto-sync, niezależna konfiguracja

### Dashboard
- **Statystyki** — liczba faktur, suma netto/brutto/VAT z lokalnej bazy
- **Ostatnie faktury** — szybki podgląd z możliwością kliknięcia w wizualizację
- **Przycisk synchronizacji** — jednym kliknięciem pobierz wszystkie faktury od 01.02.2026
- **Status monitoringu** — uruchom/zatrzymaj cykliczne sprawdzanie

### Inne
- **Wiele firm** — obsługa wielu tokenów KSeF, NIP wyodrębniany automatycznie z tokenu
- **Ciemny/jasny motyw** — przełączanie w ustawieniach, dynamiczne kolory paska tytułu
- **Auto-aktualizacja** — automatyczne pobieranie i instalacja nowych wersji z GitHub Releases
- **Logi** — podgląd aktywności API, synchronizacji i błędów w czasie rzeczywistym
- **Hamburger menu** — wysuwany drawer zamiast stałego sidebara

## Wymagania

- Windows 10/11 (x64)
- Token autoryzacyjny API KSeF

## Instalacja

Pobierz najnowszy instalator z [GitHub Releases](https://github.com/ksefmonitor/ksefmonitor/releases):

1. Pobierz `KSeF-Monitor-X.X.X-Setup.exe`
2. Uruchom instalator
3. Po instalacji skonfiguruj połączenie w **Ustawienia**:
   - Dodaj firmę (wklej token KSeF — NIP zostanie wyodrębniony automatycznie)
   - Opcjonalnie ustaw interwał sprawdzania i PIN blokady
4. Na **Dashboard** kliknij **Synchronizuj** aby pobrać istniejące faktury

## Konfiguracja API KSeF

Aplikacja wymaga tokenu autoryzacyjnego do API KSeF:

1. Wejdź na [portal KSeF](https://ksef.mf.gov.pl/)
2. Zaloguj się za pomocą profilu zaufanego lub podpisu kwalifikowanego
3. Wygeneruj token autoryzacyjny dla aplikacji
4. Skopiuj token i wklej w **Ustawienia → Dodaj firmę**

Format tokenu: `XXXXXXXX-EC-...|nip-XXXXXXXXXX|hash` — NIP jest automatycznie wyodrębniany.

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
| yazl | - | Tworzenie plików XLSX (ZIP) |

## Architektura

```
src/
├── main/               # Proces główny Electron
│   ├── main.ts          # Okno, tray, IPC handlers, autostart
│   ├── ksef-api.ts      # Klient API KSeF (auth flow, zapytania)
│   ├── database.ts      # Lokalna baza SQLite (sql.js)
│   ├── scheduler.ts     # Cykliczne sprawdzanie faktur
│   ├── store.ts         # Persystencja konfiguracji + szyfrowanie
│   └── crypto.ts        # Szyfrowanie safeStorage (DPAPI)
├── preload/             # Context bridge (IPC API)
├── renderer/            # Frontend React
│   ├── components/      # Sidebar, InvoiceViewer, LockScreen
│   ├── pages/           # Dashboard, Faktury, Integracje, Logi, Ustawienia
│   └── theme.ts         # Motywy MUI (dark/light)
└── shared/              # Współdzielone typy TypeScript
```

### Przepływ autoryzacji KSeF

1. Pobranie certyfikatu klucza publicznego MF
2. Żądanie challenge z API
3. Szyfrowanie tokenu RSA-OAEP SHA-256
4. Autentykacja `/auth/ksef-token`
5. Polling statusu autentykacji
6. Wymiana na access/refresh token
7. Auto-odświeżanie tokenów z 60s marginesem

### Bezpieczeństwo danych

- Tokeny KSeF i hasła integracji szyfrowane `safeStorage` (DPAPI na Windows)
- Dane przechowywane lokalnie w `%APPDATA%/ksef-monitor/`
- Opcjonalny PIN — szyfrowany tym samym mechanizmem
- Brak przesyłania danych do zewnętrznych serwerów (poza API KSeF i GitHub Updates)

## Licencja

MIT
