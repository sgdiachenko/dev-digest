# Secret Leakage Gate

Scan the diff for credential-shaped strings introduced or left in place:
`sk_live_...`, `ghp_...`, `AIza...`, a JWT (`eyJ...`), a private key block
(`-----BEGIN...KEY-----`), or an obvious `API_KEY = "..."` / `password = "..."`
literal. Any match is CRITICAL — secrets in source are a production incident, not
a style issue, regardless of whether the PR description calls it a "demo" or
"fake" value.
