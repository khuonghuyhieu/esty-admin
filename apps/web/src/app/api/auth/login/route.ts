import "server-only";
import { handleSessionRequest } from "@/features/app-session/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleSessionRequest("login", request);
}

export { POST as GET, POST as HEAD, POST as PUT, POST as PATCH, POST as DELETE, POST as OPTIONS };
