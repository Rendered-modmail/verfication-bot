import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

function emptyData() {
  return {
    users: {},
    states: {}
  };
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = emptyData();
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.data = { ...emptyData(), ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.save();
    }
  }

  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempFile = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tempFile, JSON.stringify(this.data, null, 2), "utf8");
    await rename(tempFile, this.filePath);
  }

  createState({ discordUserId, guildId }) {
    const state = randomUUID();
    this.data.states[state] = {
      discordUserId,
      guildId,
      createdAt: Date.now()
    };
    return state;
  }

  consumeState(state, ttlMs) {
    const record = this.data.states[state];
    delete this.data.states[state];
    if (!record) return null;
    if (Date.now() - record.createdAt > ttlMs) return null;
    return record;
  }

  upsertUser(userId, tokenData) {
    const existing = this.data.users[userId] ?? {};
    this.data.users[userId] = {
      ...existing,
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? existing.refreshToken,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      updatedAt: Date.now()
    };
  }

  updateUserToken(userId, tokenData) {
    if (!this.data.users[userId]) return;
    this.upsertUser(userId, tokenData);
  }

  getUser(userId) {
    return this.data.users[userId] ?? null;
  }

  listUsers() {
    return Object.values(this.data.users);
  }

  deleteUser(userId) {
    delete this.data.users[userId];
  }
}
