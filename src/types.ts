export interface SyncPluginSettings {
	mongoUri: string;
	database: string;
	collection: string;
	syncIntervalMinutes: number;
	dbFilePath: string;
}

export const DEFAULT_SETTINGS: SyncPluginSettings = {
	mongoUri: "",
	database: "obsidian-sync",
	collection: "files",
	syncIntervalMinutes: 5,
	dbFilePath: ".obsidian-sync.db",
};

export interface TrackedFile {
	path: string;
	lastSyncedHash: string;
	lastSyncedAt: number;
}

export interface SyncDbData {
	connection: {
		uri: string;
		database: string;
		collection: string;
	};
	trackedFiles: TrackedFile[];
}

export interface RemoteFileDoc {
	path: string;
	content: string;
	hash: string;
	lastModified: number;
}
