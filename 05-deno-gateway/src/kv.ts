import { KeeneticSecrets } from "../../04-keenetic-wol/keenetic.ts";
import { hashPassword, verifyPassword } from "./auth.ts";

export interface GatewayDevice {
  mac: string;
  name: string;
}

export interface GatewayConfig extends KeeneticSecrets {
  passwordHash: string;
  serviceUrl: string;
  devices: GatewayDevice[];
}

interface StoredConfig {
  encrypted: string;
  createdAt: string;
  updatedAt: string;
}

function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

const CONFIG_KEY = ["wake-on-demand", "gateway-config"];

const kv = await Deno.openKv();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return copyBytes(bytes);
}

function getEncryptionKeyBytes(): Uint8Array<ArrayBuffer> {
  const encodedKey = Deno.env.get("ENCRYPTION_KEY");

  if (!encodedKey) {
    throw new Error("ENCRYPTION_KEY is not configured.");
  }

  const key = base64ToBytes(encodedKey);

  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return copyBytes(key);
}

async function getEncryptionKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    getEncryptionKeyBytes(),
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(value: unknown): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext,
  );

  return [
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(ciphertext)),
  ].join(".");
}

async function decrypt<T>(value: string): Promise<T> {
  const [encodedIv, encodedCiphertext] = value.split(".");

  if (!encodedIv || !encodedCiphertext) {
    throw new Error("Invalid encrypted configuration format.");
  }

  const key = await getEncryptionKey();

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(encodedIv),
    },
    key,
    base64ToBytes(encodedCiphertext),
  );

  return JSON.parse(
    new TextDecoder().decode(plaintext),
  ) as T;
}

export async function isInitialized(): Promise<boolean> {
  const entry = await kv.get<StoredConfig>(CONFIG_KEY);

  return entry.value !== null;
}

export async function initialize(
  password: string,
  secrets: KeeneticSecrets & {
    serviceUrl: string;
    devices: GatewayDevice[];
  },
): Promise<void> {
  if (await isInitialized()) {
    throw new Error("Gateway is already initialized.");
  }

  const passwordHash = await hashPassword(password);

  const config: GatewayConfig = {
    passwordHash,
    keeneticUrl: secrets.keeneticUrl,
    keeneticUser: secrets.keeneticUser,
    keeneticPassword: secrets.keeneticPassword,
    serviceUrl: secrets.serviceUrl,
    devices: secrets.devices,
  };

  const now = new Date().toISOString();

  const storedConfig: StoredConfig = {
    encrypted: await encrypt(config),
    createdAt: now,
    updatedAt: now,
  };

  await kv.set(CONFIG_KEY, storedConfig);
}

export async function getConfig(): Promise<GatewayConfig | null> {
  const entry = await kv.get<StoredConfig>(CONFIG_KEY);

  if (!entry.value) {
    return null;
  }

  return await decrypt<GatewayConfig>(entry.value.encrypted);
}

export async function verifyGatewayPassword(
  password: string,
): Promise<boolean> {
  const config = await getConfig();

  if (!config) {
    return false;
  }

  return await verifyPassword(password, config.passwordHash);
}

export async function updateConfig(
  changes: Partial<Omit<GatewayConfig, "passwordHash">>,
): Promise<void> {
  const current = await getConfig();

  if (!current) {
    throw new Error("Gateway is not initialized.");
  }

  const updated: GatewayConfig = {
    ...current,
    ...changes,
  };

  const existing = await kv.get<StoredConfig>(CONFIG_KEY);
  const previous = existing.value;

  const storedConfig: StoredConfig = {
    encrypted: await encrypt(updated),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await kv.set(CONFIG_KEY, storedConfig);
}

export async function updateGatewayPassword(
  newPassword: string,
): Promise<void> {
  const current = await getConfig();

  if (!current) {
    throw new Error("Gateway is not initialized.");
  }

  const existing = await kv.get<StoredConfig>(CONFIG_KEY);
  const previous = existing.value;

  const updated: GatewayConfig = {
    ...current,
    passwordHash: await hashPassword(newPassword),
  };

  const storedConfig: StoredConfig = {
    encrypted: await encrypt(updated),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await kv.set(CONFIG_KEY, storedConfig);
}
