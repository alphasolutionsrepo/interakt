## What and why

<!-- One or two sentences. Link the issue if there is one: Closes #123 -->

## How was this tested?

<!-- Commands you ran and what you observed. CI covers lint · type-check · test, so say what you
     exercised by hand, especially anything touching search providers, migrations, auth or the
     chat pipeline. -->

## Checklist

- [ ] `npm run lint`, `npm run type-check` and `npm test` pass in `backend/`
- [ ] Tests added or updated for non-trivial logic
- [ ] Schema change: the migration **and** `meta/_journal.json` are committed together
- [ ] Docs updated in `backend/src/content/docs/` if behaviour or the API changed
- [ ] Title and description match what the diff actually does
