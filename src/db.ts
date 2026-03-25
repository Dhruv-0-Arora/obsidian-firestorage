import { Vault } from "obsidian"
import { SyncDbData, TrackedFile, SyncPluginSettings } from "./types"

const EMPTY_DB: SyncDbData = {
    connection: { uri: "", database: "", collection: "" },
    trackedFiles: [],
}

export class SyncDbManager {
    private vault: Vault
    private data: SyncDbData
    private filePath: string

    constructor(vault: Vault, settings: SyncPluginSettings) {
        this.vault = vault
        this.data = structuredClone(EMPTY_DB)
        this.filePath = settings.dbFilePath
    }

    async load(): Promise<void> {
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

    async save(): Promise<void> {
        const json = JSON.stringify(this.data, null, 2)
        const exists = await this.vault.adapter.exists(this.filePath)
        if (exists) {
            await this.vault.adapter.write(this.filePath, json)
        } else {
            await this.vault.adapter.write(this.filePath, json)
        }
    }

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

	/** TODO: Function that will use private key without passing it around to encrypt/decrypt file contents. */

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

    updateSyncState(path: string, hash: string): void {
        const entry = this.data.trackedFiles.find(f => f.path === path)
        if (entry) {
            entry.lastSyncedHash = hash
            entry.lastSyncedAt = Date.now()
        }
    }

    getTrackedFile(path: string): TrackedFile | undefined {
        return this.data.trackedFiles.find(f => f.path === path)
    }

    updateFilePath(newPath: string): void {
        this.filePath = newPath
    }
}
