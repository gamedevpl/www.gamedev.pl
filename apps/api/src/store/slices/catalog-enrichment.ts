import type { Firestore } from '@google-cloud/firestore';
import type { CatalogEnrichmentRecord } from '../records/catalog-enrichment.js';

export interface CatalogEnrichmentStore {
  // Read enrichment by slug.
  getCatalogEnrichment(slug: string): Promise<CatalogEnrichmentRecord | null>;

  // Persist enrichment for a slug.
  setCatalogEnrichment(record: CatalogEnrichmentRecord): Promise<void>;

  // List all stored enrichments.
  listCatalogEnrichments(): Promise<CatalogEnrichmentRecord[]>;
}

export class InMemoryCatalogEnrichmentStore implements CatalogEnrichmentStore {
  private enrichments = new Map<string, CatalogEnrichmentRecord>();

  async getCatalogEnrichment(slug: string): Promise<CatalogEnrichmentRecord | null> {
    const record = this.enrichments.get(slug);
    return record ? { ...record } : null;
  }

  async setCatalogEnrichment(record: CatalogEnrichmentRecord): Promise<void> {
    this.enrichments.set(record.slug, { ...record });
  }

  async listCatalogEnrichments(): Promise<CatalogEnrichmentRecord[]> {
    return Array.from(this.enrichments.values()).map((record) => ({ ...record }));
  }
}

export class FirestoreCatalogEnrichmentStore implements CatalogEnrichmentStore {
  constructor(private db: Firestore) {}

  async getCatalogEnrichment(slug: string): Promise<CatalogEnrichmentRecord | null> {
    const snap = await this.db.collection('catalogEnrichment').doc(slug).get();
    if (!snap.exists) return null;
    return snap.data() as CatalogEnrichmentRecord;
  }

  async setCatalogEnrichment(record: CatalogEnrichmentRecord): Promise<void> {
    await this.db.collection('catalogEnrichment').doc(record.slug).set(record);
  }

  async listCatalogEnrichments(): Promise<CatalogEnrichmentRecord[]> {
    const snap = await this.db.collection('catalogEnrichment').get();
    return snap.docs.map((doc) => doc.data() as CatalogEnrichmentRecord);
  }
}
