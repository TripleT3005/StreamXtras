# Stream Overlays

[English](#english) · [Deutsch](#deutsch)

## English

Lightweight, self-hosted overlays for OBS as a free alternative to hosted overlay services.
Overlays are plain web pages used as OBS browser sources with a transparent background. No account, no tracking, no external fonts or scripts.

> Work in progress. Not affiliated with or endorsed by Twitch, 7TV, BetterTTV or FrankerFaceZ. Twitch is a trademark of Twitch Interactive, Inc.

### Planned
- **Chat box** – reads the chat anonymously (no login), shows emotes from Twitch, 7TV, BetterTTV and FrankerFaceZ and removes messages deleted by moderators
- **Alerts and more** – later, via a small optional local companion app

### Configuration
Overlays are configured through URL parameters of the browser source.
Local configuration files are never committed: files named `*.config.json` or `*.local.json` are ignored by Git. Each one has a committed template next to it named `*.config.example.json`, which you copy and fill in.

### Development
Requires [Node.js](https://nodejs.org/) (LTS). The only dependency is the TypeScript compiler.

```
npm install
npm run build    # compile src/ to web/scripts/ (or: npm run watch)
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

### Konfiguration
Die Overlays werden über URL-Parameter der Browserquelle eingestellt.
Lokale Konfigurationsdateien werden nie eingecheckt: Dateien mit der Endung `*.config.json` oder `*.local.json` ignoriert Git. Daneben liegt jeweils eine eingecheckte Vorlage `*.config.example.json`, die man kopiert und ausfüllt.

### Entwicklung
Voraussetzung ist [Node.js](https://nodejs.org/) (LTS). Einzige Abhängigkeit ist der TypeScript-Compiler.

```
npm install
npm run build    # übersetzt src/ nach web/scripts/ (oder: npm run watch)
npm run serve    # optionaler lokaler Testserver unter http://127.0.0.1:8080/
```

Die Diagnoseseite `web/diagnostics/index.html` prüft, ob eine Browserquelle die Overlays laden kann: ES-Module, URL-Parameter, lokale Dateien, die Emote-APIs und die anonyme Verbindung zum Twitch-Chat. Mit `?channel=deinname` wird zusätzlich das Betreten eines Kanals getestet.

### Lizenz
[MIT](LICENSE)
