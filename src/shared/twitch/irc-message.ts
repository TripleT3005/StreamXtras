// Types
export interface IrcMessage {
  readonly tags: ReadonlyMap<string, string>;
  readonly prefix: string | null;
  readonly command: string;
  readonly params: readonly string[];
}

// Parsing
export function parseIrcMessage(line: string): IrcMessage | null {
  let rest = line.replace(/[\r\n]+$/, "");
  let tags: ReadonlyMap<string, string> = new Map();
  let prefix: string | null = null;

  if (rest.startsWith("@")) {
    const [tagPart, remainder] = splitFirst(rest.slice(1));
    tags = parseTags(tagPart);
    rest = remainder;
  }

  if (rest.startsWith(":")) {
    const [prefixPart, remainder] = splitFirst(rest.slice(1));
    prefix = prefixPart;
    rest = remainder;
  }

  const [command, paramPart] = splitFirst(rest);
  if (command === "") {
    return null;
  }

  return { tags, prefix, command, params: parseParams(paramPart) };
}

export function getNick(prefix: string | null): string | null {
  if (prefix === null) {
    return null;
  }
  const end = prefix.indexOf("!");
  return end === -1 ? prefix : prefix.slice(0, end);
}

// Helpers
function splitFirst(value: string): [string, string] {
  const index = value.indexOf(" ");
  if (index === -1) {
    return [value, ""];
  }
  return [value.slice(0, index), value.slice(index + 1).trimStart()];
}

function parseTags(tagPart: string): ReadonlyMap<string, string> {
  const tags = new Map<string, string>();
  for (const tag of tagPart.split(";")) {
    if (tag === "") {
      continue;
    }
    const separator = tag.indexOf("=");
    const key = separator === -1 ? tag : tag.slice(0, separator);
    const value = separator === -1 ? "" : unescapeTagValue(tag.slice(separator + 1));
    tags.set(key, value);
  }
  return tags;
}

function parseParams(paramPart: string): string[] {
  const params: string[] = [];
  let rest = paramPart;
  while (rest !== "") {
    if (rest.startsWith(":")) {
      params.push(rest.slice(1));
      break;
    }
    const [param, remainder] = splitFirst(rest);
    params.push(param);
    rest = remainder;
  }
  return params;
}

const tagEscapes: Readonly<Record<string, string>> = { ":": ";", s: " ", "\\": "\\", r: "\r", n: "\n" };

function unescapeTagValue(value: string): string {
  return value.replace(/\\(.?)/g, (_match, character: string) => tagEscapes[character] ?? character);
}
