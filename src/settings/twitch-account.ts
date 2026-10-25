import { subscribeToCompanionEvent } from "../shared/companion-events.ts";
import { isRecord } from "../shared/json.ts";

// Types
type TwitchStatus =
  | { readonly state: "notConfigured" }
  | { readonly state: "loggedOut" }
  | { readonly state: "pending"; readonly userCode: string; readonly verificationUri: string; readonly expiresAt: number }
  | { readonly state: "loggedIn"; readonly login: string; readonly missingScopes: boolean }
  | { readonly state: "error"; readonly message: string };

// Parsing
function parseStatus(data: unknown): TwitchStatus | null {
  if (!isRecord(data)) {
    return null;
  }
  switch (data["state"]) {
    case "notConfigured":
    case "loggedOut":
      return { state: data["state"] };
    case "pending":
      return typeof data["userCode"] === "string" && typeof data["verificationUri"] === "string" && typeof data["expiresAt"] === "number"
        ? { state: "pending", userCode: data["userCode"], verificationUri: data["verificationUri"], expiresAt: data["expiresAt"] }
        : null;
    case "loggedIn":
      return typeof data["login"] === "string"
        ? { state: "loggedIn", login: data["login"], missingScopes: data["missingScopes"] === true }
        : null;
    case "error":
      return { state: "error", message: typeof data["message"] === "string" ? data["message"] : "Unknown error" };
    default:
      return null;
  }
}

// Requests
async function fetchStatus(): Promise<TwitchStatus | null> {
  const response = await fetch("/api/twitch", { cache: "no-store" });
  return parseStatus(await response.json());
}

async function sendCommand(command: "login" | "logout"): Promise<TwitchStatus | null> {
  const response = await fetch(`/api/twitch/${command}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return parseStatus(await response.json());
}

// View
export function setupTwitchAccount(container: HTMLElement): void {
  let countdown: ReturnType<typeof setInterval> | undefined;
  let busy = false;

  const render = (status: TwitchStatus | null): void => {
    clearInterval(countdown);
    if (status === null) {
      container.replaceChildren(paragraph("The companion app did not answer.", "status error"));
      return;
    }
    switch (status.state) {
      case "notConfigured":
        container.replaceChildren(
          paragraph("No Twitch app is configured for this build.", "status"),
          paragraph('Register an application at dev.twitch.tv (client type "Public") and add its Client ID as "twitchClientId" to config.json, then restart the companion app.', "hint"),
        );
        break;
      case "loggedOut":
        container.replaceChildren(
          paragraph("Log in to show all Twitch badges and, later, alerts. The login only grants read access.", "hint"),
          button("Log in with Twitch", () => run("login")),
        );
        break;
      case "error":
        container.replaceChildren(paragraph(status.message, "status error"), button("Log in with Twitch", () => run("login")));
        break;
      case "pending": {
        const code = document.createElement("p");
        code.className = "device-code";
        code.textContent = status.userCode;
        const open = document.createElement("a");
        open.className = "button";
        open.href = status.verificationUri;
        open.target = "_blank";
        open.rel = "noopener noreferrer";
        open.textContent = "Open Twitch to confirm";
        const remaining = paragraph("", "hint");
        const updateRemaining = (): void => {
          const seconds = Math.max(0, status.expiresAt - Math.floor(Date.now() / 1000));
          remaining.textContent = `Waiting for confirmation on Twitch. The code is valid for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} minutes.`;
        };
        updateRemaining();
        countdown = setInterval(updateRemaining, 1000);
        container.replaceChildren(
          paragraph("Confirm the login on Twitch. The code is already filled in there; check that it matches:", "hint"),
          code,
          actions(open, button("Cancel", () => run("logout"), "secondary")),
          remaining,
        );
        break;
      }
      case "loggedIn": {
        const elements: HTMLElement[] = [paragraph(`Logged in as ${status.login}.`, "status ok")];
        if (status.missingScopes) {
          elements.push(
            paragraph("New features need additional permissions. Please log in again.", "hint"),
            button("Log in again", () => run("login")),
          );
        }
        elements.push(button("Log out", () => run("logout"), "secondary"));
        container.replaceChildren(...elements);
        break;
      }
    }
  };

  const run = (command: "login" | "logout"): void => {
    if (busy) {
      return;
    }
    busy = true;
    sendCommand(command).then(
      (status) => {
        busy = false;
        render(status);
      },
      (error: unknown) => {
        busy = false;
        render({ state: "error", message: `Request failed: ${error instanceof Error ? error.message : String(error)}` });
      },
    );
  };

  subscribeToCompanionEvent("twitch", (data) => {
    const status = parseStatus(data);
    if (status !== null) {
      render(status);
    }
  });
  fetchStatus().then(render, () => render(null));
}

// Elements
function paragraph(text: string, className: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function button(label: string, onClick: () => void, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (className !== "") {
    element.className = className;
  }
  element.addEventListener("click", onClick);
  return element;
}

function actions(...children: HTMLElement[]): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "row";
  element.append(...children);
  return element;
}
