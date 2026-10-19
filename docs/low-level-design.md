# Low-level design

## Scope and boundaries

A modular monolith serves JSON over HTTP. Stateless instances share MongoDB. Modules own business operations; transport validation occurs before services execute. The implementation uses routes containing small controller handlers, services for use cases, a session repository for conditional updates/availability queries, and shared Mongoose models. Simple user inserts and existence checks use models directly to avoid pass-through repositories. Dependencies flow from routes → services → repository/models; business services do not reference Express.

```
src/app.ts                 middleware, routers, health, errors
src/server.ts              configuration, connection, indexes, shutdown
src/config/                environment validation and database lifecycle
src/models/                User, Teacher, Session schemas and indexes
src/modules/users/         user creation and history aggregation
src/modules/sessions/      session creation, transitions, availability
src/shared/                errors, request context, validation
src/scripts/               idempotent teacher provisioning
tests/                     isolated database integration tests
```

## Persistence contract

All models have MongoDB `_id` and Mongoose `createdAt`/`updatedAt` timestamps. User stores fullName, normalized unique email and phone. Teacher stores fullName, normalized unique email, specialization and nonnegative experience. Session stores required teacherId, nullable userId, startTime, endTime, enum status and nullable completedAt. References use ObjectIds. New sessions have AVAILABLE/null/null state. Schema constraints protect basic storage types; API schemas enforce required input, strict fields, explicit-offset dates, and temporal ordering. Direct database writes must maintain business invariants independently.

| Collection/index | Purpose |
|---|---|
| users email unique | Race-safe duplicate prevention after normalization |
| teachers email unique | Concurrent idempotent seeding |
| sessions status/startTime/_id | Date range, stable available ordering |
| sessions userId/status/startTime/_id | User selection and future booking access |
| sessions userId/status/completedAt descending/_id descending | Completion access and ordering |

Indexes are created explicitly at startup and seed time without dropping indexes. For larger deployments move provisioning to a release job with a separate privileged DB account. Verify query plans and index usage with representative production data before expanding indexes.

## Request flows and invariants

User creation validates and normalizes input, inserts once, and converts duplicate-key failures into 409. There is no check-then-insert race.

Session creation validates the range and teacher ID, checks teacher existence, and inserts a session with server-owned default state. Teacher/user deletion is not exposed. Introducing deletion requires reference policy (soft deletion or transactional coordination) because MongoDB does not enforce foreign keys.

Booking checks the user, then executes `findOneAndUpdate({_id, status: 'AVAILABLE'}, {$set: {status: 'BOOKED', userId}}, {new: true})`. The single-document write is the linearization point. Only one competing request matches AVAILABLE. A losing request cannot overwrite userId. If no document matches, an existence lookup distinguishes 404 from 409. Completion similarly matches BOOKED and atomically writes COMPLETED and completedAt. No transaction is needed for these single-document state changes. Retries after a lost response can return 409; request idempotency keys would be a separate requirement.

## Aggregation design

Availability computes UTC day bounds in application code, then uses `$match` on status/startTime, `$sort`, `$skip`, `$limit`, a teacher `$lookup` with a safe projection, and `$set` to flatten the teacher. Lookup happens after pagination. Teacher email is not exposed by the join. Query dates become native BSON dates through the MongoDB driver.

History verifies the user and explicitly casts the aggregation userId to ObjectId (Mongoose does not automatically cast pipeline literals). An initial `$match` limits records to the user, then `$facet` creates separately filtered, sorted and paginated upcoming/completed arrays. The clock is sampled once. Past booked sessions are omitted. The initial user filter uses an index, but sorts inside `$facet` cannot independently use both sort indexes and can scan a large user's history. The bounded output avoids oversized responses; it does not bound facet work. At high per-user cardinality, replace the facet with two indexed pipelines/queries or a materialized read model and use cursor pagination. Offset paging may shift under concurrent inserts and its cost grows with the offset.

## HTTP and operational design

Strict Zod schemas reject invalid bodies, IDs, timestamps, unknown fields and pagination. Explicit field construction prevents mass assignment. Central error middleware provides stable codes and request IDs, hides stacks, and maps MongoDB duplicate keys. JSON bodies are limited to 16 KB; Helmet sets standard security headers. Logs include method, path, status and elapsed time and omit request bodies/query strings. Log retention/redaction and metrics integration belong to deployment operations.

The server validates environment variables, connects MongoDB, provisions indexes, then listens. SIGTERM/SIGINT stop new HTTP connections and disconnect the database after outstanding requests drain, with a 10-second exit deadline. Each instance uses a bounded connection pool (20). Readiness tests driver connection state rather than issuing a database ping. Authentication, authorization and rate limiting are outside assignment scope; production teacher writes and user history access require explicit caller authorization before public exposure.

## Growth and tradeoffs

Scale API replicas behind a load balancer; total connection pools must fit MongoDB connection capacity. Use a replica set and select write concern/retry policy based on durability requirements. Atomic conditional updates retain correctness across replicas of the API. Avoid an availability cache until invalidation on booking is designed; cached availability is advisory and the booking write remains authoritative. Add metrics for booking conflict rate, query latency, pool wait time and database failures. Introduce queues/outbox only when adding notifications or integrations; external side effects must not run inside the booking write path without delivery semantics.

No generic repository framework, distributed locks, event bus or microservices are needed for these operations. Future cancellation/rescheduling should introduce explicit transitions and concurrency predicates, with audit history if required. Resource authorization and teacher overlap rules need their own product decisions.

## Validation strategy

Integration tests use an isolated real MongoDB process, exercise the HTTP stack, and verify concurrent booking (one winner among ten requests), duplicate normalized emails, validation, missing references, lifecycle conflicts, UTC boundaries, pagination, history classification and user isolation. TypeScript strict compilation checks application code. Postman provides an independent runnable happy path plus representative failures. Test binaries are downloaded on first use; an offline machine needs a preinstalled MongoDB binary/cache.
