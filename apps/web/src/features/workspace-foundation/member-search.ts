import { sampleMembers } from "./fixtures.ts";

export function selectMembers(query: string) {
  const normalized = query.trim().toLowerCase();
  return normalized ? sampleMembers.filter(member => member.name.toLowerCase().includes(normalized)
    || member.email.toLowerCase().includes(normalized)) : sampleMembers;
}
