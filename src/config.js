import "dotenv/config";

const required = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "PUBLIC_BASE_URL",
  "VERIFIED_ROLE_ID",
  "UNVERIFIED_ROLE_ID"
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

function intFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a number.`);
  }
  return parsed;
}

function listFromEnv(name) {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const publicBaseUrl = process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
const redirectPath = process.env.OAUTH_REDIRECT_PATH ?? "/oauth/callback";

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  publicBaseUrl,
  redirectPath,
  redirectUri: `${publicBaseUrl}${redirectPath}`,
  port: intFromEnv("PORT", 3000),
  verifiedRoleId: process.env.VERIFIED_ROLE_ID,
  unverifiedRoleId: process.env.UNVERIFIED_ROLE_ID,
  commandGuildId: process.env.COMMAND_GUILD_ID,
  allowCrossGuildJoin: process.env.ALLOW_CROSS_GUILD_JOIN === "true",
  sjoinAllowedGuildIds: new Set(listFromEnv("SJOIN_ALLOWED_GUILD_IDS")),
  sjoinDelayMs: intFromEnv("SJOIN_DELAY_MS", 1200),
  dataFile: process.env.DATA_FILE ?? "./data/authorized-users.json",
  oauthStateTtlMs: intFromEnv("OAUTH_STATE_TTL_MINUTES", 10) * 60 * 1000,
  discordApiBase: "https://discord.com/api/v10"
};
