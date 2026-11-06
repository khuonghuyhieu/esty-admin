import "server-only";
import { handleSessionRequest } from "@/features/app-session/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleSessionRequest("me", request);
}

export { GET as POST, GET as HEAD, GET as PUT, GET as PATCH, GET as DELETE, GET as OPTIONS };
