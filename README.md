# StreamXtras

[English](#english) · [Deutsch](#deutsch)

## English

Lightweight, self-hosted extras for your stream in OBS – chat box, alerts and more – as a free alternative to hosted overlay services.
A small companion app runs in the system tray, serves the overlays and a settings page on your computer and connects them to Twitch. No account with a third-party service, no tracking, no external fonts or scripts.

> Work in progress. Not affiliated with or endorsed by Twitch, 7TV, BetterTTV or FrankerFaceZ. Twitch is a trademark of Twitch Interactive, Inc.

### Features
- **Chat box** – reads the chat anonymously (no login), shows emotes from Twitch, 7TV, BetterTTV and FrankerFaceZ, highlights announcements and removes messages deleted by moderators
- **Companion app** – tray icon, local settings page with live preview, overlay settings that apply live without reloading the OBS source
- **Twitch login** – device code login with automatic renewal, as the basis for the Twitch API
- **Planned** – all Twitch badges and streamer icons in shared chat via the Twitch API, alerts

### Usage
1. Start the companion app (see [Development](#development) until releases are available). On the first start the settings page opens in your browser; later you open it with a click on the tray icon.
2. Enter your Twitch channel in the settings.
3. Copy the URL of the overlay (e.g. `http://127.0.0.1:47820/chatbox/`) and add it to OBS as a browser source with **Local file** unchecked.

The companion app only listens on `127.0.0.1`. Its configuration lives outside the repository (Windows: `%APPDATA%\StreamXtras`, macOS: `~/Library/Application Support/StreamXtras`, Linux: `~/.config/streamxtras`).

### Twitch login
For all Twitch badges, streamer icons in shared chat and later alerts, the companion app connects to the Twitch API. Log in on the settings page: Twitch opens with a code already filled in, you confirm, done. The login only grants read access (bits, channel point redemptions, subscriptions, followers), is renewed automatically and stays valid as long as the app runs at least once every 30 days. The token is stored only in `twitch-token.json` in the configuration folder and never leaves the companion app.

Release builds will contain the Client ID of this project (once releases are published). To use your own Twitch application (or when building yourself), register one at [dev.twitch.tv](https://dev.twitch.tv/console) with client type **Public** and redirect URL `http://localhost`, and add its Client ID to `config.json`:

```json
{ "twitchClientId": "your-client-id" }
```

### Chat box settings
All settings are edited on the settings page with a live preview: channel, number of messages, hiding after a time, animation, position, font, size, colors, message background, spacing, emote size, badges, readable name colors, third-party emote providers and the browser source size. Saved changes apply to open chat boxes immediately; only a new channel or other emote providers reload them.

URL parameters override the stored settings for a single browser source, e.g. `?channel=othername&fontSize=24`. The parameter names are the keys in the `chatbox` section of `config.json`.

Users who never picked a name color get a random default color on Twitch that changes with every page load. The chat box instead assigns them a fixed color from the same palette, based on their user ID.

### Development
Requires [Node.js](https://nodejs.org/) (LTS) for the overlays and [Rust](https://www.rust-lang.org/) (stable) for the companion app. The only Node dependency is the TypeScript compiler.

```
npm install
npm run watch
```

`npm run watch` compiles `src/` to `web/scripts/` on every change. In a second terminal start the companion app, which serves `web/` from the repository in debug builds:

```
cd companion
cargo run
```

On Windows PowerShell with a restrictive execution policy, use `npm.cmd` instead of `npm`.

Tests: `npm test` for the overlays, `cargo test` in `companion/` for the companion app.
The diagnostics page (`/diagnostics/`) checks the emote APIs and the anonymous Twitch chat connection; add `?channel=yourname` to also test joining a channel.

### License
[MIT](LICENSE)

## Deutsch

Schlanke, selbst betriebene Extras für deinen Stream in OBS – Chatbox, Alerts und mehr – als kostenlose Alternative zu gehosteten Overlay-Diensten.
Eine kleine Begleit-Anwendung läuft im Infobereich (Tray), liefert die Overlays und eine Einstellungsseite auf deinem Rechner aus und verbindet sie mit Twitch. Kein Konto bei einem Drittanbieter, kein Tracking, keine externen Schriften oder Skripte.

> In Arbeit. Keine Verbindung zu Twitch, 7TV, BetterTTV oder FrankerFaceZ und nicht von ihnen unterstützt. Twitch ist eine Marke von Twitch Interactive, Inc.

### Funktionen
- **Chatbox** – liest den Chat anonym (ohne Login), zeigt Emotes von Twitch, 7TV, BetterTTV und FrankerFaceZ, hebt Ankündigungen hervor und entfernt von Moderatoren gelöschte Nachrichten
- **Begleit-Anwendung** – Tray-Icon, lokale Einstellungsseite mit Live-Vorschau, Overlay-Einstellungen wirken sofort, ohne die OBS-Quelle neu zu laden
- **Twitch-Login** – Anmeldung per Gerätecode mit automatischer Erneuerung, als Grundlage für die Twitch-API
- **Geplant** – alle Twitch-Badges und Streamer-Icons im geteilten Chat über die Twitch-API, Alerts

### Verwendung
1. Begleit-Anwendung starten (bis es Releases gibt, siehe [Entwicklung](#entwicklung)). Beim ersten Start öffnet sich die Einstellungsseite im Browser, danach per Klick auf das Tray-Icon.
2. In den Einstellungen den eigenen Twitch-Kanal eintragen.
3. Die URL des Overlays kopieren (z. B. `http://127.0.0.1:47820/chatbox/`) und in OBS als Browserquelle hinzufügen, **Lokale Datei** nicht anhaken.

Die Begleit-Anwendung lauscht nur auf `127.0.0.1`. Ihre Konfiguration liegt außerhalb des Repos (Windows: `%APPDATA%\StreamXtras`, macOS: `~/Library/Application Support/StreamXtras`, Linux: `~/.config/streamxtras`).

### Twitch-Login
Für alle Twitch-Badges, Streamer-Icons im geteilten Chat und später Alerts verbindet sich die Begleit-Anwendung mit der Twitch-API. Die Anmeldung erfolgt auf der Einstellungsseite: Twitch öffnet sich mit bereits eingetragenem Code, du bestätigst, fertig. Der Login gewährt nur Lesezugriff (Bits, Kanalpunkte-Einlösungen, Abos, Follower), wird automatisch erneuert und bleibt gültig, solange die Anwendung mindestens alle 30 Tage einmal läuft. Das Token liegt nur in `twitch-token.json` im Konfigurationsordner und verlässt die Begleit-Anwendung nie.

Release-Builds werden die Client-ID dieses Projekts enthalten (sobald es Releases gibt). Um eine eigene Twitch-Anwendung zu nutzen (oder beim Selbstbauen), unter [dev.twitch.tv](https://dev.twitch.tv/console) eine Anwendung mit Client-Typ **Öffentlich** und Weiterleitungs-URL `http://localhost` registrieren und ihre Client-ID in die `config.json` eintragen:

```json
{ "twitchClientId": "deine-client-id" }
```

### Chatbox-Einstellungen
Alle Einstellungen werden auf der Einstellungsseite mit Live-Vorschau bearbeitet: Kanal, Anzahl der Nachrichten, Ausblenden nach Zeit, Animation, Position, Schrift, Größe, Farben, Hintergrund der Nachrichten, Abstand, Emote-Größe, Badges, lesbare Namensfarben, Emote-Anbieter und die Größe der Browserquelle. Gespeicherte Änderungen wirken sofort in geöffneten Chatboxen; nur ein neuer Kanal oder andere Emote-Anbieter laden sie neu.

URL-Parameter überschreiben die gespeicherten Einstellungen für eine einzelne Browserquelle, z. B. `?channel=andererkanal&fontSize=24`. Die Parameternamen sind die Schlüssel im Abschnitt `chatbox` der `config.json`.

Nutzer, die nie eine Namensfarbe gewählt haben, bekommen auf Twitch bei jedem Laden der Seite eine zufällige Standardfarbe. Die Chatbox gibt ihnen stattdessen eine feste Farbe aus derselben Palette, abhängig von ihrer Nutzer-ID.

### Entwicklung
Voraussetzung sind [Node.js](https://nodejs.org/) (LTS) für die Overlays und [Rust](https://www.rust-lang.org/) (stable) für die Begleit-Anwendung. Einzige Node-Abhängigkeit ist der TypeScript-Compiler.

```
npm install
npm run watch
```

`npm run watch` übersetzt `src/` bei jeder Änderung nach `web/scripts/`. In einem zweiten Terminal die Begleit-Anwendung starten, die in Debug-Builds `web/` aus dem Repo ausliefert:

```
cd companion
cargo run
```

In Windows PowerShell mit restriktiver Ausführungsrichtlinie `npm.cmd` statt `npm` verwenden.

Tests: `npm test` für die Overlays, `cargo test` in `companion/` für die Begleit-Anwendung.
Die Diagnoseseite (`/diagnostics/`) prüft die Emote-APIs und die anonyme Verbindung zum Twitch-Chat; mit `?channel=deinname` wird zusätzlich das Betreten eines Kanals getestet.

### Lizenz
[MIT](LICENSE)
