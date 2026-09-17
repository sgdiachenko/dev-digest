import { z } from 'zod';

/**
 * Shared route param schemas. Most `/:id` routes address a DB row whose primary
 * key is a uuid (see db/schema/*), so validate that shape at the edge — an
 * invalid id becomes a clean 422 instead of a downstream DB/500.
 *
 * NOTE: not every `:id` is a uuid (e.g. `/providers/:id` where id is a provider
 * name like "openai"); those routes use their own schema.
 */
export const IdParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof IdParams>;

/**
 * Shared response schemas for the trivial acks.
 *
 * Every route declares a `response` schema (see server/AGENTS.md): it is the
 * DTO boundary, so a handler cannot accidentally serialize a whole DB row, and
 * a contract change that the response no longer satisfies fails loudly instead
 * of silently reshaping the JSON the client receives.
 */
export const OkAck = z.object({ ok: z.boolean() });
export type OkAck = z.infer<typeof OkAck>;

export const DeletedAck = z.object({ deleted: z.string() });
export type DeletedAck = z.infer<typeof DeletedAck>;
