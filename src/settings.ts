/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Notice, PluginSettingTab, Setting } from "obsidian"
import { generateKeyBase64 } from "./encrypt"
import type SyncPlugin from "./main"
import { SyncPluginSettings } from "./types"

/**
 * Visual interface for plugin settings
 * NOTE: Extends PluginSettingTab
 */
export class SyncSettingTab extends PluginSettingTab {
    plugin: SyncPlugin // instance of the plugin

    constructor(app: App, plugin: SyncPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    // Called by Obsidian when the settings tab is opened
    display(): void {
        const { containerEl } = this
        containerEl.empty()

        new Setting(containerEl)
            .setName("MongoDB connection URI")
            .setDesc(
                "The full connection string, e.g. mongodb+srv://user:pass@cluster.mongodb.net"
            )
            .addText(text => {
                text.inputEl.type = "password"
                text.inputEl.setCssProps({ width: "100%" })
                text.setPlaceholder("mongodb+srv://...")
                    .setValue(this.plugin.settings.mongoUri)
                    .onChange(async value => {
                        this.plugin.settings.mongoUri = value
                        await this.plugin.saveSettings()
                    })
            })

        new Setting(containerEl)
            .setName("Database name")
            .setDesc("The MongoDB database to store synced files in.")
            .addText(text =>
                text
                    .setPlaceholder("obsidian-sync")
                    .setValue(this.plugin.settings.database)
                    .onChange(async value => {
                        this.plugin.settings.database = value
                        await this.plugin.saveSettings()
                    })
            )

        new Setting(containerEl)
            .setName("Collection name")
            .setDesc("The collection within the database.")
            .addText(text =>
                text
                    .setPlaceholder("files")
                    .setValue(this.plugin.settings.collection)
                    .onChange(async value => {
                        this.plugin.settings.collection = value
                        await this.plugin.saveSettings()
                    })
            )

        new Setting(containerEl)
            .setName("Sync interval")
            .setDesc("How often to automatically sync tracked files.")
            .addDropdown(dropdown =>
                dropdown
                    .addOptions({
                        "1": "Every 1 minute",
                        "5": "Every 5 minutes",
                        "15": "Every 15 minutes",
                        "30": "Every 30 minutes",
                        "60": "Every 60 minutes",
                    })
                    .setValue(String(this.plugin.settings.syncIntervalMinutes))
                    .onChange(async value => {
                        this.plugin.settings.syncIntervalMinutes = Number(value)
                        await this.plugin.saveSettings()
                        this.plugin.restartSyncInterval()
                    })
            )

        new Setting(containerEl)
            .setName("Sync database file path")
            .setDesc(
                "Path within the vault for the .db file that tracks synced files and connection info."
            )
            .addText(text =>
                text
                    .setPlaceholder(".obsidian-sync.db")
                    .setValue(this.plugin.settings.dbFilePath)
                    .onChange(async value => {
                        this.plugin.settings.dbFilePath = value
                        await this.plugin.saveSettings()
                    })
            )

        new Setting(containerEl).setName("Encryption").setHeading()

        new Setting(containerEl)
            .setName("Enable encryption")
            .setDesc(
                "Encrypt file contents with AES-256-GCM before uploading to MongoDB. " +
                "All machines must share the same key to read synced files."
            )
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.encryptionEnabled)
                    .onChange(async value => {
                        this.plugin.settings.encryptionEnabled = value
                        await this.plugin.saveSettings()
                        this.display()
                    })
            )

        if (this.plugin.settings.encryptionEnabled) {
            new Setting(containerEl)
                .setName("Encryption key")
                .setDesc(
                    "The 256-bit AES key as a base64 string. " +
                    "Paste an existing key from another machine, or generate a new one below."
                )
                .addText(text => {
                    text.inputEl.type = "password"
                    text.inputEl.style.width = "100%"
                    text.setPlaceholder("Base64-encoded key")
                        .setValue(this.plugin.settings.encryptionKey)
                        .onChange(async value => {
                            this.plugin.settings.encryptionKey = value
                            await this.plugin.saveSettings()
                        })
                })

            new Setting(containerEl)
                .setName("Generate new key")
                .setDesc(
                    "Creates a new random 256-bit key. Copy it to your other machines before syncing."
                )
                .addButton(btn =>
                    btn.setButtonText("Generate").onClick(async () => {
                        const key = await generateKeyBase64()
                        this.plugin.settings.encryptionKey = key
                        await this.plugin.saveSettings()
                        this.display()
                        new Notice("New encryption key generated")
                    })
                )

            if (this.plugin.settings.encryptionKey) {
                new Setting(containerEl)
                    .setName("Copy key to clipboard")
                    .setDesc(
                        "Copy the current key so you can paste it into this plugin's settings on another machine."
                    )
                    .addButton(btn =>
                        btn.setButtonText("Copy key").onClick(async () => {
                            await navigator.clipboard.writeText(
                                this.plugin.settings.encryptionKey
                            )
                            new Notice("Encryption key copied to clipboard")
                        })
                    )
            }
        }

        new Setting(containerEl).setName("Connection").setHeading()

        new Setting(containerEl)
            .setName("Test connection")
            .setDesc("Attempt to connect to MongoDB with the current settings.")
            .addButton(btn =>
                btn.setButtonText("Connect").onClick(async () => {
                    btn.setDisabled(true)
                    btn.setButtonText("Connecting...")
                    try {
                        await this.plugin.reconnectMongo()
                        btn.setButtonText("Connected")
                    } catch {
                        btn.setButtonText("Failed")
                    }
                    setTimeout(() => {
                        btn.setDisabled(false)
                        btn.setButtonText("Connect")
                    }, 3000)
                })
            )
    }
}

/** Helper function to convert settings to a partial object for updates */
export function settingsToPartial(
    s: SyncPluginSettings
): Partial<SyncPluginSettings> {
    return { ...s } // NOTE: Partials convert all properties to optional, so this is just a type assertion
}
