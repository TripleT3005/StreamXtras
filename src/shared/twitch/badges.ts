import type { ChatBadge } from "../events.ts";

// Constants
const globalBadgeIds: Readonly<Record<string, string>> = {
  broadcaster: "5527c58c-fb7d-422d-b71b-f309dcb85cc1",
  moderator: "3267646d-33f0-4b17-b3df-f923a41db1d0",
  vip: "b817aba4-fad8-49e2-b88a-7cc744dfa6ec",
  partner: "d12a2e27-16f6-41d0-ab77-b780518f00a3",
  staff: "d97c37bd-a6f5-4c38-8f57-4e4bef88af34",
  admin: "9ef7e029-4cdf-4d4d-a0d5-e2b3fb2583fe",
  global_mod: "9384c43e-4ce7-4e94-b2a1-b93656896eba",
  subscriber: "5d9f2208-5dd8-11e7-8513-2ff4adfae661",
  founder: "511b78a9-ab37-472f-9569-457753bbe7d3",
  turbo: "bd444ec6-8f34-4bf9-91f4-af1e3428d80f",
  premium: "bbbe0db0-a598-423e-86d0-f9fb98ca1933",
  "artist-badge": "4300a897-03dc-4e83-8c0e-c332fee7057f",
};

// Lookup
export function getGlobalBadgeUrl(badge: ChatBadge): string | null {
  const id = Object.hasOwn(globalBadgeIds, badge.set) ? globalBadgeIds[badge.set] : undefined;
  return id === undefined ? null : `https://static-cdn.jtvnw.net/badges/v1/${id}/2`;
}
