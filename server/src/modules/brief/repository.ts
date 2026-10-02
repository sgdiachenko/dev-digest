import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { parseStoredBrief, type StoredBrief } from './helpers.js';

/**
 * PR Brief data-access — the ONLY layer touching `pr_brief`. The row is just
 * `(pr_id, json)`; the document inside carries its own `schema_version`, so a
 * schema change never needs a migration: an older / corrupted document simply
 * reads as "no brief".
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /** The stored document, or `null` when absent, from an older schema version, or corrupted. */
  async get(prId: string): Promise<StoredBrief | null> {
    const [row] = await this.db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row ? parseStoredBrief(row.json) : null;
  }

  /** One upsert: the previous document is replaced atomically, never half-written. */
  async replace(prId: string, doc: StoredBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: doc })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: doc } });
  }
}
