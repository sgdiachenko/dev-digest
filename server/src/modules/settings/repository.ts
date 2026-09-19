import { eq } from 'drizzle-orm';
import type { Settings } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { rowsToSettings } from './helpers.js';

/**
 * Settings data-access. The only place this module touches Drizzle.
 *
 * Settings are stored as key/value rows and collapsed into one `Settings`
 * object at this boundary, so nothing above deals with the row shape.
 */
export class SettingsRepository {
  constructor(private db: Db) {}

  async get(workspaceId: string): Promise<Settings> {
    const rows = await this.db
      .select()
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return rowsToSettings(rows);
  }

  /** Upsert each supplied key, then return the full merged settings. */
  async update(
    workspaceId: string,
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.db
        .insert(t.settings)
        .values({ workspaceId, userId, key, value })
        .onConflictDoUpdate({
          target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
          set: { value },
        });
    }
    return this.get(workspaceId);
  }
}
