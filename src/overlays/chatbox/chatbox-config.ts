import { readInteger, readString, type ConfigSource } from "../../shared/config.ts";

// Types
export interface ChatboxConfig {
  readonly channel: string;
  readonly maxMessages: number;
}

// Reading
export function readChatboxConfig(source: ConfigSource): ChatboxConfig {
  return {
    channel: readString(source, "channel", ""),
    maxMessages: readInteger(source, "maxMessages", 30, 1, 200),
  };
}
