import { Vault } from "obsidian"
import { SyncDbData, TrackedFile, SyncPluginSettings, CryptoKey } from "./types"

const EMPTY_DB: SyncDbData = {
    connection: { uri: "", database: "", collection: "" },
    trackedFiles: [],
}

/**
 * Manages the local JSON file that stores sync metadata, including connection info and tracked files.
 */
export class SyncDbManager {
    private vault: Vault
    private data: SyncDbData
    private filePath: string

    constructor(vault: Vault, settings: SyncPluginSettings) {
        this.vault = vault
        this.data = structuredClone(EMPTY_DB)
        this.filePath = settings.dbFilePath
    }

	/**
	 * Loads the JSON file from the vault. If it doesn't exist or is invalid, initializes with default structure.
	 */
    async load(): Promise<void> {
		// If the file doesn't exist (and is valid), we start with an empty DB
        const exists = await this.vault.adapter.exists(this.filePath)
        if (!exists) {
            this.data = structuredClone(EMPTY_DB)
            return
        }
        const raw = await this.vault.adapter.read(this.filePath)
        try {
            this.data = JSON.parse(raw) as SyncDbData
        } catch {
            this.data = structuredClone(EMPTY_DB)
        }
    }

	/** Saves the current state of the DB to the vault as a JSON file. */
    async save(): Promise<void> {
        const json = JSON.stringify(this.data, null, 2)
        const exists = await this.vault.adapter.exists(this.filePath)
        if (exists) {
            await this.vault.adapter.write(this.filePath, json)
        } else {
            await this.vault.adapter.write(this.filePath, json)
        }
    }

	/** Updates the connection information in the DB based on the provided settings. */
    updateConnectionFromSettings(settings: SyncPluginSettings): void {
        this.data.connection = {
            uri: settings.mongoUri,
            database: settings.database,
            collection: settings.collection,
        }
    }

    getConnection() {
        return this.data.connection
    }

    getTrackedFiles(): TrackedFile[] {
        return this.data.trackedFiles
    }

	/** Retrieves the stored private encryption key, if it exists. */
	getPrivateKey(): CryptoKey | null {
		return this.data.encryptionKey || null
	}

    isTracked(path: string): boolean {
        return this.data.trackedFiles.some(f => f.path === path)
    }

    addFile(path: string): boolean {
        if (this.isTracked(path)) return false
        this.data.trackedFiles.push({
            path,
            lastSyncedHash: "",
            lastSyncedAt: 0,
        })
        return true
    }

    removeFile(path: string): boolean {
        const before = this.data.trackedFiles.length
        this.data.trackedFiles = this.data.trackedFiles.filter(
            f => f.path !== path
        )
        return this.data.trackedFiles.length < before
    }

	/** Updates the sync state for a tracked file, including the last synced hash and timestamp. */
    updateSyncState(path: string, hash: string): void {
        const entry = this.data.trackedFiles.find(f => f.path === path)
        if (entry) {
            entry.lastSyncedHash = hash
            entry.lastSyncedAt = Date.now()
        }
    }

	/**
	 * Gets the tracked file metadata for a given path
	 * @param path The local file path to look up
	 */
    getTrackedFile(path: string): TrackedFile | undefined {
        return this.data.trackedFiles.find(f => f.path === path)
    }

	/**
	 * Updates the file path of the DB JSON file. This is necessary if the user changes the path in settings.
	 * Does not migrate data or change the file on disk - just updates the internal reference
	 * @param newPath The new file path to use for the DB JSON file
	 */
    updateFilePath(newPath: string): void {
        this.filePath = newPath
    }
}
