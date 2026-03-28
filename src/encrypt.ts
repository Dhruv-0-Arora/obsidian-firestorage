import { Vault } from "obsidian";
import { CryptoKey, TrackedFile } from "./types";
import { SyncDbManager } from "./db";

export class EncryptionManager {
	private key: CryptoKey | null = null
	private vault: Vault
	private dbManager: SyncDbManager

	constructor (dbManager: SyncDbManager, vault: Vault) {
		this.vault = vault;
		this.dbManager = dbManager;
		this.loadKey()
	}

	/** For simplicity, the private key is stored as a base64 string in the vault. */
	async loadKey(): Promise<void> {
		this.dbManager.getPrivateKey()
	}

	/** Generates a new random key if user clicks "Generate New Key" button. */
	async generateKey(): Promise<void> {
		const array = new Uint8Array(32);
		window.crypto.getRandomValues(array);
		this.key = { value: btoa(String.fromCharCode(...array)) };
	}

	/** 
	 * Decrypts a file using the current key.
	 */
	async decryptFile(file: TrackedFile): Promise<void> {
		if (!this.key) {
			throw new Error("No encryption key available");
		}

		// retrieving the file contents locally
        const localExists = await this.vault.adapter.exists(file.path)

        const localContent = localExists
            ? await this.vault.adapter.read(file.path)
            : null
	}

	/**
	 * Encrypts a file using the current key.
	 */
	async encryptFile(file: TrackedFile): Promise<void> {
		if (!this.key) {
			throw new Error("No encryption key available");
		}

		// retrieving the local file contents
        const localExists = await this.vault.adapter.exists(file.path)

        const localContent = localExists
            ? await this.vault.adapter.read(file.path)
            : null

		// encrypting the content using Rijndael Algorithm and uploading to MongoDB

		const iv = window.crypto.getRandomValues(new Uint8Array(16));

		const ciphertext = await window.crypto.subtle.encrypt(
			{
				name: "AES-GCM",
				iv,
			},
			this.key.value,
			new TextEncoder().encode(localContent!)
		);
		
	}
}
