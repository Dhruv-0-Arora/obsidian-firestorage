import { createHash } from "crypto";
import { Notice, Vault } from "obsidian";
import { SyncDbManager } from "./db";
import { MongoService } from "./mongo";
import { RemoteFileDoc, TrackedFile } from "./types";

export interface SyncResult {
	uploaded: number;
	downloaded: number;
	conflicts: number;
	errors: string[];
}

export function computeHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export class SyncEngine {
	private vault: Vault;
	private db: SyncDbManager;
	private mongo: MongoService;
	private syncing = false;

	constructor(vault: Vault, db: SyncDbManager, mongo: MongoService) {
		this.vault = vault;
		this.db = db;
		this.mongo = mongo;
	}

	isSyncing(): boolean {
		return this.syncing;
	}

	async syncAll(): Promise<SyncResult> {
		if (this.syncing) {
			return { uploaded: 0, downloaded: 0, conflicts: 0, errors: ["Sync already in progress"] };
		}
		if (!this.mongo.isConnected()) {
			return { uploaded: 0, downloaded: 0, conflicts: 0, errors: ["MongoDB not connected"] };
		}

		this.syncing = true;
		const result: SyncResult = { uploaded: 0, downloaded: 0, conflicts: 0, errors: [] };

		try {
			const tracked = this.db.getTrackedFiles();
			for (const entry of tracked) {
				try {
					await this.syncFile(entry, result);
				} catch (e) {
					result.errors.push(`${entry.path}: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
			await this.db.save();
		} finally {
			this.syncing = false;
		}
		return result;
	}

	private async syncFile(entry: TrackedFile, result: SyncResult): Promise<void> {
		const localExists = await this.vault.adapter.exists(entry.path);
		const remote = await this.mongo.fetchFile(entry.path);

		const localContent = localExists
			? await this.vault.adapter.read(entry.path)
			: null;
		const localHash = localContent !== null ? computeHash(localContent) : null;
		const remoteHash = remote?.hash ?? null;
		const lastSynced = entry.lastSyncedHash;

		if (localContent !== null && remote === null) {
			await this.upload(entry.path, localContent);
			result.uploaded++;
			return;
		}

		if (localContent === null && remote !== null) {
			await this.download(entry.path, remote);
			result.downloaded++;
			return;
		}

		if (localContent === null && remote === null) {
			return;
		}

		if (localHash === remoteHash) {
			this.db.updateSyncState(entry.path, localHash!);
			return;
		}

		const localChanged = localHash !== lastSynced;
		const remoteChanged = remoteHash !== lastSynced;

		if (localChanged && !remoteChanged) {
			await this.upload(entry.path, localContent!);
			result.uploaded++;
		} else if (!localChanged && remoteChanged) {
			await this.download(entry.path, remote!);
			result.downloaded++;
		} else {
			await this.handleConflict(entry.path, localContent!, remote!);
			result.conflicts++;
		}
	}

	private async upload(path: string, content: string): Promise<void> {
		const hash = computeHash(content);
		const doc: RemoteFileDoc = {
			path,
			content,
			hash,
			lastModified: Date.now(),
		};
		await this.mongo.upsertFile(doc);
		this.db.updateSyncState(path, hash);
	}

	private async download(path: string, remote: RemoteFileDoc): Promise<void> {
		const parentDir = path.substring(0, path.lastIndexOf("/"));
		if (parentDir) {
			const dirExists = await this.vault.adapter.exists(parentDir);
			if (!dirExists) {
				await this.vault.adapter.mkdir(parentDir);
			}
		}
		await this.vault.adapter.write(path, remote.content);
		this.db.updateSyncState(path, remote.hash);
	}

	private async handleConflict(
		path: string,
		_localContent: string,
		remote: RemoteFileDoc,
	): Promise<void> {
		const ext = path.lastIndexOf(".") !== -1 ? path.substring(path.lastIndexOf(".")) : "";
		const base = ext ? path.substring(0, path.lastIndexOf(".")) : path;
		const conflictPath = `${base}.sync-conflict${ext}`;

		await this.vault.adapter.write(conflictPath, remote.content);
		new Notice(`Sync conflict for ${path} — remote version saved as ${conflictPath}`);

		// Upload local version as the canonical version
		await this.upload(path, _localContent);
	}
}
