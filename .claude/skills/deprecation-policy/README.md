# Deprecation Policy — sources and rationale

This README records the sources used to build the skill. Last verified:
**2026-09-18**. It summarizes the relevant rule and its limits so future edits
do not turn a project-specific example into a universal policy.

| Source | Used for | Limits |
|---|---|---|
| [Semantic Versioning 2.0.0, §1, §4, §7–8 and deprecation FAQ](https://semver.org/spec/v2.0.0.html) | Stable SemVer APIs: deprecation is at least minor, incompatible removal is major, and removal should follow a minor release containing the notice. | Does not prescribe days. `0.x` is unstable, and a private package version does not automatically version an HTTP API. |
| [RFC 9745, §2–5](https://www.rfc-editor.org/rfc/rfc9745.html) | `Deprecation` Structured Fields date, `rel="deprecation"`, scope, relationship to `Sunset`, and unchanged behavior during deprecation. | Defines HTTP signaling, not a universal compatibility period or a requirement for non-HTTP exports. |
| [RFC 8594, §1.4, §3, §5–6](https://www.rfc-editor.org/rfc/rfc8594.html) | `Sunset` uses HTTP-date and signals when a URI is expected to become unresponsive. | Informational RFC; the timestamp is a hint and does not guarantee availability or a particular post-sunset response. |
| [OpenAPI 3.1.1, Operation, Parameter and Header Objects](https://spec.openapis.org/oas/v3.1.1.html) | `deprecated: true` can mark operations, parameters, and headers. | Metadata does not preserve compatibility or provide a complete migration guide. Do not require OpenAPI where the project does not use it. |
| [TSDoc `@deprecated`](https://tsdoc.org/pages/tags/deprecated/) | Mark a public programmatic API and name its recommended alternative. | Does not establish a removal date or preserve runtime behavior; consumers must receive the annotation. |
| [Google AIP-180](https://google.aip.dev/180) | Distinguish source, wire, and semantic compatibility. | Google guidance is primarily framed around protobuf/JSON and independently deployed consumers. |
| [Google AIP-181](https://google.aip.dev/181) | Stability level changes expectations; stable API turn-down needs a defined process; emergency changes exist. | Google policy is not dev-digest's SLA. Its beta timing examples are not a universal deprecation window. |
| [Google AIP-192, Deprecations](https://google.aip.dev/192#deprecations) | A deprecation note should provide alternatives or explain why none exists. | The exact protobuf option and comment syntax do not apply literally to TypeScript. |
| [Kubernetes Deprecation Policy, Rules #3–4 and #7–8](https://kubernetes.io/docs/reference/deprecation-policy/) | Example of measurable support windows, replacement stability, version overlap, rollback, and stored-data concerns. | Kubernetes uses different periods by API kind and stability. Its numeric windows are not defaults for this repository. |

The five-part checklist, lifecycle verdicts, evidence states, report shape, and
security-exception record are local policy proposed for this skill. They are
not claims made verbatim by one source and do not establish a release SLA.

The full research, including extended examples and validation scenarios, is in
[`docs/deprecation-policy/research.md`](../../../docs/deprecation-policy/research.md),
with its source ledger in
[`docs/deprecation-policy/sources.md`](../../../docs/deprecation-policy/sources.md).
