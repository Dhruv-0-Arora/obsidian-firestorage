import { MongoClient, Collection } from "mongodb";
import { RemoteFileDoc } from "./types";

export class MongoService {
	private client: MongoClient | null = null;
	private collection: Collection<RemoteFileDoc> | null = null;

	async connect(
		uri: string,
		database: string,
		collectionName: string,
	): Promise<void> {
		await this.disconnect();
		this.client = new MongoClient(uri, {
			serverSelectionTimeoutMS: 10_000,
			connectTimeoutMS: 10_000,
		});
		await this.client.connect();
		const db = this.client.db(database);
		this.collection = db.collection<RemoteFileDoc>(collectionName);
		await this.collection.createIndex({ path: 1 }, { unique: true });
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			try {
				await this.client.close();
			} catch {
				// best-effort close
			}
			this.client = null;
			this.collection = null;
		}
	}

	isConnected(): boolean {
		return this.client !== null && this.collection !== null;
	}

	async upsertFile(doc: RemoteFileDoc): Promise<void> {
		this.ensureConnected();
		await this.collection!.updateOne(
			{ path: doc.path },
			{ $set: doc },
			{ upsert: true },
		);
	}

	async fetchFile(path: string): Promise<RemoteFileDoc | null> {
		this.ensureConnected();
		return await this.collection!.findOne({ path });
	}

	async deleteFile(path: string): Promise<void> {
		this.ensureConnected();
		await this.collection!.deleteOne({ path });
	}

	async listFiles(): Promise<RemoteFileDoc[]> {
		this.ensureConnected();
		return await this.collection!.find({}).toArray();
	}

	private ensureConnected(): void {
		if (!this.collection) {
			throw new Error("MongoDB is not connected");
		}
	}
}
