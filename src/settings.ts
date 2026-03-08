import { App, PluginSettingTab, Setting } from "obsidian";
import type SyncPlugin from "./main";
import { SyncPluginSettings } from "./types";

/**
 * Visual interface for plugin settings
 * NOTE: Extends PluginSettingTab 
 */
export class SyncSettingTab extends PluginSettingTab {
	plugin: SyncPlugin; // instance of the plugin

	constructor(app: App, plugin: SyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// Called by Obsidian when the settings tab is opened
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "MongoDB sync" });

		new Setting(containerEl)
			.setName("MongoDB connection URI")
			.setDesc(
				"The full connection string, e.g. mongodb+srv://user:pass@cluster.mongodb.net",
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.style.width = "100%";
				text
					.setPlaceholder("mongodb+srv://...")
					.setValue(this.plugin.settings.mongoUri)
					.onChange(async (value) => {
						this.plugin.settings.mongoUri = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Database name")
			.setDesc("The MongoDB database to store synced files in.")
			.addText((text) =>
				text
					.setPlaceholder("obsidian-sync")
					.setValue(this.plugin.settings.database)
					.onChange(async (value) => {
						this.plugin.settings.database = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Collection name")
			.setDesc("The collection within the database.")
			.addText((text) =>
				text
					.setPlaceholder("files")
					.setValue(this.plugin.settings.collection)
					.onChange(async (value) => {
						this.plugin.settings.collection = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("How often to automatically sync tracked files.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						"1": "Every 1 minute",
						"5": "Every 5 minutes",
						"15": "Every 15 minutes",
						"30": "Every 30 minutes",
						"60": "Every 60 minutes",
					})
					.setValue(String(this.plugin.settings.syncIntervalMinutes))
					.onChange(async (value) => {
						this.plugin.settings.syncIntervalMinutes = Number(value);
						await this.plugin.saveSettings();
						this.plugin.restartSyncInterval();
					}),
			);

		new Setting(containerEl)
			.setName("Sync database file path")
			.setDesc(
				"Path within the vault for the .db file that tracks synced files and connection info.",
			)
			.addText((text) =>
				text
					.setPlaceholder(".obsidian-sync.db")
					.setValue(this.plugin.settings.dbFilePath)
					.onChange(async (value) => {
						this.plugin.settings.dbFilePath = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", { text: "Connection" });

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Attempt to connect to MongoDB with the current settings.")
			.addButton((btn) =>
				btn.setButtonText("Connect").onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText("Connecting...");
					try {
						await this.plugin.reconnectMongo();
						btn.setButtonText("Connected");
					} catch (e) {
						btn.setButtonText("Failed");
					}
					setTimeout(() => {
						btn.setDisabled(false);
						btn.setButtonText("Connect");
					}, 3000);
				}),
			);
	}
}

/** Helper function to convert settings to a partial object for updates */
export function settingsToPartial(
	s: SyncPluginSettings,
): Partial<SyncPluginSettings> {
	return { ...s }; // NOTE: Partials convert all properties to optional, so this is just a type assertion
}
