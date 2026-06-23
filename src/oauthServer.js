import http from "node:http";
import { URL } from "node:url";
import { config } from "./config.js";
import { exchangeCodeForToken, getCurrentUser } from "./discordApi.js";
import { verifyOAuthState } from "./state.js";

function html(title, message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #f9fafb; }
    main { max-width: 520px; padding: 32px; }
    h1 { margin: 0 0 12px; font-size: 28px; }
    p { color: #d1d5db; line-height: 1.5; }
  </style>
</head>
<body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
}

export function createOAuthServer({ client, store }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, config.publicBaseUrl);
      if (url.pathname !== config.redirectPath) {
        response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html("Not found", "This route does not exist."));
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html("Verification failed", "Discord did not return the required OAuth details."));
        return;
      }

      const stateRecord = verifyOAuthState(state);
      if (!stateRecord) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html("Verification expired", "Please go back to Discord and start verification again."));
        return;
      }

      const tokenData = await exchangeCodeForToken(code);
      const discordUser = await getCurrentUser(tokenData.access_token);

      if (discordUser.id !== stateRecord.discordUserId) {
        await store.save();
        response.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html("Wrong account", "Please authorize with the same Discord account that clicked verify."));
        return;
      }

      store.upsertUser(discordUser.id, tokenData);

      const guild = await client.guilds.fetch(stateRecord.guildId);
      const member = await guild.members.fetch(discordUser.id);
      await member.roles.remove(config.unverifiedRoleId, "Completed OAuth verification");
      await member.roles.add(config.verifiedRoleId, "Completed OAuth verification");

      await store.save();
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html("Verified", "You are verified. You can close this tab and return to Discord."));
    } catch (error) {
      console.error("OAuth callback failed:", {
        message: error.message,
        status: error.status,
        body: error.body,
        stack: error.stack
      });
      response.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html("Verification error", "Something went wrong. Please contact a server admin."));
    }
  });
}
