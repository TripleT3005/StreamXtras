# <img src="web/favicon.svg" alt="" width="36" height="36"> StreamXtras

[English](#english) · [Deutsch](#deutsch)

## English

Lightweight, self-hosted extras for your stream in OBS – chat box, alerts and more – as a free alternative to hosted overlay services.
A small companion app runs in the system tray, serves the overlays and a settings page on your computer and connects them to Twitch. No account with a third-party service, no tracking, no external fonts or scripts.

> Feedback and bug reports are welcome as issues. Not affiliated with or endorsed by Twitch, 7TV, BetterTTV, FrankerFaceZ or Chatterino. Twitch is a trademark of Twitch Interactive, Inc.

### Features
- **Chat box** – reads the chat anonymously (no login), shows emotes from Twitch, 7TV, BetterTTV and FrankerFaceZ, highlights announcements, removes messages deleted by moderators and filters bots and words
- **Alert box** – alerts for follows, subscriptions, gift subs, cheers and raids with image or video, text and sound; variants per amount, tier or Twitch user; ten images and ten sounds are included, your own files can be uploaded
- **Goals** – follower goal and sub goal as a progress bar, set on the settings page or taken from your Twitch dashboard
- **Recent events** – the latest followers, subs, gift subs, cheers or raids, e.g. for a BRB scene
- **Top emotes** – the most used emotes in the chat over a chosen time
- **Text-to-speech** – reads alerts and viewer messages aloud with the voices of the operating system
- **Companion app** – tray icon, local settings page with live preview, settings that apply without reloading the OBS source

### Installation
**Windows:** download `StreamXtras-<version>-windows-x64-setup.exe` from [Releases](../../releases) and run it. It installs for the current user without administrator rights (to `%LOCALAPPDATA%\Programs\StreamXtras`); "Install for all users" installs to `C:\Program Files\StreamXtras` and asks for administrator rights. Options: Start menu entry (on), desktop shortcut (off), start with Windows (off). Instead of the installer you can use the portable archive `…-windows-x64-portable.zip`.

**macOS:** download `…-macos-arm64.dmg` (Apple silicon), open it and drag StreamXtras into the Applications folder. StreamXtras only appears in the menu bar, not in the Dock.

**Linux:** download `…-linux-x64.tar.gz` and extract it to a folder of your choice. Keep the `web` folder next to the program.

The app is not signed, so the system may warn on the first start:
- **Windows:** SmartScreen → "More info" → "Run anyway"
- **macOS:** the app is not notarized by Apple. On the first start macOS refuses to open it; then choose System Settings → Privacy & Security → "Open Anyway" (on older versions: right-click the app → "Open"). This is needed only once.
- **Linux:** start `streamxtras` (lowercase, as usual for commands there). The tray icon needs a desktop with StatusNotifierItem support (KDE Plasma, or GNOME with the AppIndicator extension); text-to-speech needs `espeak-ng`

With the portable archives, add a shortcut to your autostart to start StreamXtras with your system (Windows: press Win+R, enter `shell:startup`). Each download has a `.sha256` file to verify it.

#### Installer parameters
| Parameter | Effect |
|---|---|
| `/CURRENTUSER` | Install for the current user only (default) |
| `/ALLUSERS` | Install for all users (asks for administrator rights) |
| `/DIR="C:\Path"` | Installation folder |
| `/SILENT`, `/VERYSILENT` | Without wizard (with or without progress window) |
| `/SUPPRESSMSGBOXES` | No message boxes in silent mode |
| `/TASKS="desktopicon,autostart"` | Selected options; `desktopicon` adds a desktop shortcut, `autostart` starts StreamXtras with Windows for the installing user. Without the parameter, both are off |
| `/NOICONS` | No Start menu entry |
| `/LOG="C:\Path\setup.log"` | Write a log file |

Example: `StreamXtras-1.1.0-windows-x64-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /TASKS="autostart"`

Settings and overlays are stored per user and are not set by the installer. Uninstalling removes the program, its shortcuts and the autostart entry but keeps the settings, the Twitch login and your uploaded files in `%APPDATA%\StreamXtras`.

### Usage
1. Start the companion app. On the first start the settings page opens in your browser; later you open it with a click on the tray icon.
2. Log in with Twitch on the settings page (needed for alerts, goals, recent events and all badges) and check your channel in the chat box tab.
3. Copy the URL of an overlay from its tab (e.g. `http://127.0.0.1:47820/chatbox/`) and add it to OBS as a browser source with **Local file** unchecked. Use the same width and height as on the settings page.

#### Twitch login
Twitch opens with a code already filled in, you confirm, done. The login only grants read access (bits, channel point redemptions, subscriptions, followers, chat notifications for subscription tiers and messages, creator goals), is renewed automatically and stays valid as long as the app runs at least once every 30 days. If the settings page asks you to log in again after an update, a new feature needs another permission.

Release builds contain the Client ID of this project. To use your own Twitch application (or when building yourself), register one at [dev.twitch.tv](https://dev.twitch.tv/console) with client type **Public** and redirect URL `http://localhost`, and add its Client ID to `config.json`:

```json
{ "twitchClientId": "your-client-id" }
```

#### Chat box
All settings are edited on the settings page with a live preview: channel, number of messages, hiding after a time, animation, position, font, size, colors, message background, spacing, emote size, badges, third-party badges, readable name colors, third-party emote providers, filters, shared chat (streamer icons, messages from partner channels) and the browser source size. Saved changes apply to open chat boxes immediately; only a new channel, other third-party badges or other emote providers reload them.

Filters hide messages from chosen bots (Nightbot, StreamElements, Streamlabs, Moobot, Fossabot, WizeBot, Sery_Bot, SoundAlerts, KofiStreamBot, StreamStickers), from the streamer, from further accounts you enter (e.g. your Streamer.bot account) and messages with blocked words. A `*` at the end of a word also matches longer words.

Third-party badges from 7TV, BetterTTV, FrankerFaceZ and Chatterino are off by default and can be turned on one by one.

URL parameters override the stored settings for a single browser source, e.g. `?channel=othername&fontSize=24`. The parameter names are the keys in the `chatbox` section of `config.json`. Users who never picked a name color get a fixed color from Twitch's palette, based on their user ID, instead of a random one.

#### Alert box
The alert box shows one alert at a time; further alerts wait in a queue. Alerts always belong to the logged-in channel. The list on the left switches between the general settings and the alert types; the checkbox next to a type turns it on or off. Every type has the same options: text with placeholders (`{name}`, `{amount}` for months, gifted subs, bits or viewers, `{tier}`, `{message}`), image or video, the profile picture of the user instead, sound, duration and text-to-speech. Videos play to the end with their own sound.

Variants replace these options for single alerts, e.g. for exactly 67 bits, from 500 bits on, for a subscription tier or for a raid by a certain streamer. The first matching variant wins. In the test row below the preview you can enter a number, a tier, a Twitch name and a message: "Show in preview" plays the alert in the preview, "Send to OBS" in every open alert box. To mix the sound in OBS, enable "Control audio via OBS" in the browser source.

The "Live" row controls all open alert boxes: replay the last real alert, skip the alert shown right now (e.g. during a raid) or pause alerts, e.g. while recording. While paused, new alerts wait in the queue and a banner on every tab of the settings page shows it. The pause ends when the companion app restarts.

To show only some alert types in a browser source, add them to the URL, e.g. `http://127.0.0.1:47820/alertbox/?types=follow,raid`. Available types: `follow`, `sub`, `gift`, `cheer`, `raid`.

Text-to-speech is off by default and is turned on per alert type, with a minimum for gift subs and cheers and a choice of tiers for subscriptions. Voice, volume and maximum length are set under General. Cheer emotes like `Cheer100` are removed before reading.

Uploaded files (MP3, OGG, WAV, PNG, GIF, WebP, JPEG, MP4, WebM, up to 50 MB) are stored in the `media` folder inside the configuration folder. The file type is detected from the content; SVG files are not accepted.

#### Goals, recent events and top emotes
- Goals: `http://127.0.0.1:47820/goal/?goal=followers` or `?goal=subs`. Each goal uses either the target set on the settings page or the active goal from your Twitch creator dashboard, which moderators can set as well and which updates live.
- Recent events: `http://127.0.0.1:47820/recent/?type=follow` (also `sub`, `gift`, `cheer`, `raid`). Test alerts are not listed.
- Top emotes: `http://127.0.0.1:47820/topemotes/` counts every emote once per message, starting when the browser source is loaded.

#### Updates
When the settings page is opened, the companion app checks at most once a day whether a newer release exists and then shows a link to it next to the version. Nothing is downloaded or installed automatically.

### How it works
The companion app is a small Rust program with a tray icon and a web server that only listens on `127.0.0.1` (port 47820). It serves the overlays and the settings page from its `web` folder; OBS shows the overlays as browser sources. Settings are sent to open overlays as they change, so OBS never has to reload them.

The chat box and the top emotes connect to the Twitch chat themselves, anonymously and read-only. With the Twitch login, the companion app receives follows, subscriptions, gift subs, cheers, raids and goal changes through Twitch EventSub and passes them to the overlays. Text-to-speech uses the speech engine of the operating system (Windows voices, `say` on macOS, `espeak-ng` on Linux).

All data stays in the configuration folder of your user account (Windows: `%APPDATA%\StreamXtras`, macOS: `~/Library/Application Support/StreamXtras`, Linux: `~/.config/streamxtras`):

| File | Content |
|---|---|
| `config.json` | Settings of all overlays and the port |
| `twitch-token.json` | Twitch login (access and refresh token) |
| `history.json` | The latest 20 events per type for the recent events |
| `update-check.json` | Time and result of the last update check |
| `media/` | Your uploaded images, videos and sounds |

### Privacy
StreamXtras has no telemetry and no server of its own. The settings page and the overlays only talk to the companion app on your computer. These network accesses exist:

| Access | When | Sent | Received |
|---|---|---|---|
| Twitch chat (`irc-ws.chat.twitch.tv`) | Chat box, top emotes, diagnostics | The channel name, anonymously | Chat messages of the channel |
| 7TV, BetterTTV, FrankerFaceZ APIs | Chat box and top emotes, per provider switchable | The Twitch ID of the channel | Emote lists |
| Emote and badge images (Twitch, 7TV, BetterTTV, FrankerFaceZ, Chatterino) | Whenever an image is shown | The image address, without referrer | The image |
| Third-party badge lists (BetterTTV, FrankerFaceZ, Chatterino, 7TV) | Only when turned on, off by default | 7TV: the Twitch ID of each chatter | Badge lists |
| Twitch login and API (`id.twitch.tv`, `api.twitch.tv`, `eventsub.wss.twitch.tv`) | Only when logged in | Your login token, your channel ID and the IDs of the users shown | Badges, profile pictures, cheermotes, follower and subscriber counts, goals and live events |
| GitHub releases (`api.github.com`) | At most once a day when the settings page is opened | A request without personal data | The latest version number and its link |

The Twitch token never leaves the companion app except to Twitch itself. Without the Twitch login, only the anonymous chat, the emote providers and the update check remain.

### Build
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

Tests: `npm test` for the overlays, `cargo test` in `companion/` for the companion app. The diagnostics page (`/diagnostics/`) checks the emote APIs and the anonymous Twitch chat connection. The included sounds are generated by `tools/generate-sounds.js`, the included images are plain SVG files in `web/assets/images`.

Releases: a new version in `companion/Cargo.toml`, `package.json` and `package-lock.json` (CI checks that all of them and the newest changelog section match) together with a section for it in [CHANGELOG.md](CHANGELOG.md) creates a release when merged into `main`; the changelog section becomes the release notes. Versions `0.x` and versions with a suffix such as `1.1.0-beta.1` are published as pre-releases. The release workflow needs the repository secret `TWITCH_CLIENT_ID`; `VT_API_KEY` (VirusTotal) is optional.

### License
[MIT](LICENSE)

## Deutsch

Schlanke, selbst betriebene Extras für deinen Stream in OBS – Chatbox, Alerts und mehr – als kostenlose Alternative zu gehosteten Overlay-Diensten.
Eine kleine Begleit-Anwendung läuft im Infobereich (Tray), liefert die Overlays und eine Einstellungsseite auf deinem Rechner aus und verbindet sie mit Twitch. Kein Konto bei einem Drittanbieter, kein Tracking, keine externen Schriften oder Skripte.

> Rückmeldungen und Fehlerberichte gern als Issue. Keine Verbindung zu Twitch, 7TV, BetterTTV, FrankerFaceZ oder Chatterino und nicht von ihnen unterstützt. Twitch ist eine Marke von Twitch Interactive, Inc.

### Funktionen
- **Chatbox** – liest den Chat anonym (ohne Login), zeigt Emotes von Twitch, 7TV, BetterTTV und FrankerFaceZ, hebt Ankündigungen hervor, entfernt von Moderatoren gelöschte Nachrichten und filtert Bots und Wörter
- **Alertbox** – Alerts für Follows, Abos, Geschenkabos, Cheers und Raids mit Bild oder Video, Text und Sound; Varianten je Anzahl, Stufe oder Twitch-Nutzer; zehn Bilder und zehn Sounds sind dabei, eigene Dateien lassen sich hochladen
- **Ziele** – Follower- und Sub-Goal als Fortschrittsbalken, auf der Einstellungsseite festgelegt oder aus deinem Twitch-Dashboard übernommen
- **Letzte Ereignisse** – die letzten Follower, Abos, Geschenkabos, Cheers oder Raids, z. B. für eine BRB-Szene
- **Top-Emotes** – die meistgenutzten Emotes im Chat über einen gewählten Zeitraum
- **Sprachausgabe** – liest Alerts und Zuschauer-Nachrichten mit den Stimmen des Betriebssystems vor
- **Begleit-Anwendung** – Tray-Icon, lokale Einstellungsseite mit Live-Vorschau, Einstellungen wirken ohne Neuladen der OBS-Quelle

### Installation
**Windows:** `StreamXtras-<Version>-windows-x64-setup.exe` unter [Releases](../../releases) herunterladen und ausführen. Es installiert für den aktuellen Benutzer ohne Administratorrechte (nach `%LOCALAPPDATA%\Programs\StreamXtras`); „Für alle Benutzer installieren“ installiert nach `C:\Program Files\StreamXtras` und fragt nach Administratorrechten. Optionen: Startmenü-Eintrag (an), Desktop-Verknüpfung (aus), mit Windows starten (aus). Statt des Installers geht auch das portable Archiv `…-windows-x64-portable.zip`.

**macOS:** `…-macos-arm64.dmg` (Apple Silicon) herunterladen, öffnen und StreamXtras in den Ordner Programme ziehen. StreamXtras erscheint nur in der Menüleiste, nicht im Dock.

**Linux:** `…-linux-x64.tar.gz` herunterladen und in einen beliebigen Ordner entpacken. Der Ordner `web` muss neben dem Programm bleiben.

Die Anwendung ist nicht signiert, deshalb warnt das System beim ersten Start eventuell:
- **Windows:** SmartScreen → „Weitere Informationen“ → „Trotzdem ausführen“
- **macOS:** Die App ist nicht von Apple beglaubigt. Beim ersten Start verweigert macOS das Öffnen; dann unter Systemeinstellungen → Datenschutz & Sicherheit „Dennoch öffnen“ wählen (bei älteren Versionen: Rechtsklick auf die App → „Öffnen“). Das ist nur einmal nötig.
- **Linux:** `streamxtras` starten (kleingeschrieben, wie dort für Befehle üblich). Das Tray-Icon braucht einen Desktop mit StatusNotifierItem-Unterstützung (KDE Plasma oder GNOME mit AppIndicator-Erweiterung); die Sprachausgabe braucht `espeak-ng`

Bei den portablen Archiven für den automatischen Start eine Verknüpfung in den Autostart legen (Windows: Win+R, `shell:startup` eingeben). Zu jedem Download gibt es eine `.sha256`-Datei, um ihn zu prüfen.

#### Installer-Parameter
| Parameter | Wirkung |
|---|---|
| `/CURRENTUSER` | Nur für den aktuellen Benutzer installieren (Standard) |
| `/ALLUSERS` | Für alle Benutzer installieren (fragt nach Administratorrechten) |
| `/DIR="C:\Pfad"` | Installationsordner |
| `/SILENT`, `/VERYSILENT` | Ohne Assistent (mit oder ohne Fortschrittsfenster) |
| `/SUPPRESSMSGBOXES` | Keine Meldungsfenster bei stiller Installation |
| `/TASKS="desktopicon,autostart"` | Gewählte Optionen; `desktopicon` legt eine Desktop-Verknüpfung an, `autostart` startet StreamXtras für den installierenden Benutzer mit Windows. Ohne den Parameter sind beide aus |
| `/NOICONS` | Kein Startmenü-Eintrag |
| `/LOG="C:\Pfad\setup.log"` | Protokolldatei schreiben |

Beispiel: `StreamXtras-1.1.0-windows-x64-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /TASKS="autostart"`

Einstellungen und Overlays gelten pro Benutzer und werden vom Installer nicht gesetzt. Die Deinstallation entfernt Programm, Verknüpfungen und Autostart-Eintrag, lässt Einstellungen, Twitch-Login und hochgeladene Dateien in `%APPDATA%\StreamXtras` aber stehen.

### Bedienung
1. Begleit-Anwendung starten. Beim ersten Start öffnet sich die Einstellungsseite im Browser, danach per Klick auf das Tray-Icon.
2. Auf der Einstellungsseite mit Twitch anmelden (nötig für Alerts, Ziele, letzte Ereignisse und alle Badges) und im Chatbox-Tab den Kanal prüfen.
3. Die URL eines Overlays aus seinem Tab kopieren (z. B. `http://127.0.0.1:47820/chatbox/`) und in OBS als Browserquelle hinzufügen, **Lokale Datei** nicht anhaken. Breite und Höhe wie auf der Einstellungsseite wählen.

#### Twitch-Login
Twitch öffnet sich mit bereits eingetragenem Code, du bestätigst, fertig. Der Login gewährt nur Lesezugriff (Bits, Kanalpunkte-Einlösungen, Abos, Follower, Chat-Benachrichtigungen für Abo-Stufen und Nachrichten, Creator-Ziele), wird automatisch erneuert und bleibt gültig, solange die Anwendung mindestens alle 30 Tage einmal läuft. Bittet die Einstellungsseite nach einem Update um eine neue Anmeldung, braucht eine neue Funktion eine weitere Berechtigung.

Release-Builds enthalten die Client-ID dieses Projekts. Um eine eigene Twitch-Anwendung zu nutzen (oder beim Selbstbauen), unter [dev.twitch.tv](https://dev.twitch.tv/console) eine Anwendung mit Client-Typ **Öffentlich** und Weiterleitungs-URL `http://localhost` registrieren und ihre Client-ID in die `config.json` eintragen:

```json
{ "twitchClientId": "deine-client-id" }
```

#### Chatbox
Alle Einstellungen werden auf der Einstellungsseite mit Live-Vorschau bearbeitet: Kanal, Anzahl der Nachrichten, Ausblenden nach Zeit, Animation, Position, Schrift, Größe, Farben, Hintergrund der Nachrichten, Abstand, Emote-Größe, Badges, Drittanbieter-Badges, lesbare Namensfarben, Emote-Anbieter, Filter, geteilter Chat (Streamer-Icons, Nachrichten aus Partnerkanälen) und die Größe der Browserquelle. Gespeicherte Änderungen wirken sofort in geöffneten Chatboxen; nur ein neuer Kanal, andere Drittanbieter-Badges oder andere Emote-Anbieter laden sie neu.

Filter blenden Nachrichten von gewählten Bots (Nightbot, StreamElements, Streamlabs, Moobot, Fossabot, WizeBot, Sery_Bot, SoundAlerts, KofiStreamBot, StreamStickers), vom Streamer, von weiteren eingetragenen Konten (z. B. dem Konto deines Streamer.bot) und Nachrichten mit gesperrten Wörtern aus. Ein `*` am Wortende trifft auch längere Wörter.

Drittanbieter-Badges von 7TV, BetterTTV, FrankerFaceZ und Chatterino sind standardmäßig aus und lassen sich einzeln einschalten.

URL-Parameter überschreiben die gespeicherten Einstellungen für eine einzelne Browserquelle, z. B. `?channel=andererkanal&fontSize=24`. Die Parameternamen sind die Schlüssel im Abschnitt `chatbox` der `config.json`. Nutzer, die nie eine Namensfarbe gewählt haben, bekommen statt einer zufälligen eine feste Farbe aus Twitchs Palette, abhängig von ihrer Nutzer-ID.

#### Alertbox
Die Alertbox zeigt immer einen Alert an, weitere warten in einer Warteschlange. Alerts gelten immer für den angemeldeten Kanal. Die Liste links wechselt zwischen den allgemeinen Einstellungen und den Alert-Typen; die Checkbox neben einem Typ schaltet ihn ein oder aus. Jeder Typ hat dieselben Optionen: Text mit Platzhaltern (`{name}`, `{amount}` für Monate, Geschenkabos, Bits oder Zuschauer, `{tier}`, `{message}`), Bild oder Video, stattdessen das Profilbild des Nutzers, Sound, Dauer und Sprachausgabe. Videos laufen bis zum Ende, mit eigenem Ton.

Varianten ersetzen diese Optionen für einzelne Alerts, z. B. für genau 67 Bits, ab 500 Bits, für eine Abo-Stufe oder für den Raid eines bestimmten Streamers. Es gilt die erste passende Variante. In der Testzeile unter der Vorschau trägst du Anzahl, Stufe, Twitch-Namen und Nachricht ein: „Show in preview“ spielt den Alert in der Vorschau ab, „Send to OBS“ in jeder geöffneten Alertbox. Wer den Sound in OBS mischen möchte, aktiviert in der Browserquelle „Audio über OBS steuern“.

Die Zeile „Live“ steuert alle geöffneten Alertboxen: den letzten echten Alert wiederholen, den gerade gezeigten Alert überspringen (z. B. bei einem Raid) oder Alerts pausieren, z. B. für Aufnahmen. Während der Pause warten neue Alerts in der Warteschlange, und ein Banner auf jedem Tab der Einstellungsseite zeigt das an. Ein Neustart der Begleit-Anwendung beendet die Pause.

Sollen in einer Browserquelle nur bestimmte Alert-Typen erscheinen, hängst du sie an die Adresse an, z. B. `http://127.0.0.1:47820/alertbox/?types=follow,raid`. Verfügbare Typen: `follow`, `sub`, `gift`, `cheer`, `raid`.

Die Sprachausgabe ist standardmäßig aus und wird je Alert-Typ eingeschaltet, mit einem Mindestwert für Geschenkabos und Cheers und einer Auswahl der Stufen bei Abos. Stimme, Lautstärke und maximale Länge stellst du unter General ein. Cheer-Emotes wie `Cheer100` werden vor dem Vorlesen entfernt.

Hochgeladene Dateien (MP3, OGG, WAV, PNG, GIF, WebP, JPEG, MP4, WebM, bis 50 MB) liegen im Ordner `media` im Konfigurationsordner. Der Dateityp wird am Inhalt erkannt; SVG-Dateien werden nicht angenommen.

#### Ziele, letzte Ereignisse und Top-Emotes
- Ziele: `http://127.0.0.1:47820/goal/?goal=followers` oder `?goal=subs`. Jedes Ziel nutzt entweder das auf der Einstellungsseite eingetragene Ziel oder das aktive Ziel aus deinem Twitch-Dashboard, das auch Moderatoren setzen können und das sich live aktualisiert.
- Letzte Ereignisse: `http://127.0.0.1:47820/recent/?type=follow` (auch `sub`, `gift`, `cheer`, `raid`). Test-Alerts werden nicht aufgenommen.
- Top-Emotes: `http://127.0.0.1:47820/topemotes/` zählt jedes Emote einmal pro Nachricht, ab dem Laden der Browserquelle.

#### Updates
Beim Öffnen der Einstellungsseite prüft die Begleit-Anwendung höchstens einmal am Tag, ob es ein neueres Release gibt, und zeigt dann neben der Version einen Link dorthin. Es wird nichts automatisch heruntergeladen oder installiert.

### Funktionsweise
Die Begleit-Anwendung ist ein kleines Rust-Programm mit Tray-Icon und einem Webserver, der nur auf `127.0.0.1` lauscht (Port 47820). Er liefert die Overlays und die Einstellungsseite aus seinem Ordner `web` aus; OBS zeigt die Overlays als Browserquellen. Einstellungen gehen beim Ändern direkt an geöffnete Overlays, OBS muss sie also nie neu laden.

Chatbox und Top-Emotes verbinden sich selbst mit dem Twitch-Chat, anonym und nur lesend. Mit dem Twitch-Login empfängt die Begleit-Anwendung Follows, Abos, Geschenkabos, Cheers, Raids und Zieländerungen über Twitch EventSub und gibt sie an die Overlays weiter. Die Sprachausgabe nutzt die Sprachausgabe des Betriebssystems (Windows-Stimmen, `say` unter macOS, `espeak-ng` unter Linux).

Alle Daten bleiben im Konfigurationsordner deines Benutzerkontos (Windows: `%APPDATA%\StreamXtras`, macOS: `~/Library/Application Support/StreamXtras`, Linux: `~/.config/streamxtras`):

| Datei | Inhalt |
|---|---|
| `config.json` | Einstellungen aller Overlays und der Port |
| `twitch-token.json` | Twitch-Login (Zugriffs- und Erneuerungstoken) |
| `history.json` | Die letzten 20 Ereignisse je Typ für die letzten Ereignisse |
| `update-check.json` | Zeitpunkt und Ergebnis der letzten Update-Prüfung |
| `media/` | Deine hochgeladenen Bilder, Videos und Sounds |

### Datenschutz
StreamXtras hat keine Telemetrie und keinen eigenen Server. Einstellungsseite und Overlays sprechen nur mit der Begleit-Anwendung auf deinem Rechner. Diese Netzwerkzugriffe gibt es:

| Zugriff | Wann | Gesendet | Abgerufen |
|---|---|---|---|
| Twitch-Chat (`irc-ws.chat.twitch.tv`) | Chatbox, Top-Emotes, Diagnose | Der Kanalname, anonym | Chatnachrichten des Kanals |
| APIs von 7TV, BetterTTV, FrankerFaceZ | Chatbox und Top-Emotes, je Anbieter abschaltbar | Die Twitch-ID des Kanals | Emote-Listen |
| Emote- und Badge-Bilder (Twitch, 7TV, BetterTTV, FrankerFaceZ, Chatterino) | Sobald ein Bild angezeigt wird | Die Bildadresse, ohne Referrer | Das Bild |
| Listen der Drittanbieter-Badges (BetterTTV, FrankerFaceZ, Chatterino, 7TV) | Nur wenn eingeschaltet, standardmäßig aus | 7TV: die Twitch-ID jedes Chatters | Badge-Listen |
| Twitch-Login und -API (`id.twitch.tv`, `api.twitch.tv`, `eventsub.wss.twitch.tv`) | Nur mit Anmeldung | Dein Login-Token, deine Kanal-ID und die IDs der angezeigten Nutzer | Badges, Profilbilder, Cheermotes, Follower- und Abo-Zahlen, Ziele und Live-Ereignisse |
| GitHub-Releases (`api.github.com`) | Höchstens einmal am Tag beim Öffnen der Einstellungsseite | Eine Anfrage ohne persönliche Daten | Die neueste Versionsnummer und ihr Link |

Das Twitch-Token verlässt die Begleit-Anwendung nur in Richtung Twitch. Ohne Twitch-Login bleiben nur der anonyme Chat, die Emote-Anbieter und die Update-Prüfung.

### Bauen
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

Tests: `npm test` für die Overlays, `cargo test` in `companion/` für die Begleit-Anwendung. Die Diagnoseseite (`/diagnostics/`) prüft die Emote-APIs und die anonyme Verbindung zum Twitch-Chat. Die mitgelieferten Sounds erzeugt `tools/generate-sounds.js`, die mitgelieferten Bilder sind einfache SVG-Dateien in `web/assets/images`.

Releases: Eine neue Version in `companion/Cargo.toml`, `package.json` und `package-lock.json` (die CI prüft, dass alle und der neueste Changelog-Abschnitt übereinstimmen) zusammen mit einem Abschnitt dafür in der [CHANGELOG.md](CHANGELOG.md) erzeugt beim Merge in `main` ein Release; der Changelog-Abschnitt wird zu den Release-Notizen. Versionen `0.x` und Versionen mit Zusatz wie `1.1.0-beta.1` erscheinen als Vorabversion. Der Release-Workflow braucht das Repository-Secret `TWITCH_CLIENT_ID`; `VT_API_KEY` (VirusTotal) ist optional.

### Lizenz
[MIT](LICENSE)
