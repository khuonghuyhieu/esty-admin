export const invitationSecret = /^[A-Za-z0-9_-]{43}$/;
const consentKeys = "client_id,code_challenge,code_challenge_method,redirect_uri,response_type,scope,state";

export function validConsentUrl(value: unknown, clientId: string, callbackUrl: string): value is string {
  if (typeof value !== "string" || value.length > 4096 || !value.startsWith("https://www.etsy.com/oauth/connect?")) return false;
  try {
    const url = new URL(value);
    return url.href === value && url.origin === "https://www.etsy.com" && url.pathname === "/oauth/connect" && !url.hash && !url.username && !url.password
      && [...url.searchParams.keys()].sort().join(",") === consentKeys
      && url.searchParams.get("client_id") === clientId && url.searchParams.get("redirect_uri") === callbackUrl
      && url.searchParams.get("scope") === "shops_r" && url.searchParams.get("response_type") === "code"
      && url.searchParams.get("code_challenge_method") === "S256"
      && invitationSecret.test(url.searchParams.get("state") ?? "") && invitationSecret.test(url.searchParams.get("code_challenge") ?? "");
  } catch { return false; }
}
