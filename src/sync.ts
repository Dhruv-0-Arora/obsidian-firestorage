import { createHash } from "crypto"
import { Notice, Vault } from "obsidian"
import { SyncDbManager } from "./db"
import { encryptContent, decryptContent } from "./encrypt"
import { MongoService } from "./mongo"
import { RemoteFileDoc, SyncPluginSettings, TrackedFile } from "./types"

/** Type for result of Sync. Contains counts of uploaded, downloaded, and conflicted files, as well as any error messages. */
export interface SyncResult {
    uploaded: number
    downloaded: number
    conflicts: number
    errors: string[]
}

export function computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex")
}

/** Syncing files between remote MongoDB and local vault */
export class SyncEngine {
    private vault: Vault
    private db: SyncDbManager
    private mongo: MongoService
    private settings: SyncPluginSettings
    private syncing = false

    constructor(vault: Vault, db: SyncDbManager, mongo: MongoService, settings: SyncPluginSettings) {
        this.vault = vault
        this.db = db
        this.mongo = mongo
        this.settings = settings
    }

    isSyncing(): boolean {
        return this.syncing
    }

    updateSettings(settings: SyncPluginSettings): void {
        this.settings = settings
    }

    /** Main sync method to compare local and remote files using hashes and last fetch */
    async syncAll(): Promise<SyncResult> {
        if (this.syncing) {
            return {
                uploaded: 0,
                downloaded: 0,
                conflicts: 0,
                errors: ["Sync already in progress"],
            }
        }
        if (!this.mongo.isConnected()) {
            return {
                uploaded: 0,
                downloaded: 0,
                conflicts: 0,
                errors: ["MongoDB not connected"],
            }
        }

        this.syncing = true
        const result: SyncResult = {
            uploaded: 0,
            downloaded: 0,
            conflicts: 0,
            errors: [],
        }

        try {
            const tracked = this.db.getTrackedFiles()
            for (const entry of tracked) {
                try {
                    await this.syncFile(entry, result)
                } catch (e) {
                    result.errors.push(
                        `${entry.path}: ${e instanceof Error ? e.message : String(e)}`
                    )
                }
            }
            await this.db.save()
        } finally {
            this.syncing = false
        }
        return result
    }

    private useEncryption(): boolean {
        return this.settings.encryptionEnabled && this.settings.encryptionKey.length > 0
    }

    /**
     * Syncs a single file by comparing local and remote versions and deciding whether to
     * upload, download, or handle conflicts.
     */
    private async syncFile(
        entry: TrackedFile,
        result: SyncResult
    ): Promise<void> {
        const localExists = await this.vault.adapter.exists(entry.path)
        const remote = await this.mongo.fetchFile(entry.path)

        const localContent = localExists
            ? await this.vault.adapter.read(entry.path)
            : null
        const localHash =
            localContent !== null ? computeHash(localContent) : null

        let remotePlaintext: string | null = null
        if (remote) {
            if (this.useEncryption()) {
                try {
                    remotePlaintext = await decryptContent(remote.content, this.settings.encryptionKey)
                } catch {
                    // Content was stored as plaintext before encryption was enabled;
                    // treat as-is and it will be re-uploaded encrypted this cycle.
                    remotePlaintext = remote.content
                }
            } else {
                remotePlaintext = remote.content
            }
        }
        const remoteHash = remotePlaintext !== null ? computeHash(remotePlaintext) : null
        const lastSynced = entry.lastSyncedHash

        if (localContent !== null && remote === null) {
            await this.upload(entry.path, localContent)
            result.uploaded++
            return
        }

        if (localContent === null && remote !== null) {
            await this.download(entry.path, remotePlaintext!)
            this.db.updateSyncState(entry.path, computeHash(remotePlaintext!))
            result.downloaded++
            return
        }

        if (localContent === null && remote === null) {
            return
        }

        if (localHash === remoteHash) {
            this.db.updateSyncState(entry.path, localHash!)
            return
        }

        const localChanged = localHash !== lastSynced
        const remoteChanged = remoteHash !== lastSynced

        if (localChanged && !remoteChanged) {
            await this.upload(entry.path, localContent!)
            result.uploaded++
        } else if (!localChanged && remoteChanged) {
            await this.download(entry.path, remotePlaintext!)
            this.db.updateSyncState(entry.path, remoteHash!)
            result.downloaded++
        } else {
            await this.handleConflict(entry.path, localContent!, remotePlaintext!)
            result.conflicts++
        }
    }

    /**
     * Uploads local content to remote MongoDB, encrypting if enabled.
     * Hash is always computed on plaintext.
     */
    private async upload(path: string, plaintext: string): Promise<void> {
        const hash = computeHash(plaintext)
        const content = this.useEncryption()
            ? await encryptContent(plaintext, this.settings.encryptionKey)
            : plaintext

        const doc: RemoteFileDoc = {
            path,
            content,
            hash,
            lastModified: Date.now(),
        }
        await this.mongo.upsertFile(doc)
        this.db.updateSyncState(path, hash)
    }

    /**
     * Downloads plaintext content to local vault. Ensures parent directories exist before writing.
     */
    private async download(path: string, plaintext: string): Promise<void> {
        const parentDir = path.substring(0, path.lastIndexOf("/"))
        if (parentDir) {
            const dirExists = await this.vault.adapter.exists(parentDir)
            if (!dirExists) {
                await this.vault.adapter.mkdir(parentDir)
            }
        }
        await this.vault.adapter.write(path, plaintext)
    }

    /**
     * Handles sync conflicts by saving the remote version as a separate file and keeping the local version as canonical.
     */
    private async handleConflict(
        path: string,
        localPlaintext: string,
        remotePlaintext: string
    ): Promise<void> {
        const ext =
            path.lastIndexOf(".") !== -1
                ? path.substring(path.lastIndexOf("."))
                : ""
        const base = ext ? path.substring(0, path.lastIndexOf(".")) : path

        const conflictPath = `${base}.sync-conflict${ext}`
        await this.vault.adapter.write(conflictPath, remotePlaintext)

        new Notice(
            `Sync conflict for ${path} — remote version saved as ${conflictPath}`
        )

        await this.upload(path, localPlaintext)
    }
}
