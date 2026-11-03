export function validateLoopbackOrigin(value: string): string {
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value)) {
    throw new Error("Local API origin must be an explicit-port http://127.0.0.1 origin.");
  }
  const port = Number(value.slice(value.lastIndexOf(":") + 1));
  if (port > 65535) {
    throw new Error("Local API origin must be an explicit-port http://127.0.0.1 origin.");
  }
  return value;
}

export function localConnectivityOrigin(env: Readonly<Record<string, string | undefined>>): string | null {
  if (env.LOCAL_CONNECTIVITY_ENABLED !== "true") return null;
  if (["VERCEL", "VERCEL_ENV", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY", "RENDER"].some(key => env[key] !== undefined)
    || env.SITE_MODE === "release" || env.SITE_MODE === "preview") return null;
  return validateLoopbackOrigin(env.LOCAL_CONNECTIVITY_API_ORIGIN ?? "http://127.0.0.1:3001");
}
