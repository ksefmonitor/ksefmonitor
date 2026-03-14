# KSeF Monitor

Aplikacja desktopowa na Windows do automatycznego monitorowania i przegl\u0105dania faktur z Krajowego Systemu e-Faktur (KSeF).

## Funkcje

- **Automatyczne monitorowanie** - cykliczne sprawdzanie nowych faktur w tle (konfigurowalny interwa\u0142)
- **System tray** - aplikacja dzia\u0142a w zasobniku systemowym, minimalizuje si\u0119 zamiast zamyka\u0107
- **Przegl\u0105danie faktur** - filtrowanie po datach, typie daty, sortowanie, paginacja
- **Podgl\u0105d XML** - podgl\u0105d i pobieranie oryginalnych faktur XML
- **Dashboard** - podsumowanie faktur z ostatniego miesi\u0105ca (ilo\u015b\u0107, netto, brutto, VAT)
- **Podsumowania** - generowanie raport\u00f3w na podstawie zaznaczonych faktur lub zakresu dat
- **Powiadomienia** - systemowe powiadomienia o nowych fakturach
- **Auto-aktualizacja** - automatyczne pobieranie i instalacja nowych wersji z GitHub Releases
- **Ciemny/jasny motyw** - prze\u0142\u0105czanie w ustawieniach

## Wymagania

- Windows 10/11 (x64)
- Token autoryzacyjny API KSeF
- NIP podmiotu

## Instalacja

Pobierz najnowszy instalator z [GitHub Releases](https://github.com/ksefmonitor/ksefmonitor/releases):

1. Pobierz `KSeF-Monitor-X.X.X-Setup.exe`
2. Uruchom instalator
3. Po instalacji skonfiguruj po\u0142\u0105czenie z API w **Ustawienia**:
   - **Adres API** - domy\u015blnie `https://api.ksef.mf.gov.pl/v2`
   - **Token** - token autoryzacyjny API KSeF
   - **NIP** - numer NIP podmiotu
   - **Interwa\u0142 sprawdzania** - co ile minut sprawdza\u0107 nowe faktury (domy\u015blnie 15)

## Konfiguracja API KSeF

Aplikacja wymaga tokenu autoryzacyjnego do API KSeF. Token mo\u017cna uzyska\u0107:

1. Wejd\u017a na [portal KSeF](https://ksef.mf.gov.pl/)
2. Zaloguj si\u0119 za pomoc\u0105 profilu zaufanego lub podpisu kwalifikowanego
3. Wygeneruj token autoryzacyjny dla aplikacji
4. Skopiuj token i wklej w ustawieniach aplikacji

## Rozwój

### Wymagania

- Node.js 20+
- npm

### Instalacja zale\u017cno\u015bci

```bash
npm install
```

### Uruchomienie w trybie developerskim

```bash
npm run dev
```

### Budowanie

```bash
npm run dist
```

Instalator zostanie wygenerowany w katalogu `release/`.

### Publikacja nowej wersji

1. Zwi\u0119ksz wersj\u0119:
```bash
npm version patch
```

2. Opublikuj na GitHub Releases:
```powershell
$env:GH_TOKEN="ghp_twoj_token"
npm run dist:publish
```

## Stack technologiczny

- **Electron 41** - framework aplikacji desktopowej
- **React 19** - interfejs u\u017cytkownika
- **MUI 7** - komponenty UI (Material Design)
- **Vite 7** - bundler
- **TypeScript 5.8** - typowanie
- **electron-updater** - auto-aktualizacje z GitHub Releases
- **electron-store** - lokalne przechowywanie konfiguracji

## Struktura projektu

```
src/
\u251c\u2500\u2500 main/           # Proces g\u0142\u00f3wny Electron
\u2502   \u251c\u2500\u2500 main.ts      # Okno, tray, IPC handlers
\u2502   \u251c\u2500\u2500 ksef-api.ts  # Klient API KSeF
\u2502   \u251c\u2500\u2500 scheduler.ts # Cykliczne sprawdzanie faktur
\u2502   \u2514\u2500\u2500 store.ts     # Persystencja konfiguracji
\u251c\u2500\u2500 preload/        # Preload script (context bridge)
\u251c\u2500\u2500 renderer/       # Frontend React
\u2502   \u251c\u2500\u2500 pages/       # Dashboard, Faktury, Podsumowania, Ustawienia
\u2502   \u2514\u2500\u2500 main.tsx     # Entry point renderera
\u2514\u2500\u2500 shared/         # Wsp\u00f3lne typy TypeScript
```

## Licencja

MIT
