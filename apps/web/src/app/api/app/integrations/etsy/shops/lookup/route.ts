import "server-only";
import { handleEtsyRequest } from "@/features/etsy-connection/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleEtsyRequest("lookup", request);
}

export { GET as POST, GET as HEAD, GET as PUT, GET as PATCH, GET as DELETE, GET as OPTIONS };
