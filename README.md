# Discord Verification Bot

This bot gives a Discord server a dropdown-based OAuth verification flow:

- A staff member runs `/setupverify`.
- Members select **Verify account** from the dropdown.
- Discord OAuth asks for `identify` and `guilds.join`.
- After a successful callback, the bot removes the unverified role and adds the verified role.
- `/sjoin amount server_id` can add previously authorized users to an allowed server using Discord's official `guilds.join` flow.

The `/sjoin` command is intentionally admin-only and allowlist-gated. It only works for users who already authorized this exact application through Discord OAuth.

## Setup

1. Create an application at the Discord Developer Portal.
2. Add a bot user and copy the bot token.
3. In **OAuth2**, add a redirect URI that matches your public callback URL:

   ```text
   http://localhost:3000/oauth/callback
   ```

   For a real server, use an HTTPS URL like:

   ```text
   https://your-domain.com/oauth/callback
   ```

4. Invite the bot to your server with these permissions:

   - Manage Roles
   - Create Instant Invite
   - Send Messages
   - Use Application Commands

5. Put the bot's highest role above both your verified and unverified roles.
6. Copy `.env.example` to `.env` and fill in the values.
7. Install dependencies and register commands:

   ```bash
   npm install
   npm run register
   npm start
   ```

## Environment

Important values in `.env`:

- `VERIFIED_ROLE_ID`: role to add after OAuth verification.
- `UNVERIFIED_ROLE_ID`: role to remove after OAuth verification.
- `PUBLIC_BASE_URL`: public URL where Discord can reach this app.
- `COMMAND_GUILD_ID`: optional test server ID for instant slash command registration.
- `ALLOW_CROSS_GUILD_JOIN`: set to `true` only if you want `/sjoin` to target servers other than the current one.
- `SJOIN_ALLOWED_GUILD_IDS`: comma-separated server IDs `/sjoin` may target when cross-guild joining is enabled.

## `/sjoin`

Usage:

```text
/sjoin amount:25 server_id:123456789012345678
```

Requirements:

- The command user must have Administrator.
- The target server must contain the bot.
- The bot must have Create Instant Invite in the target server.
- The target server must be the current server unless cross-guild joining is enabled and the server ID is allowlisted.
- The selected members must have completed the OAuth verification flow for this app.

## Notes

Discord's add-guild-member API requires a valid user OAuth access token with the `guilds.join` scope. Tokens are stored in `data/authorized-users.json`; keep that file private and never commit it.
