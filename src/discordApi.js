import { config } from "./config.js";

export class DiscordApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "DiscordApiError";
    this.status = status;
    this.body = body;
  }
}

async function discordFetch(path, options = {}) {
  const response = await fetch(`${config.discordApiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new DiscordApiError(`Discord API request failed: ${response.status}`, response.status, body);
  }

  return body;
}

export async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri
  });

  const response = await fetch(`${config.discordApiBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  const body = await response.json();
  if (!response.ok) {
    throw new DiscordApiError("OAuth token exchange failed.", response.status, body);
  }

  return body;
}

export async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch(`${config.discordApiBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  const body = await response.json();
  if (!response.ok) {
    throw new DiscordApiError("OAuth token refresh failed.", response.status, body);
  }

  return body;
}

export async function getCurrentUser(accessToken) {
  return discordFetch("/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function addGuildMember({ guildId, userId, accessToken }) {
  return discordFetch(`/guilds/${guildId}/members/${userId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${config.token}` },
    body: JSON.stringify({ access_token: accessToken })
  });
}
