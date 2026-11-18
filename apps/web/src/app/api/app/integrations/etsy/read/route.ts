import "server-only";
import { handleEtsyRequest } from "@/features/etsy-connection/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleEtsyRequest("sync", request);
}

export { POST as GET, POST as HEAD, POST as PUT, POST as PATCH, POST as DELETE, POST as OPTIONS };
