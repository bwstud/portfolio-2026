# Portfolio site

Static site (HTML, CSS, vanilla JS, no build step) deployed on Vercel. `.vercelignore` is an
allowlist: only `index.html`, `styles.css`, `nav.js`, `fonts/`, `reels/` and `tinkering/` ship.
`.env.local` and `.vercel/` are local only, so don't touch them.

## Work log

This project is worked on from two Macs. `work-logs/` is the single running log for both, so
treat it as one continuous record.

- **Start of session:** if the working tree is clean, `git pull`. Then read the newest file or
  two in `work-logs/` (sorted by name, which is chronological) to see what the other machine
  did last, including its "Next steps".
- **One file per session**, named `YYYY-MM-DD-<first 8 chars of the session ID>.md`, dated
  the day the session started. Later in the same session, update that file instead of starting
  another one.
- **Format:** match the newest log. That means an `# Portfolio 2026 — <title>` heading, a
  Date / Session / Branch and commit / Written list, then Goals, Starting state, Work done,
  Challenges and how we solved them, Unsolved problems, Ending state and Next steps.
- **Two copies:** write the same file to `~/.claude/work-logs/` too, under the same name.
- **When to write:** when the user asks ("log it", "log our work"), when work ships, before
  compaction, and at wrap-up.
- **Commit and push:** commit the log with the work it describes. A log-only commit goes on
  the current branch with a message starting `Work log:`, and is pushed straight away so the
  other machine can pull it.
