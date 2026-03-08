# MongoDB Sync — Obsidian Plugin

Bidirectional file sync between your Obsidian vault and a MongoDB collection. Select specific files to track, and the plugin automatically keeps them in sync across machines using SHA-256 content hashing and conflict detection.

> **Desktop only.** This plugin uses the Node.js MongoDB driver and requires Obsidian running on Electron (macOS, Windows, Linux). It will not work on mobile.

---

## Features

- **Selective sync** — only files you explicitly add are ever touched. Nothing syncs by default.
- **Bidirectional** — changes flow both ways: local edits upload to MongoDB, remote edits download to your vault.
- **Content-hash diffing** — uses SHA-256 hashes to detect actual changes and avoid unnecessary writes.
- **Conflict detection** — if a file is modified both locally and remotely since the last sync, the remote version is preserved as a `.sync-conflict` copy and the local version is uploaded as canonical.
- **Configurable sync interval** — automatically syncs in the background every 1, 5, 15, 30, or 60 minutes.
- **Sync on quit** — performs a final sync pass when Obsidian is closed or the plugin is disabled.
- **Visible tracking file** — a `.obsidian-sync.db` file in your vault stores which files are tracked and when they were last synced (excluding sensitive credentials, which live in plugin settings).
- **Status bar indicator** — real-time status shown at the bottom of the Obsidian window.

---

## Requirements

- Obsidian v0.15.0 or later (desktop)
- Node.js 18+ (for development)
- A MongoDB instance accessible via a connection string (e.g. MongoDB Atlas, self-hosted)

---

## Setup

### 1. Install the plugin

Copy `main.js`, `manifest.json`, and `styles.css` into your vault at:

```
<YourVault>/.obsidian/plugins/obsidian-firestorage/
```

Then go to **Settings → Community plugins**, enable the plugin.

### 2. Configure your MongoDB connection

Open **Settings → MongoDB Sync** and fill in:

| Setting | Description | Default |
|---|---|---|
| MongoDB connection URI | Full connection string including credentials | *(empty)* |
| Database name | The database to use | `obsidian-sync` |
| Collection name | The collection to store synced files | `files` |
| Sync interval | How often to auto-sync | `5 minutes` |
| Sync database file path | Vault path for the tracking file | `.obsidian-sync.db` |

Your connection URI should look like one of:

```
# MongoDB Atlas
mongodb+srv://username:password@cluster0.abc123.mongodb.net

# Self-hosted
mongodb://username:password@localhost:27017
```

> The URI is stored in Obsidian's internal plugin data (not in the `.db` file), so it stays out of your vault and any version control.

### 3. Connect

After entering settings, select the **Connect** button in the settings tab. The status bar at the bottom of the window will update to `Sync: Connected` on success.

### 4. Track files

Add files to sync using any of:

- **Command palette** (`Cmd/Ctrl+P`) → "Add file to sync" (tracks the currently open file)
- **Right-click any file** in the file explorer → "Add to MongoDB sync"

To stop syncing a file, use "Remove file from sync" from the command palette or right-click the file and select "Remove from MongoDB sync".

---

## How sync works

Each tracked file goes through this decision tree on every sync pass:

```
Local file exists?  Remote document exists?  Result
─────────────────────────────────────────────────────────────
Yes                 No                        Upload local → MongoDB
No                  Yes                       Download remote → local
Yes                 Yes, same hash            No-op (already in sync)
Yes                 Yes, local changed only   Upload local → MongoDB
Yes                 Yes, remote changed only  Download remote → local
Yes                 Yes, both changed         CONFLICT: save remote as
                                              <name>.sync-conflict.<ext>,
                                              upload local as canonical
```

**What "changed" means:** the plugin records a SHA-256 hash of a file's content at the time of each successful sync (`lastSyncedHash`). On the next sync pass it recomputes the local hash and fetches the remote hash. Any deviation from `lastSyncedHash` is treated as a change.

---

## The tracking file (`.obsidian-sync.db`)

The plugin maintains a JSON file in your vault (default path: `.obsidian-sync.db`) with the list of tracked files and their last sync state. Example:

```json
{
  "connection": {
    "uri": "",
    "database": "obsidian-sync",
    "collection": "files"
  },
  "trackedFiles": [
    {
      "path": "notes/project.md",
      "lastSyncedHash": "a3f8c2d...",
      "lastSyncedAt": 1741200000000
    },
    {
      "path": "daily/2026-03-03.md",
      "lastSyncedHash": "b91e4c7...",
      "lastSyncedAt": 1741190000000
    }
  ]
}
```

The `uri` field in this file is intentionally left blank — credentials are stored separately in Obsidian's plugin data, not committed to the vault. You can safely add `.obsidian-sync.db` to version control if you want to share your sync configuration across machines.

---

## MongoDB document schema

Each file is stored as a single document in your collection, indexed by `path`:

```json
{
  "path": "notes/project.md",
  "content": "# Project\n\nMy notes...",
  "hash": "a3f8c2d1e4b5f6...",
  "lastModified": 1741200000000
}
```

A unique index on `path` is created automatically on first connection. To reset a file's remote state, delete its document from MongoDB and the next sync will re-upload it.

---

## Commands

| Command | Description |
|---|---|
| **Add file to sync** | Track the currently open file. Only shown when the file is not already tracked. |
| **Remove file from sync** | Stop tracking the currently open file. Only shown when the file is tracked. |
| **Sync now** | Immediately run a sync pass for all tracked files. |

All commands are accessible from the Command palette (`Cmd/Ctrl+P`). "Add to MongoDB sync" and "Remove from MongoDB sync" are also available by right-clicking any file in the file explorer.

---

## Status bar

The status bar item at the bottom-right of the window shows the current state:

| Status | Meaning |
|---|---|
| `Sync: Idle` | Plugin loaded, no sync has run yet |
| `Sync: Not configured` | No MongoDB URI has been entered |
| `Sync: Connected` | Successfully connected to MongoDB |
| `Sync: Connection failed` | Could not reach MongoDB with current settings |
| `Sync: Syncing...` | A sync pass is in progress |
| `Sync: Synced: N uploaded, M downloaded` | Last sync completed successfully |
| `Sync: Sync errors` | One or more files failed during the last sync |
| `Sync: Final sync...` | Plugin is unloading and performing a last sync |

---

## Conflict handling

When both the local file and the remote document have changed since the last sync:

1. The remote version is written to `<original-name>.sync-conflict.<ext>` in the same folder.
2. The local version is uploaded to MongoDB and becomes the new canonical version.
3. A notice appears in Obsidian pointing to the conflict file.

You can then diff the two files and manually merge, then delete the `.sync-conflict` copy.

---

## Development

### Install dependencies

```bash
npm install
```

### Watch build (dev)

```bash
npm run dev
```

Compiles `src/main.ts` → `main.js` in watch mode with inline source maps.

### Production build

```bash
npm run build
```

Type-checks with `tsc` then bundles with esbuild (minified, no source maps).

### Lint

```bash
npm run lint
```

### Project structure

```
src/
  main.ts       Plugin lifecycle: onload, onunload, commands, file menu, sync interval
  settings.ts   Settings tab UI (MongoDB URI, database, collection, interval, .db path)
  types.ts      TypeScript interfaces and default settings
  db.ts         Reads and writes the .obsidian-sync.db tracking file in the vault
  mongo.ts      MongoClient wrapper: connect, disconnect, upsertFile, fetchFile, listFiles
  sync.ts       Bidirectional sync engine with SHA-256 hashing and conflict detection
```

### Releasing

1. Update `version` in `manifest.json` and add an entry to `versions.json`.
2. Run `npm run build` to produce `main.js`.
3. Create a GitHub release tagged with the exact version number (no `v` prefix).
4. Attach `manifest.json`, `main.js`, and `styles.css` as release assets.

---

## Privacy and security

- The MongoDB URI (containing credentials) is stored in Obsidian's internal plugin data via `saveData()` / `loadData()`, not in the vault.
- No telemetry or analytics of any kind are collected.
- Only files you explicitly add to sync are ever read or transmitted. The plugin never scans your entire vault.
- File contents are stored as plain text in your MongoDB collection. Use MongoDB Atlas's built-in encryption-at-rest, or self-host with disk encryption, if the content is sensitive.

---

## Troubleshooting

**Plugin fails to enable with "Cannot find module ..." error**

The plugin requires certain npm packages to be bundled. Run `npm run build` from the plugin folder and reload Obsidian.

**Status shows "Connection failed"**

- Double-check your connection URI, including username, password, and cluster hostname.
- Ensure your IP address is whitelisted in MongoDB Atlas (**Network Access → IP Access List**).
- For Atlas free-tier clusters, make sure the cluster is not paused.

**Files are not syncing**

- Confirm the file was added with "Add file to sync" (check the `.obsidian-sync.db` file to see the `trackedFiles` list).
- Confirm the status bar shows `Sync: Connected` or run "Sync now" and observe the result.

**Conflict files keep appearing**

This means the same file is being edited on multiple machines before a sync has a chance to run. Reduce the sync interval in settings to minimize the window for conflicts.

**I want to stop syncing a file and remove it from MongoDB**

1. Right-click the file → "Remove from MongoDB sync" (removes it from local tracking).
2. Manually delete the corresponding document from your MongoDB collection if you also want to remove the remote copy.
