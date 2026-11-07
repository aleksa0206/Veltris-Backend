# Veltris — Backend

**Workspaces · Projects · Tasks**

REST API for Veltris, a project management tool for teams. Work is organised in workspaces; each workspace has members with roles, projects with a short key, and tasks that move across a board. Every workspace is an isolated tenant in the same database.

- Live: [veltris.stackvale.space](https://veltris.stackvale.space)
- Frontend: [Veltris-Frontend](https://github.com/aleksa0206/Veltris-Frontend) (Angular)

## Features

- **Workspaces** — signing up creates your first workspace and makes you its owner. A user can belong to several workspaces.
- **Members and invitations** — owners and admins invite people by email. An existing account joins right away; anyone else gets a link that is valid for 7 days, and signing up through it joins that workspace instead of creating a new one. Roles are `Owner`, `Admin` and `Member`. Removing a member unassigns their open tasks and clears the projects they lead.
- **Projects** — key (`WEB`), name, description, status (active, on hold, completed, archived), lead, start and target date. Lists come with task counts per project: total, done, open and overdue.
- **Tasks** — numbered per project (`WEB-12`), with status (backlog, to do, in progress, in review, done, cancelled), priority, assignee, due date and description. Search by title or by identifier.
- **Board** — tasks keep their order inside a column, and a drag and drop is a single request that puts the card above another one or at the bottom.
- **Subtasks, comments and history** — subtasks are one level deep. Every change of title, status, priority, assignee or due date is recorded with who made it and when.
- **Overview** — one request for the home screen: your open tasks, active projects with progress, recent activity and totals (open, overdue, due this week, completed this week), relative to the user's own calendar day.

## Security

- The short-lived JWT access token (15 min) is returned in the response body. The refresh token is opaque, stored hashed, rotated on every use, and sent only as an `httpOnly`, `sameSite=strict` cookie.
- Optional TOTP two-factor authentication.
- Accounts lock after 5 failed logins. Login timing is the same whether or not the email exists. Password reset and invitation links use hashed, expiring tokens; an invitation can be used once, and only by the invited email address.
- DB-backed rate limiting, so limits hold across multiple instances.
- Every request is checked against the caller's workspace membership and role. Assignees and project leads must be members of the same workspace.
- Environment variables are validated at startup.

## Tech stack

Node.js 24, TypeScript, Express 5, Prisma 7 (MariaDB adapter) on MySQL 8, Zod, Pino, Jest + Supertest, Nodemailer, Docker, Prometheus metrics.

Layered architecture: `routes → controllers → services → repositories → Prisma`. Business rules and authorization live in services, and only repositories touch the database.

## Getting started

Requirements: Node.js 24 and MySQL 8 (local install or `docker-compose up -d`).

```bash
npm install
cp .env.example .env            # set JWT_SECRET (at least 32 characters) and the DB settings
npx prisma migrate deploy
npx prisma generate
npm run seed                    # optional demo workspace: ana@veltris.dev / password123
npm run dev                     # http://localhost:4000
```

Without SMTP settings in development, password reset and invitation emails are written to the log instead of being sent.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | no | Default `4000` |
| `NODE_ENV` | no | `development` / `test` / `production` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | Used by the app. On Windows use `127.0.0.1`, not `localhost` |
| `DATABASE_URL` | yes | Used only by the Prisma CLI (migrations) |
| `JWT_SECRET` | yes | At least 32 characters |
| `FRONTEND_URL` | in production | CORS origin and links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | in production | Password reset and invitation emails |
| `TRUST_PROXY` | no | Number of reverse proxies in front of the app (default `0`) |
| `METRICS_TOKEN` | no | Enables `GET /metrics` for Prometheus |

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `GET /auth/me`, 2FA under `/auth/2fa/*` |
| Profile | `PUT /users/me` |
| Workspaces | `GET/POST /workspaces`, `GET/PUT /workspaces/:id`, `GET /workspaces/:id/overview?today` |
| Members | `GET/POST /workspaces/:id/members`, `PUT/DELETE /workspaces/:id/members/:userId` |
| Invitations | `GET /workspaces/:id/invitations`, `DELETE /workspaces/:id/invitations/:invitationId`, `POST /invitations/preview`, `POST /invitations/accept` |
| Projects | `GET/POST /workspaces/:id/projects`, `GET/PUT/DELETE /projects/:id` |
| Tasks | `GET /projects/:id/tasks`, `GET /workspaces/:id/tasks`, `POST /projects/:id/tasks`, `GET/PUT/DELETE /tasks/:id`, `POST /tasks/:id/move` |
| Comments | `GET/POST /tasks/:id/comments`, `PUT/DELETE /comments/:id` |
| History | `GET /tasks/:id/activity` |
| Health | `GET /health` |

Lists are paginated (`?page&limit`, max 100) and return `{ data, meta }`. Dates are `YYYY-MM-DD`. Task lists return board cards (top-level tasks) unless `topLevel=false`, and filter by `status`, `priority`, `assigneeId=me|none|<id>`, `open` and `search`. A move is `{ status, beforeTaskId }`, where `null` means the bottom of the column.

## Tests

Integration tests run against a real MySQL database configured in `.env.test` (same variables, separate database).

```bash
npm run test:migrate   # after every new migration
npm test
```

CI (GitHub Actions) runs formatting, type checking and the full test suite against MySQL 8, and builds the Docker image.

## Deployment

`docker-compose.prod.yaml` runs MySQL, a one-shot migration container, the API and the frontend (nginx, which also proxies `/api`) on a single host. The frontend repository is expected next to this one (`../Veltris-Frontend`).

```bash
docker compose -p veltris --env-file .env.production -f docker-compose.prod.yaml up -d --build
```

Keep `DB_USER`, `DB_PASSWORD` and `DB_NAME` alphanumeric: they are interpolated into a connection URL.
