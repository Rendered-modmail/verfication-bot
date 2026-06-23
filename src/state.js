import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload) {
  return createHmac("sha256", config.clientSecret).update(payload).digest("base64url");
}

export function createOAuthState({ discordUserId, guildId }) {
  const payload = base64UrlEncode(
    JSON.stringify({
      discordUserId,
      guildId,
      expiresAt: Date.now() + config.oauthStateTtlMs
    })
  );
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload);
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  const record = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!record.discordUserId || !record.guildId || Date.now() > record.expiresAt) {
    return null;
  }

  return record;
}
