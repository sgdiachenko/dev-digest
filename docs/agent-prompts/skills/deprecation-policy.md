# Deprecation Policy

When the diff retires or replaces a public contract, ask whether consumers got a
usable migration path and enough supported time to take it. This is not a second
pass on whether the change breaks a caller — it judges how the producer
announced and staged the transition.

Applies when a route, a wire DTO field, or a supported export is deprecated,
removed, renamed, replaced, or loses a compatibility alias — and when its
meaning changes behind a stable name and shape.

Require each of these, and report it as present, missing, or unverified:

- **Marker** — a notice on the channel the affected consumer actually reads
  (API or release docs, TSDoc `@deprecated`, OpenAPI `deprecated`, an HTTP
  `Deprecation` header). A marker added in the same release that removes the
  contract is not advance notice.
- **Replacement** — an available alternative with its differences and limits
  stated, or an explicit reason the capability goes away with no successor.
- **Migration path** — concrete before/after steps for the request, response,
  import, and deployment order that actually change.
- **Timeline** — a date, a version, or an explicit removal condition, or an
  explicit "removal is not scheduled". "Soon" is not a timeline.
- **Compatibility window** — the old contract still works for the promised
  interval; for a removal, the earlier notice shipped and the window elapsed.

Deprecating must not change the old resource's behaviour, and a redirect or
alias counts as compatibility only once method, body, status, errors, and
semantics still hold for the old caller. A changelog entry, a version bump, or
updating the bundled UI is not a migration path. This repo publishes no
deprecation window — report a missing one as unverified rather than inventing
30, 90, or 180 days.

A removal with no notice and no shim is CRITICAL. A missing or vague timeline,
replacement, or window on an otherwise staged deprecation is a WARNING. Merge
the finding with the breaking-change one when both describe the same change.
