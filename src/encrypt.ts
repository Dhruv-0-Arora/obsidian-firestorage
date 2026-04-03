const IV_LENGTH = 12;

function toBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64");
}

function fromBase64(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, "base64"));
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
    const raw = fromBase64(keyBase64);
    return window.crypto.subtle.importKey(
        "raw",
        raw,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
    );
}

/**
 * Generates a random 256-bit AES key and returns it as a base64 string.
 * This key should be saved in plugin settings and shared across machines.
 */
export async function generateKeyBase64(): Promise<string> {
    const key = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
    );
    const raw = await window.crypto.subtle.exportKey("raw", key);
    return toBase64(new Uint8Array(raw));
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a base64 string containing the 12-byte IV prepended to the ciphertext+tag.
 */
export async function encryptContent(
    plaintext: string,
    keyBase64: string,
): Promise<string> {
    const key = await importKey(keyBase64);
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);

    const cipherBuf = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded,
    );

    const combined = new Uint8Array(IV_LENGTH + cipherBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuf), IV_LENGTH);

    return toBase64(combined);
}

/**
 * Decrypts a base64 string produced by encryptContent back to plaintext.
 * Expects the first 12 bytes to be the IV, followed by ciphertext+tag.
 */
export async function decryptContent(
    encryptedBase64: string,
    keyBase64: string,
): Promise<string> {
    const key = await importKey(keyBase64);
    const combined = fromBase64(encryptedBase64);

    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const plainBuf = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext,
    );

    return new TextDecoder().decode(plainBuf);
}
