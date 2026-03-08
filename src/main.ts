import { Notice, Plugin, TFile } from "obsidian"
import { SyncDbManager } from "./db"
import { MongoService } from "./mongo"
import { SyncSettingTab } from "./settings"
import { SyncEngine } from "./sync"
import { DEFAULT_SETTINGS, SyncPluginSettings } from "./types"

/**
 * Obsidian plugin to sync selected files with a MongoDB collection.
 */
export default class SyncPlugin extends Plugin {
    settings: SyncPluginSettings
    dbManager: SyncDbManager
    mongo: MongoService
    syncEngine: SyncEngine
    private syncIntervalId: number | null = null
    private statusBarEl: HTMLElement

    async onload() {
        await this.loadSettings()

        this.dbManager = new SyncDbManager(this.app.vault, this.settings)
        this.mongo = new MongoService() // initalizing mongo connection
        this.syncEngine = new SyncEngine(
            this.app.vault,
            this.dbManager,
            this.mongo
        )

        this.statusBarEl = this.addStatusBarItem()
        this.setStatus("Idle")

        this.addRibbonIcon("refresh-cw", "Sync now", () => this.runSync())

        this.addCommand({
            id: "add-to-sync",
            name: "Add file to sync",
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile()
                if (!file) return false
                if (checking) return !this.dbManager.isTracked(file.path)
                void this.addFileToSync(file.path)
                return true
            },
        })

        this.addCommand({
            id: "remove-from-sync",
            name: "Remove file from sync",
            checkCallback: checking => {
                const file = this.app.workspace.getActiveFile()
                if (!file) return false
                if (checking) return this.dbManager.isTracked(file.path)
                void this.removeFileFromSync(file.path)
                return true
            },
        })

        this.addCommand({
            id: "sync-now",
            name: "Sync now",
            callback: () => this.runSync(),
        })

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (!(file instanceof TFile)) return

                if (!this.dbManager.isTracked(file.path)) {
                    menu.addItem(item =>
                        item
                            .setTitle("Add to mongodb sync")
                            .setIcon("cloud-upload")
                            .onClick(() => this.addFileToSync(file.path))
                    )
                } else {
                    menu.addItem(item =>
                        item
                            .setTitle("Remove from mongodb sync")
                            .setIcon("cloud-off")
                            .onClick(() => this.removeFileFromSync(file.path))
                    )
                }
            })
        )

        this.addSettingTab(new SyncSettingTab(this.app, this))

        await this.initializePlugin()
    }

    onunload() {
        void (async () => {
            if (this.mongo.isConnected()) {
                try {
                    this.setStatus("Final sync...")
                    await this.syncEngine.syncAll()
                } catch {
                    // best-effort on shutdown
                }
                await this.mongo.disconnect()
            }
        })()
    }

    /**
     * Loads plugin settings, merging defaults with any saved data.
     */
    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<SyncPluginSettings>
        )
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    async reconnectMongo(): Promise<void> {
        this.dbManager.updateConnectionFromSettings(this.settings)
        await this.dbManager.save()

        await this.mongo.connect(
            this.settings.mongoUri,
            this.settings.database,
            this.settings.collection
        )
        this.setStatus("Connected")
        new Notice("Mongodb connected")
    }

    restartSyncInterval(): void {
        if (this.syncIntervalId !== null) {
            window.clearInterval(this.syncIntervalId)
        }
        const ms = this.settings.syncIntervalMinutes * 60 * 1000
        this.syncIntervalId = this.registerInterval(
            window.setInterval(() => void this.runSync(), ms)
        )
    }

    private async initializePlugin(): Promise<void> {
        await this.dbManager.load()
        this.dbManager.updateConnectionFromSettings(this.settings)

        if (this.settings.mongoUri) {
            try {
                await this.mongo.connect(
                    this.settings.mongoUri,
                    this.settings.database,
                    this.settings.collection
                )
                this.setStatus("Connected")
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                this.setStatus("Connection failed")
                new Notice(`MongoDB connection failed: ${msg}`)
            }
        } else {
            this.setStatus("Not configured")
        }

        this.restartSyncInterval()
    }

    private async addFileToSync(path: string): Promise<void> {
        if (this.dbManager.addFile(path)) {
            await this.dbManager.save()
            new Notice(`Added ${path} to sync`)
        } else {
            new Notice(`${path} is already being synced`)
        }
    }

    private async removeFileFromSync(path: string): Promise<void> {
        if (this.dbManager.removeFile(path)) {
            await this.dbManager.save()
            new Notice(`Removed ${path} from sync`)
        } else {
            new Notice(`${path} is not being synced`)
        }
    }

    /**
     * Syncs all files
     */
    private async runSync(): Promise<void> {
        if (!this.mongo.isConnected()) {
            this.setStatus("Not connected")
            return
        }
        if (this.syncEngine.isSyncing()) return

        this.setStatus("Syncing...")
        const result = await this.syncEngine.syncAll()

        if (result.errors.length > 0) {
            this.setStatus("Sync errors")
            new Notice(
                `Sync completed with errors:\n${result.errors.join("\n")}`
            )
        } else {
            const parts: string[] = []
            if (result.uploaded > 0) parts.push(`${result.uploaded} uploaded`)
            if (result.downloaded > 0)
                parts.push(`${result.downloaded} downloaded`)
            if (result.conflicts > 0)
                parts.push(`${result.conflicts} conflicts`)
            const summary = parts.length > 0 ? parts.join(", ") : "up to date"
            this.setStatus(`Synced: ${summary}`)
        }
    }

    /**
     * Handles changes to status bar text
     */
    private setStatus(text: string): void {
        this.statusBarEl.setText(`Sync: ${text}`)
    }
}
