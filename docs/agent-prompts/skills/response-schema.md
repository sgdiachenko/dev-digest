# Response Schema Compatibility

Compare the body an old client already parses with what the new code actually
serializes: the route's `response` schema is the contract, not the handler's
return type. Cover every variant — success, each error body, nested objects,
and array items.

Check recursively, per field path (`$.items[*].author.name`):

- **Removed** — did the old contract guarantee the field? Name the read that
  breaks.
- **Renamed** — removal plus addition. An internal `camelCase` variable that
  still serializes to the same `snake_case` key is not a wire change.
- **Required → optional** — the old reader can no longer rely on presence.
  Withdrawing a promised field is incompatible even when today's data still
  fills it.
- **Optional → required** — usually compatible (a stronger promise), but verify
  every branch really supplies it, or the new schema rejects its own response.
  Do not judge an output by request-validation rules.
- **Type or shape** — JSON type, nullability, scalar vs object vs array, item
  type, a new enum member, a discriminator, promised formats such as date-time.

Presence and nullability are independent: `{}` and `{ "name": null }` are not
the same body. The serializer strips unknown keys, so a compatibility alias the
handler still returns but the schema no longer declares never reaches the wire.

Adding a field is compatible for a tolerant reader — report strict unknown-key
rejection only with evidence of such a client, not a hypothetical one. Anchor
each finding to `file:line`, the JSON path, and the old → new shape: a removed
or retyped guaranteed field is CRITICAL, an old guarantee you could not verify
is a SUGGESTION.
