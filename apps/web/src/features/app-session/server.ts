import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionConfig, type ReturnPath } from "./config";
import { readAuthCookies } from "./cookies";
import { SessionFailure } from "./errors";
import type { RouteAdmission } from "./session-controller";

export async function hasRestorableSession(): Promise<boolean> {
  try {
    const config = readSessionConfig();
    // Preserve raw duplicates: framework cookie maps collapse duplicate names.
    return !!readAuthCookies(config, (await headers()).get("cookie")).session;
  } catch { return false; }
}

export async function guardApplication(returnTo: ReturnPath): Promise<RouteAdmission> {
  let unauthenticated = false;
  let restore = false;
  let generation: string | null = null;
  let phase: RouteAdmission["phase"] = "unavailable";
  try {
    const config = readSessionConfig();
    const { session, context } = readAuthCookies(config, (await headers()).get("cookie"));
    generation = context?.generation ?? null;
    restore = !!session;
    if (!session) unauthenticated = true;
    // The registered route trees contain only public sample components. This envelope
    // check is a restoration hint, never current membership or private-data authority.
    // Actual private server reads/actions must authorize at their own data boundary.
    else phase = "ready";
  } catch (error) {
    unauthenticated = error instanceof SessionFailure && error.status === 401;
    phase = error instanceof SessionFailure && error.status === 403 ? "forbidden" : "unavailable";
  }
  if (unauthenticated) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return { path: returnTo, generation, restore, phase };
}
