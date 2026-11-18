import "server-only";
import { handleInvitationStart } from "@/features/etsy-connection/recipient-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleInvitationStart(request);
}
export { POST as GET, POST as HEAD, POST as PUT, POST as PATCH, POST as DELETE, POST as OPTIONS };
