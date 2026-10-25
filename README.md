# Stream Overlays

[English](#english) · [Deutsch](#deutsch)

## English

Lightweight, self-hosted overlays for OBS as a free alternative to hosted overlay services.
Overlays are plain web pages used as OBS browser sources with a transparent background. No account, no tracking, no external fonts or scripts.

> Work in progress. Not affiliated with or endorsed by Twitch, 7TV, BetterTTV or FrankerFaceZ. Twitch is a trademark of Twitch Interactive, Inc.

### Planned
- **Chat box** – reads the chat anonymously (no login), shows emotes from Twitch, 7TV, BetterTTV and FrankerFaceZ and removes messages deleted by moderators
- **Alerts and more** – later, via a small optional local companion app

### Usage in OBS
1. Build the overlays once (see [Development](#development))
2. Copy `web/chatbox/chatbox.config.example.json` to `web/chatbox/chatbox.config.json` and set your channel
3. Add a browser source in OBS, check **Local file** and select `web/chatbox/index.html`

The overlays must be added as a local file: with a `file:///` URL, OBS blocks the scripts.

### Configuration
Each overlay reads its settings from a JSON file next to its `index.html`. Local configuration files are never committed: files named `*.config.json` or `*.local.json` are ignored by Git. Each one has a committed template next to it named `*.config.example.json`, which you copy and fill in.
When an overlay is served over HTTP, URL parameters (e.g. `?channel=yourname`) override the values from the file.

| Chat box setting | Default | Description |
|---|---|---|
| `channel` | – | Twitch channel to show (required) |
| `maxMessages` | `30` | Maximum number of visible messages (1–200) |
| `showBadges` | `true` | Show global badges (broadcaster, moderator, VIP, subscriber …) |
| `readableColors` | `true` | Lighten dark name colors exactly like Twitch's dark chat does |
| `emoteProviders` | `["7tv", "bttv", "ffz"]` | Third-party emote providers to load; Twitch emotes are always shown |

Users who never picked a name color get a random default color on Twitch that changes with every page load. The chat box instead assigns them a fixed color from the same palette, based on their user ID.

### Development
Requires [Node.js](https://nodejs.org/) (LTS). The only dependency is the TypeScript compiler.

```
npm install
npm run build    # compile src/ to web/scripts/ (or: npm run watch)
npm test         # type-check and run the unit tests
npm run serve    # optional local test server at http://127.0.0.1:8080/
```

The diagnostics page `web/diagnostics/index.html` checks whether a browser source can load the overlays: ES modules, URL parameters, local files, the emote APIs and the anonymous Twitch chat connection. Add `?channel=yourname` to also test joining a channel.

### License
[MIT](LICENSE)

## Deutsch

Schlanke, selbst betriebene Overlays für OBS als kostenlose Alternative zu gehosteten Overlay-Diensten.
Die Overlays sind einfache Webseiten, die als OBS-Browserquelle mit transparentem Hintergrund eingebunden werden. Kein Konto, kein Tracking, keine externen Schriften oder Skripte.

> In Arbeit. Keine Verbindung zu Twitch, 7TV, BetterTTV oder FrankerFaceZ und nicht von ihnen unterstützt. Twitch ist eine Marke von Twitch Interactive, Inc.

### Geplant
- **Chatbox** – liest den Chat anonym (ohne Login), zeigt Emotes von Twitch, 7TV, BetterTTV und FrankerFaceZ und entfernt von Moderatoren gelöschte Nachrichten
- **Alerts und mehr** – später, über eine kleine optionale lokale Begleit-Anwendung

### Verwendung in OBS
1. Overlays einmal bauen (siehe [Entwicklung](#entwicklung))
2. `web/chatbox/chatbox.config.example.json` nach `web/chatbox/chatbox.config.json` kopieren und den eigenen Kanal eintragen
3. In OBS eine Browserquelle hinzufügen, **Lokale Datei** anhaken und `web/chatbox/index.html` auswählen

Die Overlays müssen als lokale Datei eingebunden werden: Mit einer `file:///`-URL blockiert OBS die Skripte.

### Konfiguration
Jedes Overlay liest seine Einstellungen aus einer JSON-Datei neben seiner `index.html`. Lokale Konfigurationsdateien werden nie eingecheckt: Dateien mit der Endung `*.config.json` oder `*.local.json` ignoriert Git. Daneben liegt jeweils eine eingecheckte Vorlage `*.config.example.json`, die man kopiert und ausfüllt.
Wird ein Overlay über HTTP ausgeliefert, überschreiben URL-Parameter (z. B. `?channel=deinname`) die Werte aus der Datei.

| Chatbox-Einstellung | Standard | Beschreibung |
|---|---|---|
| `channel` | – | Anzuzeigender Twitch-Kanal (Pflicht) |
| `maxMessages` | `30` | Maximale Anzahl sichtbarer Nachrichten (1–200) |
| `showBadges` | `true` | Globale Badges anzeigen (Broadcaster, Moderator, VIP, Abonnent …) |
| `readableColors` | `true` | Dunkle Namensfarben genau so aufhellen wie der dunkle Twitch-Chat |
| `emoteProviders` | `["7tv", "bttv", "ffz"]` | Zu ladende Emote-Anbieter; Twitch-Emotes werden immer angezeigt |

Nutzer, die nie eine Namensfarbe gewählt haben, bekommen auf Twitch bei jedem Laden der Seite eine zufällige Standardfarbe. Die Chatbox gibt ihnen stattdessen eine feste Farbe aus derselben Palette, abhängig von ihrer Nutzer-ID.

### Entwicklung
Voraussetzung ist [Node.js](https://nodejs.org/) (LTS). Einzige Abhängigkeit ist der TypeScript-Compiler.

```
npm install
npm run build    # übersetzt src/ nach web/scripts/ (oder: npm run watch)
npm test         # Typprüfung und Unit-Tests
npm run serve    # optionaler lokaler Testserver unter http://127.0.0.1:8080/
```

Die Diagnoseseite `web/diagnostics/index.html` prüft, ob eine Browserquelle die Overlays laden kann: ES-Module, URL-Parameter, lokale Dateien, die Emote-APIs und die anonyme Verbindung zum Twitch-Chat. Mit `?channel=deinname` wird zusätzlich das Betreten eines Kanals getestet.

### Lizenz
[MIT](LICENSE)
