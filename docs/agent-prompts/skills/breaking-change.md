# Breaking Change Checklist

Answer one question for every changed public operation: **will a currently
shipped caller stop working after this diff?** Review the new server against the
old caller's contract — a client updated in the same PR does not protect an
already deployed one.

Inventory what changed as HTTP method + full registered path (including the
Fastify prefix) plus the shared DTOs it serializes, then check each of:

- **Route gone or moved** — the old method + path removed, renamed, or
  re-prefixed with nothing equivalent left at the old address.
- **Request narrowed** — an optional `params`/`body`/query field became
  required, a default dropped, accepted values or bounds tightened, or a field
  renamed so old payloads are rejected (or silently ignored, which is worse).
- **Response narrowed** — a field an old reader relies on removed or renamed
  (nested fields and error bodies included), a type, nullability, or enum
  changed, an array wrapped in an envelope.
- **Status or semantics changed** — a success code an old caller branches on, a
  domain error mapped to a different code, or changed defaults, ordering,
  pagination, units, or completion guarantees behind an unchanged shape.

Compatibility is directional: narrowing what is accepted breaks writers,
widening what is returned breaks strict readers. A new route, a new optional
request field, and — for a tolerant reader — a new response field are additive;
do not report them.

For every finding give the old request or old reader expectation, the new
behaviour that violates it, and the `file:line` that introduced it. A confirmed
break is CRITICAL. When the old contract cannot be established from the diff,
say so as a SUGGESTION — never present an unverified suspicion as a confirmed
break.
