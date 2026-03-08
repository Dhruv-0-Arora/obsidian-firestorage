import { createHash } from "crypto"
import { Notice, Vault } from "obsidian"
import { SyncDbManager } from "./db"
import { MongoService } from "./mongo"
import { RemoteFileDoc, TrackedFile } from "./types"

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
    private vault: Vault // NOTE: Reference to Obsidian vault for file operations
    private db: SyncDbManager
    private mongo: MongoService
    private syncing = false

    constructor(vault: Vault, db: SyncDbManager, mongo: MongoService) {
        this.vault = vault
        this.db = db
        this.mongo = mongo
    }

    isSyncing(): boolean {
        return this.syncing
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

        // iterating through tracked files and running sync logic for each
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

    /**
     * Syncs a single file by comparing local and remote versions and deciding whether to
     * upload, download, or handle conflicts.
     *
     * @param entry - The tracked file entry containing path and last synced hash
     * @param result - The SyncResult object to update counts of uploads, downloads, conflicts, and errors
     */
    private async syncFile(
        entry: TrackedFile,
        result: SyncResult
    ): Promise<void> {
        // checking if file exists
        const localExists = await this.vault.adapter.exists(entry.path)
        const remote = await this.mongo.fetchFile(entry.path)

        const localContent = localExists
            ? await this.vault.adapter.read(entry.path)
            : null
        const localHash =
            localContent !== null ? computeHash(localContent) : null
        const remoteHash = remote?.hash ?? null
        const lastSynced = entry.lastSyncedHash

        if (localContent !== null && remote === null) {
            await this.upload(entry.path, localContent)
            result.uploaded++
            return
        }

        if (localContent === null && remote !== null) {
            await this.download(entry.path, remote)
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
            await this.download(entry.path, remote!)
            result.downloaded++
        } else {
            await this.handleConflict(entry.path, localContent!, remote!)
            result.conflicts++
        }
    }

    /**
     * Uploads local content to remote MongoDB, overwriting existing content.
     * Updates local sync state after successful upload.
     */
    private async upload(path: string, content: string): Promise<void> {
        const hash = computeHash(content)
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
     * Downloads remote content to local vault. Ensures parent directories exist before writing.
     */
    private async download(path: string, remote: RemoteFileDoc): Promise<void> {
        const parentDir = path.substring(0, path.lastIndexOf("/"))
        if (parentDir) {
            const dirExists = await this.vault.adapter.exists(parentDir)
            if (!dirExists) {
                await this.vault.adapter.mkdir(parentDir)
            }
        }
        await this.vault.adapter.write(path, remote.content)
        this.db.updateSyncState(path, remote.hash)
    }

    /**
     * Handles sync conflicts by saving the remote version as a separate file and keeping the local version as canonical.
     */
    private async handleConflict(
        path: string,
        _localContent: string,
        remote: RemoteFileDoc
    ): Promise<void> {
        const ext =
            path.lastIndexOf(".") !== -1
                ? path.substring(path.lastIndexOf("."))
                : ""
        const base = ext ? path.substring(0, path.lastIndexOf(".")) : path

        // writing remote content to new file
        const conflictPath = `${base}.sync-conflict${ext}`
        await this.vault.adapter.write(conflictPath, remote.content)

        new Notice(
            `Sync conflict for ${path} — remote version saved as ${conflictPath}`
        )

        // Upload local version as the canonical version
        await this.upload(path, _localContent)
    }
}
