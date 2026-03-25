import { Vault } from "obsidian";
import { SyncPluginSettings, CryptoKey } from "./types";

export class EncryptionManager {
	private key: CryptoKey | null = null
	private dbManager: SyncDBManager

	constructor (dbManager: SyncDBManager) {
		this.dbManager = dbManager;
		this.loadKey()
	}

	/** For simplicity, the private key is stored as a base64 string in the vault. */
	async loadKey(): Promise<void> {
		this.dbManager.getPrivateKey()
			
		}
	}

	/** Generates a new random key if user clicks "Generate New Key" button. */
	async generateKey(): Promise<void> {
		const array = new Uint8Array(32);
		window.crypto.getRandomValues(array);
		this.key = { value: btoa(String.fromCharCode(...array)) };
	}
}
