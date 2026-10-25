type Environment = Record<string, string | undefined>;

function text(env: Environment, key: string): string | undefined {
  const value = env[key]?.trim();
  if (!value) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(value) || value.length > 160) {
    throw new Error(`${key} must be a single line of at most 160 characters.`);
  }
  return value;
}

function publicOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const message = "SITE_URL must be an absolute HTTPS origin with a public DNS hostname, no credentials, port, path, query or fragment.";
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(message); }
  const labels = url.hostname.split(".");
  if (!/^https:\/\//.test(value) || /[\s\\?#]/.test(value) || url.protocol !== "https:" ||
      url.username || url.password || url.port || url.pathname !== "/" ||
      labels.length < 2 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
      !/[a-z]/i.test(labels.at(-1)!) || /\.(localhost|local|internal|test|invalid)$/i.test(url.hostname)) {
    throw new Error(message);
  }
  return url.origin;
}

export function readSiteConfig(env: Environment = process.env) {
  const mode = env.SITE_MODE?.trim() || (env.VERCEL_ENV === "preview" ? "preview" : "draft");
  if (mode !== "draft" && mode !== "preview" && mode !== "release") {
    throw new Error("SITE_MODE must be draft, preview or release.");
  }
  if (mode === "release" && env.VERCEL_ENV === "preview") {
    throw new Error("A Vercel preview cannot use release mode.");
  }
  const origin = publicOrigin(env.SITE_URL?.trim() || undefined);
  const appName = text(env, "APP_NAME");
  const operatorName = text(env, "OPERATOR_NAME");
  const supportEmail = text(env, "SUPPORT_EMAIL");
  if (supportEmail && (!/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(supportEmail) || supportEmail.includes(".."))) {
    throw new Error("SUPPORT_EMAIL must be a plain email address without URL parameters.");
  }
  if (mode === "release") {
    for (const [key, value] of Object.entries({ SITE_URL: origin, APP_NAME: appName, OPERATOR_NAME: operatorName, SUPPORT_EMAIL: supportEmail })) {
      if (!value) throw new Error(`${key} is required for release mode.`);
    }
    if (env.PUBLICATION_CONFIRMED !== "true") {
      throw new Error("PUBLICATION_CONFIRMED must be true after the owner confirms publication facts and privacy wording.");
    }
  }
  return {
    mode,
    appName: mode === "release" ? appName! : "Fulfillment Workspace",
    operatorName: mode === "release" ? operatorName : undefined,
    supportEmail: mode === "release" ? supportEmail : undefined,
    canonicalOrigin: mode === "release" ? origin : undefined,
    indexable: mode === "release",
  };
}
