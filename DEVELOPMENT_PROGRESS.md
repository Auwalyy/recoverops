# RecoverOS — development progress

This file is the hand-over checkpoint between sessions. Update it at the end of every phase.

## Status overview

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | npm workspaces monorepo, shared contracts, env validation, logging, health, Docker Compose, Dockerfile | ✅ Done (Docker files not executed — Docker not installed on the dev machine) |
| 2 Auth & access control | JWT + rotating refresh tokens w/ reuse detection, sessions, lockout, reset, verification, invitations, permission registry, principal resolution, tenant guard, care-team/department scopes, caregiver consent, break-glass, audit | ✅ Done + tested |
| 3 Core recovery domain | Patients, episodes (state machine), discharge plans (versions, approvals, amendments, immutability), recovery plan engine (timezone/DST, idempotent), medication orders/schedules/events, tasks | ✅ Done + tested |
| 6 Monitoring & escalation | Check-in templates & check-ins, symptoms, alert rules (clinical approval, separation of duties), alert lifecycle, escalation (job + sweep), notifications (BullMQ, idempotent, retries), appointments | ✅ Backend done + tested |
| 7 Gemini AI | Provider abstraction, Gemini provider, explain/classify/summarise/insights/transcribe, validation, redaction, injection fencing, fallbacks, provenance log | ✅ Backend done + tested (with mocked provider; no live key used) |
| 8 Advanced | Rehabilitation, caregivers, consents, messaging, documents (private storage, signed URLs), analytics, subscriptions/billing | ✅ Backend done; partially tested via E2E/integration |
| 4/5 Mobile | Expo app (patient, staff, physio, caregiver experiences) | 🚧 In progress — see below |
| 9 Hardening | Security/perf/E2E, deployment docs, mobile build verification | ⏳ Partially (docs, CI not yet) |

## How to verify the backend (no Docker needed)

```bash
npm install
npm test                                   # shared + API (in-memory MongoDB replica set)
npm run db:memory -w @recoveros/api        # terminal 1: local MongoDB replica set on :27017
# terminal 2 (bash):
export QUEUE_DRIVER=inline JWT_ACCESS_SECRET=dev-access-secret-please-change-0123456789 JWT_REFRESH_SECRET=dev-refresh-secret-please-change-0123456789
npm run seed && npm run dev:api            # http://localhost:4000/api/docs
```

Last verified: 50 API tests + 8 shared tests passing; `tsc --noEmit` clean; production build OK;
server booted against local replica set, seeded, and served login/alerts/tasks/docs over HTTP.

## Known limitations / next steps

- Mobile app: see "Mobile" section of README once completed.
- Docker Compose / Dockerfile written but not executed in this environment.
- Rate limiting uses the in-memory store (per instance) — add a Redis store before horizontal scaling.
- Voice transcription stores audio via the document pipeline; a purge job for soft-deleted files is not implemented.
- `unplannedHospitalReturns` analytics requires an admissions integration (reported as unavailable).
- Paystack adapter implemented but untested against the live API; Flutterwave adapter not implemented (manual provider is default).
- SMS: Termii adapter implemented; Africa's Talking / Twilio fall back to console.
- MFA is data-model ready (User.mfa) but not enforced; TOTP enrolment endpoints are future work.
- Demo alert rules are placeholders (`isDemoRule`) and must be replaced by hospital-approved protocols.
- Legal/privacy review against the Nigeria Data Protection Act 2023 is required before real patient data.
