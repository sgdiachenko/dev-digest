# House rule: no `.then()` chains

This codebase uses `async`/`await` exclusively. A `.then()`/`.catch()` chain
introduced in new or changed TypeScript code (outside a genuinely one-shot
fire-and-forget call) is a convention violation — flag it as a SUGGESTION and
suggest the `async`/`await` rewrite. Do not flag existing `.then()` chains the
diff did not touch.
