# StreamXtras

[English](#english) · [Deutsch](#deutsch)

## English

Lightweight, self-hosted extras for your stream in OBS – chat box, alerts and more – as a free alternative to hosted overlay services.
A small companion app runs in the system tray, serves the overlays and a settings page on your computer and connects them to Twitch. No account with a third-party service, no tracking, no external fonts or scripts.

> Early version: feedback and bug reports are welcome as issues. Not affiliated with or endorsed by Twitch, 7TV, BetterTTV or FrankerFaceZ. Twitch is a trademark of Twitch Interactive, Inc.

### Features
- **Chat box** – reads the chat anonymously (no login), shows emotes from Twitch, 7TV, BetterTTV and FrankerFaceZ, highlights announcements and removes messages deleted by moderators
- **Companion app** – tray icon, local settings page with live preview, overlay settings that apply live without reloading the OBS source
- **Twitch login** – device code login with automatic renewal; with it, the chat box shows all global and channel badges and, during a shared chat, the icon of the channel each message comes from
- **Alert box** – alerts for follows, subscriptions, gift subs, cheers and raids with image or video, text and sound; variants per amount or per Twitch user; simple images and sounds are included, your own files can be uploaded on the settings page
- **Planned** – text-to-speech

### Installation
1. Download the archive for your system from [Releases](../../releases): `windows-x64`, `macos-arm64` (Apple silicon) or `linux-x64`.
2. Extract it to a folder of your choice, e.g. `DocumentsStreamXtras`. Keep the `web` folder next to the program.
3. Start `streamxtras`. The app is not signed, so the system may warn on the first start:
   - **Windows:** SmartScreen → "More info" → "Run anyway"
   - **macOS:** right-click the program → "Open", or allow it under System Settings → Privacy & Security
   - **Linux:** the tray icon needs a desktop with StatusNotifierItem support (KDE Plasma, or GNOME with the AppIndicator extension)
4. To start it automatically, add a shortcut to your autostart (Windows: press Win+R, enter `shell:startup`).

Each archive has a `.sha256` file to verify the download.

### Usage
1. Start the companion app. On the first start the settings page opens in your browser; later you open it with a click on the tray icon.
2. Enter your Twitch channel in the settings.
3. Copy the URL of the overlay (e.g. `http://127.0.0.1:47820/chatbox/`) and add it to OBS as a browser source with **Local file** unchecked.

The companion app only listens on `127.0.0.1`. Its configuration lives outside the repository (Windows: `%APPDATA%\StreamXtras`, macOS: `~/Library/Application Support/StreamXtras`, Linux: `~/.config/streamxtras`).

### Twitch login
For all Twitch badges, streamer icons in shared chat and later alerts, the companion app connects to the Twitch API. Log in on the settings page: Twitch opens with a code already filled in, you confirm, done. The login only grants read access (bits, channel point redemptions, subscriptions, followers, chat notifications for subscription tiers and messages), is renewed automatically and stays valid as long as the app runs at least once every 30 days. The token is stored only in `twitch-token.json` in the configuration folder and never leaves the companion app.

Release builds contain the Client ID of this project. To use your own Twitch application (or when building yourself), register one at [dev.twitch.tv](https://dev.twitch.tv/console) with client type **Public** and redirect URL `http://localhost`, and add its Client ID to `config.json`:

```json
{ "twitchClientId": "your-client-id" }
```

### Chat box settings
All settings are edited on the settings page with a live preview: channel, number of messages, hiding after a time, animation, position, font, size, colors, message background, spacing, emote size, badges, third-party badges, readable name colors, third-party emote providers, shared chat (streamer icons, messages from partner channels) and the browser source size. Saved changes apply to open chat boxes immediately; only a new channel, other third-party badges or other emote providers reload them.

Third-party badges from 7TV, BetterTTV, FrankerFaceZ and Chatterino are off by default and can be turned on one by one. BetterTTV, FrankerFaceZ and Chatterino publish one list for all users; 7TV is asked once per chatter, so in very busy chats this causes many requests.

URL parameters override the stored settings for a single browser source, e.g. `?channel=othername&fontSize=24`. The parameter names are the keys in the `chatbox` section of `config.json`.

Users who never picked a name color get a random default color on Twitch that changes with every page load. The chat box instead assigns them a fixed color from the same palette, based on their user ID.

### Alert box
The alert box shows one alert at a time; further alerts wait in a queue. Alerts need the Twitch login and always belong to the logged-in channel. On the settings page, the list on the left switches between the general settings and the alert types; the checkbox next to a type turns it on or off. Every type has the same options: text (`{name}` is replaced with the name, `{amount}` with the number of months, gifted subs, bits or viewers), image or video, the profile picture of the user instead, sound and duration. Videos play to the end with their own sound.

Variants replace these options for single alerts, e.g. for exactly 67 bits, from 500 bits on or for a raid by a certain streamer. The first matching variant wins. In the test row below the preview you can enter a number and a Twitch name: "Show in preview" plays the alert in the preview, "Send to OBS" in every open alert box. To mix the sound in OBS, enable "Control audio via OBS" in the browser source.

To show only some alert types in a browser source, add them to the URL, e.g. `http://127.0.0.1:47820/alertbox/?types=follow,raid`. Available types: `follow`, `sub`, `gift`, `cheer`, `raid`.

Text-to-speech reads the alert text and/or the message of the viewer aloud. It is off by default and is turned on per alert type, with a minimum for gift subs and cheers and a choice of tiers for subscriptions. It uses the voices of the operating system, no AI model and no online service: on Windows the installed voices, on macOS `say`, on Linux `espeak-ng` (install it with your package manager). Voice, volume and maximum length are set under General. Cheer emotes like `Cheer100` are removed before reading. If you logged in before version 0.3, log in again once so that subscription tiers and messages arrive.

Uploaded files (MP3, OGG, WAV, PNG, GIF, WebP, JPEG, MP4, WebM, up to 50 MB) are stored in the `media` folder inside the configuration folder. The file type is detected from the content; SVG files are not accepted. The included sounds are generated by `tools/generate-sounds.js`.

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

Releases: a new version in `companion/Cargo.toml` and `package.json` (both must match) creates a release with archives for all three systems when merged into `main`. The release workflow needs the repository secret `TWITCH_CLIENT_ID`; `VT_API_KEY` (VirusTotal) is optional.

Tests: `npm test` for the overlays, `cargo test` in `companion/` for the companion app.
The diagnostics page (`/diagnostics/`) checks the emote APIs and the anonymous Twitch chat connection; add `?channel=yourname` to also test joining a channel.

### License
[MIT](LICENSE)

## Deutsch

Schlanke, selbst betriebene Extras für deinen Stream in OBS – Chatbox, Alerts und mehr – als kostenlose Alternative zu gehosteten Overlay-Diensten.
Eine kleine Begleit-Anwendung läuft im Infobereich (Tray), liefert die Overlays und eine Einstellungsseite auf deinem Rechner aus und verbindet sie mit Twitch. Kein Konto bei einem Drittanbieter, kein Tracking, keine externen Schriften oder Skripte.

> Frühe Version: Rückmeldungen und Fehlerberichte gern als Issue. Keine Verbindung zu Twitch, 7TV, BetterTTV oder FrankerFaceZ und nicht von ihnen unterstützt. Twitch ist eine Marke von Twitch Interactive, Inc.

### Funktionen
- **Chatbox** – liest den Chat anonym (ohne Login), zeigt Emotes von Twitch, 7TV, BetterTTV und FrankerFaceZ, hebt Ankündigungen hervor und entfernt von Moderatoren gelöschte Nachrichten
- **Begleit-Anwendung** – Tray-Icon, lokale Einstellungsseite mit Live-Vorschau, Overlay-Einstellungen wirken sofort, ohne die OBS-Quelle neu zu laden
- **Twitch-Login** – Anmeldung per Gerätecode mit automatischer Erneuerung; damit zeigt die Chatbox alle globalen und kanaleigenen Badges und im geteilten Chat das Icon des Kanals, aus dem eine Nachricht kommt
- **Alertbox** – Alerts für Follows, Abos, Geschenkabos, Cheers und Raids mit Bild oder Video, Text und Sound; Varianten je Anzahl oder je Twitch-Nutzer; schlichte Bilder und Sounds sind dabei, eigene Dateien lassen sich auf der Einstellungsseite hochladen
- **Geplant** – Sprachausgabe

### Installation
1. Das Archiv für dein System unter [Releases](../../releases) herunterladen: `windows-x64`, `macos-arm64` (Apple Silicon) oder `linux-x64`.
2. In einen beliebigen Ordner entpacken, z. B. `DokumenteStreamXtras`. Der Ordner `web` muss neben dem Programm bleiben.
3. `streamxtras` starten. Die Anwendung ist nicht signiert, deshalb warnt das System beim ersten Start eventuell:
   - **Windows:** SmartScreen → „Weitere Informationen“ → „Trotzdem ausführen“
   - **macOS:** Rechtsklick auf das Programm → „Öffnen“, oder unter Systemeinstellungen → Datenschutz & Sicherheit erlauben
   - **Linux:** Das Tray-Icon braucht einen Desktop mit StatusNotifierItem-Unterstützung (KDE Plasma oder GNOME mit AppIndicator-Erweiterung)
4. Für den automatischen Start eine Verknüpfung in den Autostart legen (Windows: Win+R, `shell:startup` eingeben).

Zu jedem Archiv gibt es eine `.sha256`-Datei, um den Download zu prüfen.

### Verwendung
1. Begleit-Anwendung starten. Beim ersten Start öffnet sich die Einstellungsseite im Browser, danach per Klick auf das Tray-Icon.
2. In den Einstellungen den eigenen Twitch-Kanal eintragen.
3. Die URL des Overlays kopieren (z. B. `http://127.0.0.1:47820/chatbox/`) und in OBS als Browserquelle hinzufügen, **Lokale Datei** nicht anhaken.

Die Begleit-Anwendung lauscht nur auf `127.0.0.1`. Ihre Konfiguration liegt außerhalb des Repos (Windows: `%APPDATA%\StreamXtras`, macOS: `~/Library/Application Support/StreamXtras`, Linux: `~/.config/streamxtras`).

### Twitch-Login
Für alle Twitch-Badges, Streamer-Icons im geteilten Chat und später Alerts verbindet sich die Begleit-Anwendung mit der Twitch-API. Die Anmeldung erfolgt auf der Einstellungsseite: Twitch öffnet sich mit bereits eingetragenem Code, du bestätigst, fertig. Der Login gewährt nur Lesezugriff (Bits, Kanalpunkte-Einlösungen, Abos, Follower, Chat-Benachrichtigungen für Abo-Stufen und Nachrichten), wird automatisch erneuert und bleibt gültig, solange die Anwendung mindestens alle 30 Tage einmal läuft. Das Token liegt nur in `twitch-token.json` im Konfigurationsordner und verlässt die Begleit-Anwendung nie.

Release-Builds enthalten die Client-ID dieses Projekts. Um eine eigene Twitch-Anwendung zu nutzen (oder beim Selbstbauen), unter [dev.twitch.tv](https://dev.twitch.tv/console) eine Anwendung mit Client-Typ **Öffentlich** und Weiterleitungs-URL `http://localhost` registrieren und ihre Client-ID in die `config.json` eintragen:

```json
{ "twitchClientId": "deine-client-id" }
```

### Chatbox-Einstellungen
Alle Einstellungen werden auf der Einstellungsseite mit Live-Vorschau bearbeitet: Kanal, Anzahl der Nachrichten, Ausblenden nach Zeit, Animation, Position, Schrift, Größe, Farben, Hintergrund der Nachrichten, Abstand, Emote-Größe, Badges, Drittanbieter-Badges, lesbare Namensfarben, Emote-Anbieter, geteilter Chat (Streamer-Icons, Nachrichten aus Partnerkanälen) und die Größe der Browserquelle. Gespeicherte Änderungen wirken sofort in geöffneten Chatboxen; nur ein neuer Kanal, andere Drittanbieter-Badges oder andere Emote-Anbieter laden sie neu.

Drittanbieter-Badges von 7TV, BetterTTV, FrankerFaceZ und Chatterino sind standardmäßig aus und lassen sich einzeln einschalten. BetterTTV, FrankerFaceZ und Chatterino veröffentlichen eine Liste für alle Nutzer; bei 7TV wird je Chatter einmal nachgefragt, in sehr vollen Chats sind das also viele Anfragen.

URL-Parameter überschreiben die gespeicherten Einstellungen für eine einzelne Browserquelle, z. B. `?channel=andererkanal&fontSize=24`. Die Parameternamen sind die Schlüssel im Abschnitt `chatbox` der `config.json`.

Nutzer, die nie eine Namensfarbe gewählt haben, bekommen auf Twitch bei jedem Laden der Seite eine zufällige Standardfarbe. Die Chatbox gibt ihnen stattdessen eine feste Farbe aus derselben Palette, abhängig von ihrer Nutzer-ID.

### Alertbox
Die Alertbox zeigt immer einen Alert an, weitere warten in einer Warteschlange. Alerts brauchen den Twitch-Login und gelten immer für den angemeldeten Kanal. Auf der Einstellungsseite wechselt die Liste links zwischen den allgemeinen Einstellungen und den Alert-Typen; die Checkbox neben einem Typ schaltet ihn ein oder aus. Jeder Typ hat dieselben Optionen: Text (`{name}` wird durch den Namen ersetzt, `{amount}` durch die Anzahl der Monate, Geschenkabos, Bits oder Zuschauer), Bild oder Video, stattdessen das Profilbild des Nutzers, Sound und Dauer. Videos laufen bis zum Ende, mit eigenem Ton.

Varianten ersetzen diese Optionen für einzelne Alerts, z. B. für genau 67 Bits, ab 500 Bits oder für den Raid eines bestimmten Streamers. Es gilt die erste passende Variante. In der Testzeile unter der Vorschau kannst du eine Anzahl und einen Twitch-Namen eintragen: „Show in preview“ spielt den Alert in der Vorschau ab, „Send to OBS“ in jeder geöffneten Alertbox. Wer den Sound in OBS mischen möchte, aktiviert in der Browserquelle „Audio über OBS steuern“.

Sollen in einer Browserquelle nur bestimmte Alert-Typen erscheinen, hängst du sie an die Adresse an, z. B. `http://127.0.0.1:47820/alertbox/?types=follow,raid`. Verfügbare Typen: `follow`, `sub`, `gift`, `cheer`, `raid`.

Die Sprachausgabe liest den Alert-Text und/oder die Nachricht des Zuschauers vor. Sie ist standardmäßig aus und wird je Alert-Typ eingeschaltet, mit einem Mindestwert für Geschenkabos und Cheers und einer Auswahl der Stufen bei Abos. Sie nutzt die Stimmen des Betriebssystems, kein KI-Modell und keinen Online-Dienst: unter Windows die installierten Stimmen, unter macOS `say`, unter Linux `espeak-ng` (über die Paketverwaltung installieren). Stimme, Lautstärke und maximale Länge stellst du unter General ein. Cheer-Emotes wie `Cheer100` werden vor dem Vorlesen entfernt. Wer sich vor Version 0.3 angemeldet hat, meldet sich einmal neu an, damit Abo-Stufen und Nachrichten ankommen.

Hochgeladene Dateien (MP3, OGG, WAV, PNG, GIF, WebP, JPEG, MP4, WebM, bis 50 MB) liegen im Ordner `media` im Konfigurationsordner. Der Dateityp wird am Inhalt erkannt; SVG-Dateien werden nicht angenommen. Die mitgelieferten Sounds erzeugt `tools/generate-sounds.js`.

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

Releases: Eine neue Version in `companion/Cargo.toml` und `package.json` (beide müssen übereinstimmen) erzeugt beim Merge in `main` ein Release mit Archiven für alle drei Systeme. Der Release-Workflow braucht das Repository-Secret `TWITCH_CLIENT_ID`; `VT_API_KEY` (VirusTotal) ist optional.

Tests: `npm test` für die Overlays, `cargo test` in `companion/` für die Begleit-Anwendung.
Die Diagnoseseite (`/diagnostics/`) prüft die Emote-APIs und die anonyme Verbindung zum Twitch-Chat; mit `?channel=deinname` wird zusätzlich das Betreten eines Kanals getestet.

### Lizenz
[MIT](LICENSE)
