# Queue Backend

adluv no longer uses Dragonfly or BullMQ.

Background jobs are stored in the `jobs` table in MySQL and are claimed by the worker with row-level locking. The current queue entry points are:

- `apps/app/lib/queues.ts`
- `apps/worker/src/queue.ts`
- `apps/worker/src/index.ts`

Operational implications:

- Redis and Dragonfly are not runtime dependencies anymore.
- Queue health now follows database health.
- Deployment checks should verify `/api/health`, `yarn db:verify`, and recent worker logs instead of Redis mode.

Any remaining Dragonfly or BullMQ references should be treated as historical notes and removed when touched.
