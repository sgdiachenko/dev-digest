import { z } from 'zod';

/**
 * Lenient schema handed to `completeStructured`: every section nullable, no
 * length limits (those are checked per section in `groundNarrative` so one bad
 * section falls back instead of failing the whole generation).
 */
export const NarrativeModelOutput = z.object({
  architecture: z
    .object({ body_markdown: z.string(), diagram_mermaid: z.string().nullable() })
    .nullable(),
  critical_paths: z.array(z.object({ path: z.string(), description: z.string() })).nullable(),
  run_locally: z
    .array(z.object({ command_id: z.string(), note: z.string().nullable() }))
    .nullable(),
  reading_path: z.array(z.object({ path: z.string(), description: z.string() })).nullable(),
  first_tasks: z
    .array(
      z.object({
        task_id: z.string(),
        title: z.string(),
        description: z.string(),
        complexity: z.string(),
      }),
    )
    .nullable(),
});
export type NarrativeModelOutput = z.infer<typeof NarrativeModelOutput>;
