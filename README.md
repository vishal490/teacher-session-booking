# Teacher session booking API

Node.js 22+, TypeScript, Express 4, MongoDB 8, Mongoose 8. No frontend or authentication is included.

## Run locally

From `D:\backend applying` (or any checkout directory):

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d
npm run seed
npm run dev
```

Docker is optional: use a local MongoDB installation or an Atlas URI in `.env` instead. The seed command prints teacher IDs; copy one into Postman. Seeding is idempotent by email and preserves existing teachers. Startup creates required indexes before serving requests. A database account needs index-creation permission.

```powershell
npm run typecheck
npm run build
npm start
npm test
```

Tests start an isolated MongoDB using mongodb-memory-server; the first run downloads a MongoDB binary and needs network access. No application database is used. Configuration is validated at startup: `MONGODB_URI` is required, `PORT` defaults to 3000, and `NODE_ENV` defaults to development. `/health` provides liveness; `/ready` checks the database connection state.

Dependency installation was blocked by this build session's network policy (`EACCES` accessing registry.npmjs.org). Consequently no lockfile was generated and compilation/integration tests could not be executed here. Run the commands above in a network-enabled environment and commit the generated `package-lock.json` before using `npm ci` for reproducible installs.

## API

Successful responses use `{ "data": ... }`; error responses use `{ "error": { "code", "message", "requestId", "details"? } }`. Every response includes `X-Request-Id`.

| Method/path | Body or query | Success |
|---|---|---|
| POST /users | `fullName`, `email`, `phone` | 201 user |
| POST /sessions | `teacherId`, `startTime`, `endTime` | 201 session |
| GET /sessions/available | `dateTimestamp`, optional `page=1`, `limit=20` | 200 session array with teacher details |
| POST /sessions/:id/book | `userId` | 200 updated session |
| PATCH /sessions/:id/complete | empty body or `{}` | 200 updated session |
| GET /users/:id/sessions | optional `upcomingPage=1`, `completedPage=1`, `limit=20` | 200 object containing `upcomingSessions`, `completedSessions`, `pagination` |

All body fields listed are required. Dates are ISO 8601 strings with an explicit timezone (`2099-01-01T12:00:00Z`). IDs must be 24 hexadecimal characters. Unknown body/query fields are rejected. Phone is a nonempty string, preserving international formats; experience is years. Emails are trimmed and lowercased. List limit is 1–100; pages are 1–10000. Responses do not include total counts.

Status codes: 400 validation/malformed JSON, 404 missing record/route, 409 duplicate email or invalid state transition, 413 oversized body, 500 unexpected failure. When both user and session are missing, booking reports the missing user first.

## Assumptions

- `dateTimestamp` is Unix **milliseconds** and identifies a **UTC calendar day**. Values before 1973 are rejected to catch common seconds inputs. Filtering uses session start time in `[00:00 UTC, next day 00:00 UTC)`; cross-midnight sessions belong to the day they start.
- Upcoming means BOOKED with `startTime >= request time`. Past BOOKED sessions are excluded from both lists. Completed sessions are sorted by completion time descending; upcoming and available sessions by start time ascending. IDs break sorting ties.
- Lifecycle is AVAILABLE → BOOKED → COMPLETED. No cancellation, deletion, rescheduling, authentication or teacher management endpoint is required.
- The assignment permits booking past available sessions, overlapping teacher sessions, and completing before the end time; these are intentionally not restricted. Status transitions are still enforced.
- Session creator cannot set user/status/completion fields. There is no public user or teacher deletion path; reference existence checks assume that constraint.
- Teacher email is also unique to make seed execution safe and repeatable.

## Postman

Import `postman/booking.postman_collection.json`. Set collection variable `teacherId` from seed output. Run the collection in order: successful creation requests capture user/session IDs automatically. A pre-request script sets a future UTC session day. Failure cases follow the happy path and assert their expected HTTP status. Re-running creates a fresh email and session. The collection contains no credentials.

See [low-level design](docs/low-level-design.md) for component boundaries, concurrency guarantees, indexes and scaling tradeoffs.
