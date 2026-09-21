# Wire Format Convention

`@devdigest/shared` contract/DTO fields are `snake_case` on the wire — this
matches the DB/JSON shape, regardless of the surrounding TS convention. A field
added to `vendor/shared/contracts/*` in `camelCase`, or a route response built
without going through the shared DTO mapper, is a convention violation: flag it
as a WARNING and name the correct `snake_case` field name.
