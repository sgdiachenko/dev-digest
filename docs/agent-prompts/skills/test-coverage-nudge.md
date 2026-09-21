# Test Coverage Nudge

When a diff adds a new branch (an `if`, a `catch`, an early return, a new
conditional) with no accompanying test that exercises it, say so — name the
specific branch and the file/line, and suggest the missing input/case. Do not
demand 100% coverage; only flag a branch that is plausible to hit in production
and would silently break if it regressed.
