// Types
interface Check {
  readonly label: string;
  readonly run: () => Promise<string>;
}

// Constants
const requestTimeoutMs = 10_000;
const twitchChatUrl = "wss://irc-ws.chat.twitch.tv:443";

// Checks
const parameters = new URLSearchParams(location.search);
const channel = parameters.get("channel")?.trim().toLowerCase() ?? "";

const checks: readonly Check[] = [
  { label: "ES modules", run: async () => "loaded" },
  { label: "Location", run: async () => location.href },
  { label: "URL parameters", run: async () => describeParameters() },
  { label: "Local JSON file", run: async () => describeLocalJson() },
  { label: "7TV API", run: async () => countSevenTvGlobalEmotes() },
  { label: "BetterTTV API", run: async () => countBttvGlobalEmotes() },
  { label: "FrankerFaceZ API", run: async () => countFfzGlobalEmotes() },
  { label: "Twitch chat (anonymous)", run: () => connectToTwitchChat() },
];

function describeParameters(): string {
  const entries = [...parameters.entries()];
  if (entries.length === 0) {
    throw new Error("none received (try ?channel=yourname)");
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

async function describeLocalJson(): Promise<string> {
  const data = await fetchJson(new URL("probe.json", location.href).href);
  if (!isRecord(data) || data["ok"] !== true) {
    throw new Error("unexpected content");
  }
  return "readable";
}

async function countSevenTvGlobalEmotes(): Promise<string> {
  const data = await fetchJson("https://7tv.io/v3/emote-sets/global");
  return describeCount(isRecord(data) ? data["emotes"] : undefined);
}

async function countBttvGlobalEmotes(): Promise<string> {
  const data = await fetchJson("https://api.betterttv.net/3/cached/emotes/global");
  return describeCount(data);
}

async function countFfzGlobalEmotes(): Promise<string> {
  const data = await fetchJson("https://api.frankerfacez.com/v1/set/global");
  const sets = isRecord(data) && isRecord(data["sets"]) ? Object.values(data["sets"]) : [];
  const emotes = sets.flatMap((set) => (isRecord(set) && Array.isArray(set["emoticons"]) ? set["emoticons"] : []));
  return describeCount(emotes);
}

function connectToTwitchChat(): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(twitchChatUrl);
    const finish = (action: () => void): void => {
      clearTimeout(timeout);
      socket.close();
      action();
    };
    const timeout = setTimeout(() => finish(() => reject(new Error("timed out"))), requestTimeoutMs);

    socket.addEventListener("open", () => {
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      socket.send(`NICK justinfan${Math.floor(Math.random() * 90_000) + 10_000}`);
    });

    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") {
        return;
      }
      for (const line of event.data.split("\r\n")) {
        if (line.startsWith("PING")) {
          socket.send(line.replace("PING", "PONG"));
        } else if (line.includes(" 001 ")) {
          if (channel === "") {
            finish(() => resolve("connected"));
            return;
          }
          socket.send(`JOIN #${channel}`);
        } else if (line.includes(" ROOMSTATE ")) {
          const roomId = /(?:^@|;)room-id=(\d+)/.exec(line)?.[1];
          if (roomId !== undefined) {
            finish(() => resolve(`connected, joined #${channel} (room-id ${roomId})`));
            return;
          }
        }
      }
    });

    socket.addEventListener("error", () => finish(() => reject(new Error("connection failed"))));
  });
}

// Helpers
async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeCount(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("no emotes found");
  }
  return `${value.length} global emotes`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Rendering
function renderCheck(list: HTMLElement, check: Check): void {
  const item = document.createElement("li");
  const label = document.createElement("span");
  const result = document.createElement("span");
  label.className = "label";
  result.className = "result";
  label.textContent = check.label;
  result.textContent = "running…";
  item.className = "pending";
  item.append(label, result);
  list.append(item);

  check.run().then(
    (message) => {
      item.className = "ok";
      result.textContent = message;
    },
    (error: unknown) => {
      item.className = "failed";
      result.textContent = describeError(error);
    },
  );
}

const resultList = document.getElementById("results");
if (resultList !== null) {
  resultList.replaceChildren();
  for (const check of checks) {
    renderCheck(resultList, check);
  }
}
