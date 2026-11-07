# Veltris — Backend

**Workspaces · Projects · Tasks**

REST API for Veltris, a project management tool for teams: workspaces with members and roles, projects with a short key, tasks on a board with priorities, assignees, due dates, subtasks, comments and a full change history.

- Frontend: [Veltris-Frontend](https://github.com/aleksa0206/Veltris-Frontend) (Angular)

## Features

- **Workspaces** — the unit of collaboration. Signing up creates your first workspace. Everything below belongs to exactly one workspace.
- **Members and invitations** — owners and admins invite by email: an existing account joins at once, anyone else gets a link valid for 7 days (inviting again renews it; pending invitations can be revoked). Signing up from the link joins that workspace instead of creating one. Roles are Owner, Admin and Member; admins change roles and remove members, anyone but the owner can leave. A removed member's open tasks are unassigned (with a history entry) and they stop leading projects.
- **Projects** — key (`WEB`), name, description, status (active, on hold, completed, archived), lead, start and target date. Lists come with task counts per project: total, done, open and overdue.
- **Tasks** — numbered per project (`WEB-12`), with status (backlog, to do, in progress, in review, done, cancelled), priority (none to urgent), assignee, due date and description. Search by title or by identifier.
- **Board** — tasks keep their order inside a column; a drag and drop is a single request that places the card above another one, or at the bottom.
- **Subtasks** — one level deep, with progress shown on the parent.
- **Comments and history** — every change of title, status, priority, assignee or due date is recorded with who made it and when.
- **Overview** — one request for the workspace home screen: your open tasks, active projects with progress, recent activity and totals (open, overdue, due this week, completed this week), relative to the user's own calendar day.

## Security

- Short-lived JWT access token (15 min) in the response body; opaque refresh token, stored hashed, rotated on every use and sent only as an `httpOnly`, `sameSite=strict` cookie.
- Optional TOTP two-factor authentication. The temporary 2FA token is rejected everywhere except the verification endpoint.
- Account lockout after 5 failed logins, timing-safe login (no account enumeration), hashed and expiring password-reset tokens.
- DB-backed rate limiting, so limits hold across instances.
- Every request is checked against the caller's workspace membership and role; assignees and project leads must be members of the same workspace.
- Invitation links carry a random token; only its SHA-256 hash is stored. A link can be used once, before it expires, and only by an account with the invited email address. Without SMTP in development, emails are written to the log instead.
- Environment variables are validated at startup.

## Tech stack

Node.js 24 · TypeScript · Express 5 · Prisma 7 (MariaDB adapter) on MySQL 8 · Zod · Pino · Jest + Supertest · Nodemailer · Docker · Prometheus metrics

Layered architecture: `routes → controllers → services → repositories → Prisma`. Business rules and authorization live in services; only repositories touch the database.

## Getting started

Requirements: Node.js 24 and MySQL 8 (local install or `docker-compose up -d`).

```bash
npm install
cp .env.example .env            # set JWT_SECRET (at least 32 characters) and the DB settings
npx prisma migrate deploy
npx prisma generate
npm run seed                    # optional: demo workspace, sign in as ana@veltris.dev / password123
npm run dev                     # http://localhost:4000
```

Or create an account with `POST /auth/register` (or through the frontend at `/register`).

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | no | Default `4000` |
| `NODE_ENV` | no | `development` / `test` / `production` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | Used by the app. On Windows use `127.0.0.1`, not `localhost` |
| `DATABASE_URL` | yes | Used only by the Prisma CLI (migrations) |
| `JWT_SECRET` | yes | At least 32 characters |
| `FRONTEND_URL` | in production | CORS origin and password-reset links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | in production | Password-reset emails |
| `TRUST_PROXY` | no | Number of reverse proxies in front of the app (default `0`) |
| `METRICS_TOKEN` | no | Enables `GET /metrics` for Prometheus |

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register` (with optional `workspaceName`), `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `GET /auth/me`, 2FA under `/auth/2fa/*` |
| Profile | `PUT /users/me` |
| Workspaces | `GET/POST /workspaces`, `GET/PUT /workspaces/:id`, `GET /workspaces/:id/overview?today` |
| Members | `GET/POST /workspaces/:id/members` (POST invites by email), `PUT/DELETE /workspaces/:id/members/:userId` |
| Invitations | `GET /workspaces/:id/invitations`, `DELETE /workspaces/:id/invitations/:invitationId`, `POST /invitations/preview`, `POST /invitations/accept`; `POST /auth/register` takes an optional `invitationToken` |
| Projects | `GET /workspaces/:id/projects?status&search&sort=name\|targetDate\|updated&today`, `POST /workspaces/:id/projects`, `GET/PUT/DELETE /projects/:id` |
| Tasks | `GET /projects/:id/tasks`, `GET /workspaces/:id/tasks` (`?status&priority&assigneeId=me\|none\|id&open&topLevel&search&sort=board\|due\|priority\|updated`), `POST /projects/:id/tasks`, `GET/PUT/DELETE /tasks/:id`, `POST /tasks/:id/move` |
| Comments | `GET/POST /tasks/:id/comments`, `PUT/DELETE /comments/:id` |
| History | `GET /tasks/:id/activity` |
| Health | `GET /health` |

Lists are paginated (`?page&limit`, max 100) and return `{ data, meta }`. Dates are `YYYY-MM-DD`. Task lists return board cards (top-level tasks) unless `topLevel=false`. A move is `{ status, beforeTaskId }`, where `beforeTaskId: null` means the bottom of the column.

## Tests

Integration tests run against a real MySQL database configured in `.env.test` (same variables, separate database).

```bash
npm run test:migrate   # after every new migration
npm test
```

They cover access by role and membership, invitations (sign-up through a link, wrong address, reuse, expiry, renewal), member removal, task numbering, the change log, board ordering (including renumbering a full gap), subtasks, comment moderation, identifier search and the overview counts.

CI (GitHub Actions) runs formatting, type checking and the full test suite against MySQL 8, and builds the Docker image.

## Deployment

`docker-compose.prod.yaml` runs MySQL, a one-shot migration container, the API and the frontend (nginx, which also proxies `/api`) on a single host. The frontend repository is expected next to this one (`../Veltris-Frontend`).

```bash
docker compose -p veltris --env-file .env.production -f docker-compose.prod.yaml up -d --build
```

Keep `DB_USER`, `DB_PASSWORD` and `DB_NAME` alphanumeric: they are interpolated into a connection URL.
