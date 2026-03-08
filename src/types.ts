/**
 * Configurable settings options for the plugin
 *
 * REMINDER: If you add new settings here, make sure to also update the
 * SyncSettingTab UI and the DEFAULT_SETTINGS object below.
 */
export interface SyncPluginSettings {
    mongoUri: string
    database: string
    collection: string
    syncIntervalMinutes: number
    dbFilePath: string
}

/**
 * Default values for settings
 */
export const DEFAULT_SETTINGS: SyncPluginSettings = {
    mongoUri: "",
    database: "obsidian-sync",
    collection: "files",
    syncIntervalMinutes: 5,
    dbFilePath: ".obsidian-sync.db",
}

/**
 * Data structure of file being tracked for sync
 */
export interface TrackedFile {
    path: string
    lastSyncedHash: string
    lastSyncedAt: number
}

/**
 * Data structure for storing sync state in the local database
 */
export interface SyncDbData {
    connection: {
        uri: string
        database: string
        collection: string
    }
    trackedFiles: TrackedFile[]
}

/**
 * Data structure for representing a synced document in MongoDB
 * REMINDER: If you add new fields here, make sure to also update the SyncEngine logic to handle them.
 */
export interface RemoteFileDoc {
    path: string
    content: string
    hash: string
    lastModified: number
}
