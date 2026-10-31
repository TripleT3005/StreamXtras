import { subscribeToCompanionEvent } from "../shared/companion-events.ts";
import { t } from "../shared/i18n.ts";
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
      return { state: "error", message: typeof data["message"] === "string" ? data["message"] : t("twitch.unknown_error") };
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
export function setupTwitchAccount(container: HTMLElement, onLogin: (login: string | null) => void): void {
  let countdown: ReturnType<typeof setInterval> | undefined;
  let busy = false;

  const render = (status: TwitchStatus | null): void => {
    clearInterval(countdown);
    onLogin(status?.state === "loggedIn" ? status.login : null);
    if (status === null) {
      container.replaceChildren(paragraph(t("twitch.no_answer"), "status error"));
      return;
    }
    switch (status.state) {
      case "notConfigured":
        container.replaceChildren(paragraph(t("twitch.not_configured"), "hint"));
        break;
      case "loggedOut":
        container.replaceChildren(
          paragraph(t("twitch.logged_out"), "hint"),
          button(t("twitch.login"), () => run("login")),
        );
        break;
      case "error":
        container.replaceChildren(paragraph(status.message, "status error"), button(t("twitch.login"), () => run("login")));
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
        open.textContent = t("twitch.open");
        const remaining = paragraph("", "hint");
        const updateRemaining = (): void => {
          const seconds = Math.max(0, status.expiresAt - Math.floor(Date.now() / 1000));
          remaining.textContent = t("twitch.valid_for", { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` });
        };
        updateRemaining();
        countdown = setInterval(updateRemaining, 1000);
        container.replaceChildren(
          paragraph(t("twitch.confirm"), "hint"),
          code,
          open,
          button(t("twitch.cancel"), () => run("logout"), "secondary"),
          remaining,
        );
        break;
      }
      case "loggedIn": {
        const elements: HTMLElement[] = [paragraph(t("twitch.logged_in", { login: status.login }), "status ok")];
        if (status.missingScopes) {
          elements.push(paragraph(t("twitch.missing_scopes"), "hint"), button(t("twitch.login_again"), () => run("login")));
        }
        elements.push(button(t("twitch.logout"), () => run("logout"), "secondary"));
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
        render({ state: "error", message: t("twitch.request_failed", { error: error instanceof Error ? error.message : String(error) }) });
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
