# Bookdrop

A library system with remote holds, pickup, and reservations.

Bookdrop is a backend-first library management platform where members can browse books, discover titles by author or category, check the availability of physical copies, and authenticate with role-based access control.

---

## Tech Stack

* **Framework**: NestJS 10 (TypeScript on Express.js)
* **API**: GraphQL (Code-First with Apollo Server 4)
* **Database**: PostgreSQL 16 (run in Docker)
* **ORM**: Prisma ORM
* **Authentication**: JWT (Access Tokens) + Opaque SHA-256 Hashed Refresh Tokens + Argon2 (Passwords)
* **Security**: Helmet, GraphQL-aware Throttling (@nestjs/throttler), Query Depth Limiting (graphql-depth-limit)
* **Testing**: Jest (Unit) & Supertest (E2E)
* **CI/CD**: GitHub Actions

---

## Roles and Permissions

Bookdrop enforces declarative Role-Based Access Control (RBAC) via global guards:

| Role | Permissions & Capabilities |
| :--- | :--- |
| **MEMBER** | • View catalog books and single book details (`books`, `book` - public)<br>• Register and authenticate (`register`, `login`, `refreshTokens`, `logout`)<br>• View own authenticated profile (`me`)<br>• *Forbidden from mutating books or managing user accounts.* |
| **LIBRARIAN** | • All MEMBER permissions<br>• Manage catalog inventory: create new books (`createBook`) and update existing book details/authors/categories (`updateBook`)<br>• *Forbidden from administrative user operations.* |
| **ADMIN** | • Full system administration<br>• Manage catalog inventory (`createBook`, `updateBook`)<br>• List all registered users (`users`)<br>• Update any user's role (`updateUserRole`)<br>• *Self-Demotion Lockout: An admin is strictly prohibited from removing their own admin status to prevent administrative lockouts.* |

---

## Environment Variables

All environment variables are validated at application boot-time using Joi schemas ([`src/config/env.validation.ts`](src/config/env.validation.ts)). If any required variable is missing or fails constraints (e.g. secret key length), the application crashes immediately with clear diagnostic logs.

| Variable | Purpose | Example Placeholder | Required or Optional |
| :--- | :--- | :--- | :---: |
| `DATABASE_URL` | PostgreSQL connection string for Prisma ORM | `postgresql://bookdrop:bookdrop@localhost:5432/bookdrop?schema=public` | **Required** |
| `JWT_ACCESS_SECRET` | Secret key used to sign stateless JWT access tokens (**minimum 32 characters**) | `your-super-secret-jwt-access-key-min-32-chars-long` | **Required** |
| `NODE_ENV` | Application runtime environment (`development`, `production`, `test`, `provision`) | `production` | Optional (default: `development`) |
| `PORT` | HTTP server port (the application binds to `0.0.0.0`) | `3000` | Optional (default: `3000`) |
| `JWT_ACCESS_TTL` | Lifespan and validity duration for JWT access tokens | `15m` | Optional (default: `15m`) |
| `REFRESH_TOKEN_TTL_DAYS` | Lifespan in days for opaque hashed refresh tokens | `7` | Optional (default: `7`) |
| `TRUST_PROXY` | Configures Express to trust `X-Forwarded-*` headers from upstream reverse proxies / load balancers for client IP resolution and rate limiting | `false` | Optional (default: `false`) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins for browser applications (empty by default, disallowing cross-origin browser requests) | `https://app.bookdrop.io,https://admin.bookdrop.io` | Optional (default: `""`) |
| `SEED_ADMIN_PASSWORD` | Password for seeded demo Admin (development only) | `AdminPassword123!` | Optional |
| `SEED_LIBRARIAN_PASSWORD` | Password for seeded demo Librarian (development only) | `LibrarianPassword123!` | Optional |
| `SEED_MEMBER_PASSWORD` | Password for seeded demo Member (development only) | `MemberPassword123!` | Optional |
| `ALLOW_PROD_SEED` | Safety override flag allowing non-destructive seeding in production without wiping tables | `false` | Optional (default: `false`) |
| `ADMIN_EMAIL` | Target email address when running the `npm run create-admin` bootstrap script | `admin@bookdrop.io` | Required for `create-admin` |
| `ADMIN_NAME` | Full name when running the `npm run create-admin` bootstrap script | `Primary Administrator` | Required for `create-admin` |
| `ADMIN_PASSWORD` | Plaintext password (min. 8 characters) when running `npm run create-admin` | `SecureProductionPassword123!` | Required for `create-admin` |

> [!WARNING]
> **TRUST_PROXY Security Warning**:
> Set `TRUST_PROXY=true` **ONLY** when running behind a trusted reverse proxy or load balancer (e.g., AWS Application Load Balancer, NGINX, Cloudflare).
>
> When enabled, Express trusts the `X-Forwarded-For` header to determine client IP addresses for request logging and rate limiting. If `TRUST_PROXY` is enabled without a reverse proxy in front of the application, clients can spoof `X-Forwarded-For` headers with arbitrary IPs to bypass rate limits and IP-based security controls.

---

## Production Docker Deployment & Local Workflow

> [!IMPORTANT]
> **Database Migrations Note**:
> Migrations are run as a separate command from the image, never automatically on app start.
>
> Running migrations automatically on container boot introduces race conditions and database locking issues when multiple application container replicas scale up simultaneously (e.g., in AWS ECS or Kubernetes). Instead, execute migrations as a separate one-off task prior to launching new application containers.

### 1. Build the Production Image Locally
The `Dockerfile` is a multi-stage, non-root, Debian slim container explicitly built for `linux/amd64`:
```bash
docker build --platform linux/amd64 -t bookdrop-api:latest .
```

### 2. Start PostgreSQL Database
Start only the PostgreSQL database container (the default `docker compose up` starts only the database):
```bash
docker compose up -d
```

### 3. Run Database Migrations from the Image
Apply pending migrations using the production image with a command override:
```bash
docker compose run --rm app npx prisma migrate deploy
```

### 4. Start the Application Container
Launch the production application container using the `app` Compose profile:
```bash
docker compose --profile app up -d app
```

### 5. Verify Health Checks
Health check endpoints are public, exempt from rate limits, and reveal no internal system details:
* **Liveness (`/health/live`)**: Confirms the process is responsive without querying external dependencies (avoids container reboot loops during database outages).
  ```bash
  curl -i http://localhost:3000/health/live
  ```
  Expected: HTTP 200 `{"status":"ok","info":{"server":{"status":"up"}},"error":{},"details":{"server":{"status":"up"}}}`

* **Readiness (`/health/ready`)**: Verifies database connectivity (`SELECT 1`) to ensure the container is ready to accept incoming traffic from load balancers.
  ```bash
  curl -i http://localhost:3000/health/ready
  ```
  Expected: HTTP 200 `{"status":"ok","info":{"database":{"status":"up"}},"error":{},"details":{"database":{"status":"up"}}}`

### 6. Bootstrap Initial Production Admin
Execute `create-admin` inside a one-off container instance to provision the initial administrator:
```bash
docker compose run --rm \
  -e ADMIN_EMAIL="admin@bookdrop.io" \
  -e ADMIN_NAME="Primary Administrator" \
  -e ADMIN_PASSWORD="SecureProductionPassword123!" \
  app npm run create-admin
```

Verify authentication and role assignment via GraphQL:
```bash
curl -s -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(input: { email: \"admin@bookdrop.io\", password: \"SecureProductionPassword123!\" }) { accessToken user { id email role } } }"}'
```

### 7. Verify GraphQL Playground and Introspection are Disabled
In production (`NODE_ENV=production`), GraphQL introspection queries return a forbidden schema error, and the interactive playground is turned off:
```bash
curl -s -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}'
```
Expected: `{"errors":[{"message":"GraphQL introspection is not allowed by Apollo Server, but the query contained __schema or __type.","extensions":{"code":"GRAPHQL_VALIDATION_FAILED"}}],"data":null}`

### 8. Graceful SIGTERM Shutdown
When stopping the container, NestJS shutdown hooks trigger clean closure of PostgreSQL connections and completion of in-flight requests:
```bash
docker compose --profile app stop app
docker compose --profile app logs app
```

---

## Local Development Setup

### 1. Prerequisites
* **Node.js**: v20 or v22 LTS
* **Docker** & **Docker Compose**

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Nirukshith/bookdrop.git
cd bookdrop
npm install
```

### 3. Environment Configuration
Copy the template environment variables:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` in `.env` matches your local database port (port `5433` if port 5432 is occupied on macOS, or `5432`).

### 4. Start PostgreSQL with Docker
Start the isolated PostgreSQL 16 container:
```bash
docker compose up -d
```
Verify the database container is healthy:
```bash
docker compose exec db pg_isready -U bookdrop -d bookdrop
```

### 5. Run Database Migrations
Apply Prisma migrations to the database:
```bash
npx prisma migrate deploy
```

### 6. Seed the Database
Seed catalog data (30 books, 10 authors, 8 categories, 79 copies) and demo users:
```bash
npx prisma db seed
```
*(The seed script is idempotent and safe to run multiple times in development. Demo accounts are only seeded when `NODE_ENV !== 'production'`)*.

> [!CAUTION]
> **Production Seeding Safeguard**:
> In production (`NODE_ENV=production`), database seeding is **blocked by default** (aborts with an error) to protect live data.
> To safely seed missing records in production without wiping existing data, you must explicitly pass `--allow-prod-seed` (or set `ALLOW_PROD_SEED=true`):
> ```bash
> NODE_ENV=production npx ts-node prisma/seed.ts --allow-prod-seed
> ```
> In production mode, the script **NEVER** deletes existing records (skips table wipes) and only non-destructively inserts missing records. Demo accounts are never created in production.

### 7. Run the Application
Start the NestJS server in development mode:
```bash
npm run start:dev
```
The server will start at `http://localhost:3000`.

---

## Seeded Demo Accounts (Development)

The database seed provides 3 preconfigured demo accounts for testing RBAC:

| Role | Email | Default Password |
| :--- | :--- | :--- |
| **ADMIN** | `admin@bookdrop.local` | `AdminPassword123!` |
| **LIBRARIAN** | `librarian@bookdrop.local` | `LibrarianPassword123!` |
| **MEMBER** | `member@bookdrop.local` | `MemberPassword123!` |

---

## First Admin Account Bootstrap (Out-of-Band Script)

In production environments where demo seed accounts are disabled, you can securely bootstrap the initial administrator account (or promote an existing registered user) out-of-band using environment variables:

```bash
ADMIN_EMAIL="admin@bookdrop.io" \
ADMIN_NAME="Primary Administrator" \
ADMIN_PASSWORD="SecureProductionPassword123!" \
npm run create-admin
```

Inside Docker:
```bash
docker compose run --rm \
  -e ADMIN_EMAIL="admin@bookdrop.io" \
  -e ADMIN_NAME="Primary Administrator" \
  -e ADMIN_PASSWORD="SecureProductionPassword123!" \
  app npm run create-admin
```

### Bootstrap Script Features
* **Creation & Promotion**: If the user does not exist, a new account with `Role.ADMIN` is created. If the user already exists, their role is promoted to `ADMIN` and their password is updated.
* **Session Invalidation**: When promoting or updating an existing user, all active refresh tokens for that account are revoked automatically.
* **Password Validation**: Enforces the same validation as public registration (minimum 8 characters, Argon2id encryption).
* **Zero Leakage**: Never prints passwords or dumps environment variables to console output.
* **Docker Container Compatible**: Automatically runs via `ts-node` in development and via compiled JavaScript (`node dist/scripts/create-admin.js`) in production images.

---

## Authentication & Token Architecture

Bookdrop implements a defense-in-depth token security model:

1. **Short-Lived Access Tokens (JWT)**:
   - Signed with HMAC-SHA256 using `JWT_ACCESS_SECRET`.
   - Short expiration (`15m`) minimizes the window of opportunity if intercepted.
   - Stateless: Decoded payload contains `{ sub, email, role }` for instant authorization checks.

2. **Rotating Opaque Refresh Tokens (SHA-256 Hashed)**:
   - High-entropy, cryptographically random strings (not JWTs).
   - **Never stored in plain text:** Only a SHA-256 hash of the token is persisted in the `RefreshToken` database table. If the database is compromised, active session tokens cannot be stolen.
   - **Automatic Rotation:** Every invocation of `refreshTokens(refreshToken)` revokes the presented token (`revokedAt = now()`) and issues an entirely new token pair.

3. **Reuse Detection (Automatic Breach Containment)**:
   - If an already-revoked refresh token is presented to the server (evidence of token replay or interception), the system flags a potential theft and **immediately invalidates all active sessions for that user**. The legitimate user is forced to re-authenticate with their password, locking out the attacker.

4. **Timing Attack & Account Enumeration Mitigation**:
   - Passwords are encrypted with **Argon2id** (memory-hard, resistant to GPU/ASIC cracking).
   - If a login attempt fails due to an unknown email, the service runs a dummy Argon2 verification hash against a synthetic baseline to ensure uniform response timing, and returns a generic `"Invalid credentials"` error (preventing attackers from discovering registered emails).

---

## GraphQL Operations & Examples

Open Apollo Sandbox / GraphQL Playground at:
```
http://localhost:3000/graphql
```

### 1. Register a Member (Public)
```graphql
mutation Register {
  register(input: {
    name: "Ada Lovelace"
    email: "ada@example.com"
    password: "securePassword123"
  }) {
    accessToken
    refreshToken
    user {
      id
      name
      email
      role
    }
  }
}
```

### 2. Login (Public)
```graphql
mutation Login {
  login(input: {
    email: "admin@bookdrop.local"
    password: "AdminPassword123!"
  }) {
    accessToken
    refreshToken
    user {
      id
      email
      role
    }
  }
}
```

### 3. Authenticated Query: View Profile (`me`)
To call protected operations, include the `Authorization` HTTP header:
```
Authorization: Bearer <accessToken>
```

```graphql
query GetMyProfile {
  me {
    id
    name
    email
    role
    createdAt
  }
}
```

### 4. Rotate Refresh Token (Public)
```graphql
mutation RefreshTokens {
  refreshTokens(refreshToken: "<your_refresh_token_string>") {
    accessToken
    refreshToken
    user {
      id
      email
      role
    }
  }
}
```

### 5. Protected Librarian/Admin Mutation: Create Book
Requires `Authorization: Bearer <librarian_or_admin_token>`:
```graphql
mutation CreateBook {
  createBook(input: {
    title: "Dune"
    isbn: "978-0441172719"
    description: "Science fiction epic on the desert planet Arrakis."
    publishedYear: 1965
    authorIds: [1]
    categoryIds: [2]
  }) {
    id
    title
    isbn
    availableCopiesCount
    authors {
      name
    }
    categories {
      name
    }
  }
}
```

### 6. Protected Admin Mutation: Update User Role
Requires `Authorization: Bearer <admin_token>`:
```graphql
mutation UpdateRole {
  updateUserRole(userId: 1, role: LIBRARIAN) {
    id
    name
    email
    role
  }
}
```

---

## Security Hardening

* **Helmet**: Sets defensive HTTP headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`). In development, Content Security Policy (CSP) is relaxed so the Apollo Sandbox UI loads properly; in production, strict CSP is enforced.
* **Rate Limiting (`@nestjs/throttler`)**: GraphQL-aware throttling with default quota of 100 requests/minute, and strict throttling (10 requests/minute) on sensitive endpoints (`login`, `register`, `refreshTokens`) to block brute-force credential stuffing.
* **Query Depth Limiting**: Protects against denial-of-service query nesting attacks by capping GraphQL AST depth at 5 (`depthLimit(5)`).
* **Production Protection**: GraphQL Introspection and Playground are automatically disabled when `NODE_ENV=production`.

---

## Testing & Quality Assurance

### Run Unit Tests
```bash
npm test
```
*Executes 47 unit tests across services, guards, and environment validation schemas.*

### Run End-to-End (E2E) Tests
```bash
npm run test:e2e
```
*Executes 32 integration tests against the real PostgreSQL container (Auth, RBAC, Catalog, Security headers, Rate limiting, Depth limits).*

### Run Code Linter
```bash
npm run lint
```

### Build Production Bundle
```bash
npm run build
```
