# Stream Overlays

[English](#english) · [Deutsch](#deutsch)

## English

Lightweight, self-hosted overlays for OBS as a free alternative to hosted overlay services.
A small companion app runs in the system tray, serves the overlays and a settings page on your computer and connects them to Twitch. No account with a third-party service, no tracking, no external fonts or scripts.

> Work in progress. Not affiliated with or endorsed by Twitch, 7TV, BetterTTV or FrankerFaceZ. Twitch is a trademark of Twitch Interactive, Inc.

### Features
- **Chat box** – reads the chat anonymously (no login), shows emotes from Twitch, 7TV, BetterTTV and FrankerFaceZ, highlights announcements and removes messages deleted by moderators
- **Companion app** – tray icon, local settings page, overlay settings that apply live without reloading the OBS source
- **Planned** – all Twitch badges and streamer icons in shared chat via the Twitch API, alerts

### Usage
1. Start the companion app (see [Development](#development) until releases are available). On the first start the settings page opens in your browser; later you open it with a click on the tray icon.
2. Enter your Twitch channel in the settings.
3. Copy the URL of the overlay (e.g. `http://127.0.0.1:47820/chatbox/`) and add it to OBS as a browser source with **Local file** unchecked.

The companion app only listens on `127.0.0.1`. Its configuration lives outside the repository (Windows: `%APPDATA%\stream-overlays`, macOS: `~/Library/Application Support/stream-overlays`, Linux: `~/.config/stream-overlays`).

### Chat box settings
URL parameters (e.g. `?channel=othername`) override the stored settings for a single browser source.

| Setting | Default | Description |
|---|---|---|
| `channel` | – | Twitch channel to show (required) |
| `maxMessages` | `30` | Maximum number of visible messages (1–200) |
| `showBadges` | `true` | Show global badges (broadcaster, moderator, VIP, subscriber …) |
| `readableColors` | `true` | Lighten dark name colors exactly like Twitch's dark chat does |
| `emoteProviders` | `["7tv", "bttv", "ffz"]` | Third-party emote providers to load; Twitch emotes are always shown |

Users who never picked a name color get a random default color on Twitch that changes with every page load. The chat box instead assigns them a fixed color from the same palette, based on their user ID.

### Development
Requires [Node.js](https://nodejs.org/) (LTS) for the overlays and [Rust](https://www.rust-lang.org/) (stable) for the companion app. The only Node dependency is the TypeScript compiler.

```
npm install
npm run watch            # compile src/ to web/scripts/ on every change
cd companion && cargo run  # serves web/ from the repository in debug builds
```

Tests: `npm test` for the overlays, `cargo test` in `companion/` for the companion app.
The diagnostics page (`/diagnostics/`) checks the emote APIs and the anonymous Twitch chat connection; add `?channel=yourname` to also test joining a channel.

### License
[MIT](LICENSE)

## Deutsch

Schlanke, selbst betriebene Overlays für OBS als kostenlose Alternative zu gehosteten Overlay-Diensten.
Eine kleine Begleit-Anwendung läuft im Infobereich (Tray), liefert die Overlays und eine Einstellungsseite auf deinem Rechner aus und verbindet sie mit Twitch. Kein Konto bei einem Drittanbieter, kein Tracking, keine externen Schriften oder Skripte.

> In Arbeit. Keine Verbindung zu Twitch, 7TV, BetterTTV oder FrankerFaceZ und nicht von ihnen unterstützt. Twitch ist eine Marke von Twitch Interactive, Inc.

### Funktionen
- **Chatbox** – liest den Chat anonym (ohne Login), zeigt Emotes von Twitch, 7TV, BetterTTV und FrankerFaceZ, hebt Ankündigungen hervor und entfernt von Moderatoren gelöschte Nachrichten
- **Begleit-Anwendung** – Tray-Icon, lokale Einstellungsseite, Overlay-Einstellungen wirken sofort, ohne die OBS-Quelle neu zu laden
- **Geplant** – alle Twitch-Badges und Streamer-Icons im geteilten Chat über die Twitch-API, Alerts

### Verwendung
1. Begleit-Anwendung starten (bis es Releases gibt, siehe [Entwicklung](#entwicklung)). Beim ersten Start öffnet sich die Einstellungsseite im Browser, danach per Klick auf das Tray-Icon.
2. In den Einstellungen den eigenen Twitch-Kanal eintragen.
3. Die URL des Overlays kopieren (z. B. `http://127.0.0.1:47820/chatbox/`) und in OBS als Browserquelle hinzufügen, **Lokale Datei** nicht anhaken.

Die Begleit-Anwendung lauscht nur auf `127.0.0.1`. Ihre Konfiguration liegt außerhalb des Repos (Windows: `%APPDATA%\stream-overlays`, macOS: `~/Library/Application Support/stream-overlays`, Linux: `~/.config/stream-overlays`).

### Chatbox-Einstellungen
URL-Parameter (z. B. `?channel=andererkanal`) überschreiben die gespeicherten Einstellungen für eine einzelne Browserquelle.

| Einstellung | Standard | Beschreibung |
|---|---|---|
| `channel` | – | Anzuzeigender Twitch-Kanal (Pflicht) |
| `maxMessages` | `30` | Maximale Anzahl sichtbarer Nachrichten (1–200) |
| `showBadges` | `true` | Globale Badges anzeigen (Broadcaster, Moderator, VIP, Abonnent …) |
| `readableColors` | `true` | Dunkle Namensfarben genau so aufhellen wie der dunkle Twitch-Chat |
| `emoteProviders` | `["7tv", "bttv", "ffz"]` | Zu ladende Emote-Anbieter; Twitch-Emotes werden immer angezeigt |

Nutzer, die nie eine Namensfarbe gewählt haben, bekommen auf Twitch bei jedem Laden der Seite eine zufällige Standardfarbe. Die Chatbox gibt ihnen stattdessen eine feste Farbe aus derselben Palette, abhängig von ihrer Nutzer-ID.

### Entwicklung
Voraussetzung sind [Node.js](https://nodejs.org/) (LTS) für die Overlays und [Rust](https://www.rust-lang.org/) (stable) für die Begleit-Anwendung. Einzige Node-Abhängigkeit ist der TypeScript-Compiler.

```
npm install
npm run watch            # übersetzt src/ bei jeder Änderung nach web/scripts/
cd companion && cargo run  # liefert in Debug-Builds web/ aus dem Repo aus
```

Tests: `npm test` für die Overlays, `cargo test` in `companion/` für die Begleit-Anwendung.
Die Diagnoseseite (`/diagnostics/`) prüft die Emote-APIs und die anonyme Verbindung zum Twitch-Chat; mit `?channel=deinname` wird zusätzlich das Betreten eines Kanals getestet.

### Lizenz
[MIT](LICENSE)
