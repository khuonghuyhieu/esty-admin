import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionConfig, type ReturnPath } from "./config";
import { readAuthCookies } from "./cookies";
import { currentAppMe } from "./app-client";
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
    else {
      await currentAppMe(config, session.accessToken, AbortSignal.timeout(8000));
      phase = "ready";
    }
  } catch (error) {
    unauthenticated = error instanceof SessionFailure && error.status === 401;
    phase = error instanceof SessionFailure && error.status === 403 ? "forbidden" : "unavailable";
  }
  if (unauthenticated) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return { path: returnTo, generation, restore, phase };
}
