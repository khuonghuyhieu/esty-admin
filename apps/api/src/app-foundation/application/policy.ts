export const capabilities = [
  'profile.read.self', 'profile.update.self', 'team.read', 'team.invite',
  'team.invite.manage', 'team.role.assign', 'team.membership.manage',
  'workspace.read', 'workspace.update', 'audit.read',
] as const;
export type Capability = typeof capabilities[number];
export type Role = 'owner' | 'member';
export type MembershipStatus = 'active' | 'disabled';

const memberCapabilities: readonly Capability[] = Object.freeze([
  'profile.read.self', 'profile.update.self', 'team.read', 'workspace.read',
]);
const ownerCapabilities: readonly Capability[] = Object.freeze(capabilities);
const noCapabilities: readonly Capability[] = Object.freeze([]);

export function capabilitiesFor(role: unknown, status: unknown): readonly Capability[] {
  if (status !== 'active') return noCapabilities;
  if (role === 'owner') return ownerCapabilities;
  if (role === 'member') return memberCapabilities;
  return noCapabilities;
}

export function permits(role: unknown, status: unknown, capability: Capability): boolean {
  return capabilitiesFor(role, status).includes(capability);
}
