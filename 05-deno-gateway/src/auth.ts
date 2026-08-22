const HASH_ALGORITHM = "SHA-256";
const DERIVATION_ALGORITHM = "PBKDF2";
const ITERATIONS = 210_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 256;

function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function constantTimeEqual(
  first: Uint8Array,
  second: Uint8Array,
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.length; index++) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const safeSalt = copyBytes(salt);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    DERIVATION_ALGORITHM,
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: DERIVATION_ALGORITHM,
      salt: safeSalt,
      iterations,
      hash: HASH_ALGORITHM,
    },
    passwordKey,
    KEY_LENGTH,
  );

  return new Uint8Array(derivedBits);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Password must contain at least 12 characters.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await derivePasswordHash(password, salt, ITERATIONS);

  return [
    "pbkdf2",
    ITERATIONS.toString(),
    bytesToBase64(salt),
    bytesToBase64(hash),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    const parts = encodedHash.split("$");

    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return false;
    }

    const iterations = Number(parts[1]);

    if (!Number.isSafeInteger(iterations) || iterations <= 0) {
      return false;
    }

    const salt = base64ToBytes(parts[2]);
    const expectedHash = base64ToBytes(parts[3]);
    const actualHash = await derivePasswordHash(
      password,
      salt,
      iterations,
    );

    return constantTimeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
