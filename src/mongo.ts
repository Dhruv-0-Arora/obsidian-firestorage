import { MongoClient, Collection } from "mongodb"
import { RemoteFileDoc } from "./types"

/**
 * provider methods for interacting with MongoDB collection
 */
export class MongoService {
    private client: MongoClient | null = null // NOTE: single instance per connection
    private collection: Collection<RemoteFileDoc> | null = null // Collection reference of cluster

    /**
     * Initalizes connection and sets up collection reference
     *
     * @param uri - MongoDB connection URI
     * @param database - Database name
     * @param collectionName - Collection name to store file metadata
     */
    async connect(
        uri: string,
        database: string,
        collectionName: string
    ): Promise<void> {
        await this.disconnect()
        this.client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 10_000,
            connectTimeoutMS: 10_000,
        })
        await this.client.connect()
        const db = this.client.db(database)
        this.collection = db.collection<RemoteFileDoc>(collectionName)
        await this.collection.createIndex({ path: 1 }, { unique: true })
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            try {
                await this.client.close()
            } catch {
                // best-effort close
            }
            this.client = null
            this.collection = null
        }
    }

    isConnected(): boolean {
        return this.client !== null && this.collection !== null
    }

    /**
     * Updates remote file data. Inserts if non-existent.
     *
     * @param doc - local file metadata
     */
    async upsertFile(doc: RemoteFileDoc): Promise<void> {
        this.ensureConnected()
        await this.collection!.updateOne(
            { path: doc.path },
            { $set: doc },
            { upsert: true }
        )
    }

    async fetchFile(path: string): Promise<RemoteFileDoc | null> {
        this.ensureConnected()
        return await this.collection!.findOne({ path })
    }

    async deleteFile(path: string): Promise<void> {
        this.ensureConnected()
        await this.collection!.deleteOne({ path })
    }

    async listFiles(): Promise<RemoteFileDoc[]> {
        this.ensureConnected()
        return await this.collection!.find({}).toArray()
    }

    private ensureConnected(): void {
        if (!this.collection) {
            throw new Error("MongoDB is not connected")
        }
    }
}
