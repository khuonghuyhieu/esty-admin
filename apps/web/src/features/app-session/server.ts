import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionConfig, type ReturnPath } from "./config";
import { readAuthCookies } from "./cookies";
import { currentAppMe } from "./app-client";
import { SessionFailure } from "./errors";

export async function hasRestorableSession(): Promise<boolean> {
  try {
    const config = readSessionConfig();
    // Preserve raw duplicates: framework cookie maps collapse duplicate names.
    return !!readAuthCookies(config, (await headers()).get("cookie")).session;
  } catch { return false; }
}

export async function guardApplication(returnTo: ReturnPath): Promise<{ restore: boolean }> {
  let unauthenticated = false;
  let restore = false;
  try {
    const config = readSessionConfig();
    const { session } = readAuthCookies(config, (await headers()).get("cookie"));
    restore = !!session;
    if (!session) unauthenticated = true;
    else await currentAppMe(config, session.accessToken, AbortSignal.timeout(8000));
  } catch (error) {
    unauthenticated = error instanceof SessionFailure && error.status === 401;
    // Forbidden/unavailable are rendered by the session gate, never as admitted content.
  }
  if (unauthenticated) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return { restore };
}
