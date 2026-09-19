# Flaky Test Signals

Flag a new or changed test that depends on real wall-clock time (`Date.now()`,
`new Date()`), a real timer (`setTimeout`/`setInterval`) without fake timers,
or unseeded randomness to decide a pass/fail assertion. Name the specific
non-deterministic source and suggest the deterministic replacement (an
injected clock, `vi.useFakeTimers()`, or a seeded RNG).
