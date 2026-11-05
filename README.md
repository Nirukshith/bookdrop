# Bookdrop

A library system with remote holds, pickup, and reservations.

Bookdrop is a backend-first library management platform where members can browse books, discover titles by author or category, check the availability of physical copies, and authenticate with role-based access control.

---

## Tech Stack

- **Framework**: NestJS 10 (TypeScript on Express.js)
- **API**: GraphQL (Code-First with Apollo Server 4)
- **Database**: PostgreSQL 16 (run in Docker)
- **ORM**: Prisma ORM
- **Authentication**: JWT (Access Tokens) + Opaque SHA-256 Hashed Refresh Tokens + Argon2 (Passwords)
- **Security**: Helmet, GraphQL-aware Throttling (@nestjs/throttler), Query Depth Limiting (graphql-depth-limit)
- **Testing**: Jest (Unit) & Supertest (E2E)
- **CI/CD**: GitHub Actions

---

## Roles and Permissions

Bookdrop enforces declarative Role-Based Access Control (RBAC) via global guards:

| Role          | Permissions & Capabilities                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MEMBER**    | • View catalog books and single book details (`books`, `book` - public)<br>• Register and authenticate (`register`, `login`, `refreshTokens`, `logout`)<br>• View own authenticated profile (`me`)<br>• Request remote holds on titles (`requestHold`)<br>• View own active and historical holds (`myHolds`)<br>• Cancel own active hold (`cancelMyHold`)<br>• View own loans with dynamic overdue fees (`myLoans`)<br>• View own outstanding and historical fines with book title (`myFines`)<br>• _Forbidden from modifying catalog books, managing physical copy inventory, viewing physical copy barcodes (masked), cancelling other patrons' holds, returning loans, declaring lost books, recording payments, waiving fines, or administrative user operations._                                                                                                                                                                                                                                                                                                                                                             |
| **LIBRARIAN** | • All MEMBER permissions<br>• Manage catalog inventory: create new books (`createBook`) and update existing book details/authors/categories (`updateBook`)<br>• Manage physical copy inventory: add copies (`addCopies`), update location (`updateCopy`), manually change condition status (`transitionCopyStatus`), and retire copies (`retireCopy`)<br>• Query physical copy inventory and inspect unmasked barcodes (`copies`, `copy`, `bookCopies`, `Book.copies`)<br>• Manage remote holds across the system: view all member holds (`holds`, `hold`) and administratively cancel holds with staff audit notes (`cancelHold`)<br>• Circulation desk operations: pickup desk fulfillment (`confirmPickup`), walk-in checkouts (`checkoutCopy`), loan returns (`returnLoan`), declaring lost books (`markLoanLost`), viewing active overdue loans (`overdueLoans`), and loan ledger lookups (`loans`, `loan`)<br>• Fine desk operations: record fine payments (`recordFinePayment`), query fine ledger and member fines (`fines`, `fine`, `memberFines`)<br>• _Forbidden from waiving fines or administrative user operations._ |
| **ADMIN**     | • Full system administration<br>• All LIBRARIAN and MEMBER capabilities<br>• Waive patron fines with justification reason (`waiveFine`)<br>• List all registered users (`users`)<br>• Update any user's role (`updateUserRole`)<br>• _Self-Demotion Lockout: An admin is strictly prohibited from removing their own admin status to prevent administrative lockouts._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## Environment Variables

All environment variables are validated at application boot-time using Joi schemas ([`src/config/env.validation.ts`](src/config/env.validation.ts)). If any required variable is missing or fails constraints (e.g. secret key length), the application crashes immediately with clear diagnostic logs.

| Variable                  | Purpose                                                                                                                                       | Example Placeholder                                                    |       Required or Optional        |
| :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------- | :-------------------------------: |
| `DATABASE_URL`            | PostgreSQL connection string for Prisma ORM                                                                                                   | `postgresql://bookdrop:bookdrop@localhost:5432/bookdrop?schema=public` |           **Required**            |
| `JWT_ACCESS_SECRET`       | Secret key used to sign stateless JWT access tokens (**minimum 32 characters**)                                                               | `your-super-secret-jwt-access-key-min-32-chars-long`                   |           **Required**            |
| `NODE_ENV`                | Application runtime environment (`development`, `production`, `test`, `provision`)                                                            | `production`                                                           | Optional (default: `development`) |
| `PORT`                    | HTTP server port (the application binds to `0.0.0.0`)                                                                                         | `3000`                                                                 |    Optional (default: `3000`)     |
| `JWT_ACCESS_TTL`          | Lifespan and validity duration for JWT access tokens                                                                                          | `15m`                                                                  |     Optional (default: `15m`)     |
| `REFRESH_TOKEN_TTL_DAYS`  | Lifespan in days for opaque hashed refresh tokens                                                                                             | `7`                                                                    |      Optional (default: `7`)      |
| `LIBRARY_TIMEZONE`        | IANA timezone name for local loan due-date calendar calculation                                                                               | `Asia/Colombo`                                                         |     Optional (default: `UTC`)     |
| `TRUST_PROXY`             | Configures Express to trust `X-Forwarded-*` headers from upstream reverse proxies / load balancers for client IP resolution and rate limiting | `false`                                                                |    Optional (default: `false`)    |
| `ALLOWED_ORIGINS`         | Comma-separated list of allowed CORS origins for browser applications (empty by default, disallowing cross-origin browser requests)           | `https://app.bookdrop.io,https://admin.bookdrop.io`                    |     Optional (default: `""`)      |
| `SEED_ADMIN_PASSWORD`     | Password for seeded demo Admin (development only)                                                                                             | `AdminPassword123!`                                                    |             Optional              |
| `SEED_LIBRARIAN_PASSWORD` | Password for seeded demo Librarian (development only)                                                                                         | `LibrarianPassword123!`                                                |             Optional              |
| `SEED_MEMBER_PASSWORD`    | Password for seeded demo Member (development only)                                                                                            | `MemberPassword123!`                                                   |             Optional              |
| `ALLOW_PROD_SEED`         | Safety override flag allowing non-destructive seeding in production without wiping tables                                                     | `false`                                                                |    Optional (default: `false`)    |
| `ADMIN_EMAIL`             | Target email address when running the `npm run create-admin` bootstrap script                                                                 | `admin@bookdrop.io`                                                    |    Required for `create-admin`    |
| `ADMIN_NAME`              | Full name when running the `npm run create-admin` bootstrap script                                                                            | `Primary Administrator`                                                |    Required for `create-admin`    |
| `ADMIN_PASSWORD`          | Plaintext password (min. 8 characters) when running `npm run create-admin`                                                                    | `SecureProductionPassword123!`                                         |    Required for `create-admin`    |

> [!WARNING]
> **TRUST_PROXY Security Warning**:
> Set `TRUST_PROXY=true` **ONLY** when running behind a trusted reverse proxy or load balancer (e.g., AWS Application Load Balancer, NGINX, Cloudflare).
>
> When enabled, Express trusts the `X-Forwarded-For` header to determine client IP addresses for request logging and rate limiting. If `TRUST_PROXY` is enabled without a reverse proxy in front of the application, clients can spoof `X-Forwarded-For` headers with arbitrary IPs to bypass rate limits and IP-based security controls.

---

## ☁️ Cloud Architecture & AWS Live Deployment

Bookdrop is deployed live to **AWS** under the **12-Month Free Tier** ($0/month) utilizing a decoupled, production-hardened microservices architecture:

```
[ Internet Traffic ]
        │
        ▼ (Port 80)
┌────────────────────────────────────────────────────────┐
│  AWS Application Load Balancer (ALB)                  │
│  - Endpoint: http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com
│  - Health Check: Target Group -> /health/live          │
└───────────────────────┬────────────────────────────────┘
                        │ (Forward to Port 3000)
                        ▼
┌────────────────────────────────────────────────────────┐
│  Amazon ECS Cluster (bookdrop-cluster)                 │
│  - Host: 1x EC2 t3.micro (Amazon Linux 2023 ECS AMI)   │
│  - Service: bookdrop-api-service                       │
│  - Task: bookdrop-api-task:1 (Non-root user: node)     │
│  - Config: TRUST_PROXY=true, PORT=3000                 │
│  - Secrets: AWS SSM Parameter Store                    │
│  - Logs: CloudWatch (/ecs/bookdrop-api)                │
└───────────────────────┬────────────────────────────────┘
                        │ (Private TLS Port 5432)
                        ▼
┌────────────────────────────────────────────────────────┐
│  Amazon RDS PostgreSQL (bookdrop-db)                  │
│  - Engine: PostgreSQL 16.9 (db.t3.micro)               │
│  - Storage: 20 GB gp3 (Single-AZ, No Public IP)        │
└────────────────────────────────────────────────────────┘
```

### Live Public Endpoints

| Service                  | Live URL                                                                                                                                             | Status   | Sample Response                                       |
| :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------- | :---------------------------------------------------- |
| **Liveness Probe**       | [http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/health/live](http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/health/live)   | `200 OK` | `{"status":"ok","info":{"app":{"status":"up"}}}`      |
| **Readiness Probe (DB)** | [http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/health/ready](http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/health/ready) | `200 OK` | `{"status":"ok","info":{"database":{"status":"up"}}}` |
| **GraphQL API**          | [http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/graphql](http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/graphql)           | `200 OK` | Accepts POST requests with JSON queries               |

### Free-Tier Compliance & DevOps Hardening

- **Cost Optimization ($0/mo during free tier):** Uses **ECS with EC2 Launch Type** on a free `t3.micro` instance instead of Fargate, paired with a Single-AZ `db.t3.micro` RDS instance and 1 ALB.
- **Storage Guardrails:** ECR repository enforces an automated lifecycle policy managed in Terraform (`var.ecr_image_count = 10`) retaining the 10 most recent images.
- **Log Retention Guardrails:** CloudWatch log group `/ecs/bookdrop-api` enforces an automated 14-day retention window (`var.log_retention_days = 14`), preventing unbounded logging costs.
- **Decoupled One-Off Migrations:** Database migrations (`npx prisma migrate deploy`) and seeding (`npx prisma db seed`) run via isolated ECS one-off tasks prior to application rollouts, preventing race conditions or concurrency deadlocks.
- **On-Demand Scaling & CI/CD Split:** CI workflow ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) tests code and validates container images on PRs/pushes without deploying. Deployments run on-demand via the manual workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) after starting AWS resources.

---

## 🔄 Daily Workflow & On-Demand AWS Operations

To minimize AWS cloud expenses while developing locally, Bookdrop operates on an **On-Demand Infrastructure** model: AWS compute and database instances remain stopped when not actively undergoing deployment, testing, or demonstrations.

```
Local Development ──(Push/PR)──► GitHub Actions CI (Lint, Test, Trivy Scan — No Deploy)
                                         │
When Deploying / Demoing:                ▼
1. Run `./scripts/aws-up.sh`   ──► Starts RDS, EC2 host, scales ECS service to 1, polls health
2. Trigger GitHub Actions      ──► Manual "Deploy to AWS ECS" (Preflight Check ➔ Build ➔ Migrate ➔ Deploy ➔ Smoke Test)
3. Test & Demo                 ──► Verify live endpoints through ALB
4. Run `./scripts/aws-down.sh` ──► Scales ECS to 0, stops EC2 host, stops RDS DB instance
(Safety Net: Nightly EventBridge Scheduler automatically stops remaining compute at 11:00 PM)
```

### 1. Local Development (Default Daily State)

- Work locally using Docker Compose (`docker compose up -d` for PostgreSQL, `npm run start:dev` for NestJS).
- Pull Requests and pushes to `main` trigger [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **CI runs automatically**: Linting, unit tests, e2e tests against a dynamic PostgreSQL service container, multi-stage production Docker build, and Trivy vulnerability scan.
- **CI does NOT deploy to AWS**. Pushing or merging code never alters AWS state or incurs unexpected compute charges.

### 2. Deploying & Testing On-Demand

When ready to deploy a new release, verify live cloud integrations, or perform a demonstration:

#### Step A: Bring Up AWS Resources

Run the startup script from your terminal:

```bash
# Preview actions without making changes
./scripts/aws-up.sh --dry-run

# Start the AWS environment
./scripts/aws-up.sh
```

The script runs idempotently in exact dependency order:

1. **Starts RDS PostgreSQL** (skips if already available) and waits until available.
2. **Starts the EC2 host instance** (`i-070c77c1d322f9550`) and polls until the container instance registers as `ACTIVE` with the ECS cluster (`bookdrop-cluster`).
3. **Scales the ECS service** (`bookdrop-api-service`) desired count to `1` and waits until the service reaches a stable steady state.
4. **Polls the public readiness URL** (`/health/ready`) on the ALB until HTTP 200 OK is returned.

#### Step B: Trigger the GitHub Deploy Workflow

1. Navigate to the **Actions** tab in GitHub and select **Deploy to AWS ECS**.
2. Click **Run workflow**, choose your branch/ref (default: `main`), and run.
3. The workflow executes:
   - **Preflight Check**: Verifies that RDS is `available` and the ECS cluster has registered host capacity (`registeredContainerInstancesCount >= 1`). If the environment is stopped, it fails immediately with:
     > `"AWS is stopped. Run scripts/aws-up.sh first."`
   - **Build & Push**: Builds the image targeting `linux/amd64`, tags it with the commit SHA and `latest`, and pushes to Amazon ECR.
   - **Prisma Migrations Task**: Launches an isolated one-off ECS task (`bookdrop-migration-task:1`) on the EC2 host and waits for exit code 0.
   - **Service Deployment**: Invokes `aws ecs update-service --force-new-deployment` and waits for steady state.
   - **Smoke Test**: Continuously polls `http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/health/ready` until it confirms HTTP 200 OK. Fails the pipeline if unhealthy.

#### Step C: Stop AWS Resources When Finished

After completing testing or demos, shut down compute and database resources:

```bash
# Preview actions without making changes
./scripts/aws-down.sh --dry-run

# Stop the AWS environment
./scripts/aws-down.sh
```

The script runs idempotently in reverse dependency order:

1. **Scales ECS service** desired count to `0` and waits for running tasks to reach 0.
2. **Stops the EC2 host instance** and waits until the instance is in the `stopped` state.
3. **Stops the RDS DB instance** (`bookdrop-db`).

---

### 3. Idle Cost Breakdown: What Still Costs Money While Stopped

When all compute and database instances are stopped, the majority of billing is paused, but certain fixed cloud resources continue to incur charges:

| Resource                            | Scope / Quantity                    | Reason for Idle Billing                                                                      | Estimated Monthly Cost                                 |
| :---------------------------------- | :---------------------------------- | :------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **Application Load Balancer (ALB)** | `bookdrop-alb` (1 ALB)              | Base charge for maintaining load balancer provisioning, listeners, and static DNS endpoints. | **~$16.20 - $22.50 / month** ($0.0225/hr + LCU)        |
| **Public IPv4 Addresses (ALB)**     | 2 Public IPs (across 2 AZs)         | AWS charges $0.005/hr for all in-use public IPv4 addresses (policy effective Feb 1, 2024).   | **~$7.20 / month** ($3.60/mo per IP)                   |
| **RDS Storage (gp3)**               | 20 GB gp3 (`bookdrop-db`)           | Storage and automated snapshot data persist while the database instance is stopped.          | **~$2.30 / month** (Covered if within 20 GB Free Tier) |
| **EC2 EBS Root Storage (gp3)**      | 30 GB gp3 (`vol-0524017353fc9ddaf`) | Root volume disk image persists while the EC2 host is in the `stopped` state.                | **~$2.40 / month** (Covered if within 30 GB Free Tier) |
| **ECR Container Registry**          | Private Repository                  | Retains container images (10 most recent images kept by lifecycle policy).                   | **$0.00 / month** (Within 500 MB Free Tier)            |
| **CloudWatch Logs**                 | `/ecs/bookdrop-api`                 | Retains log streams (14-day retention policy).                                               | **$0.00 / month** (Within 5 GB Free Tier)              |
| **Secrets / SSM Parameters**        | 3 Standard Parameters               | Standard parameters are free of charge.                                                      | **$0.00 / month**                                      |

> [!WARNING]
> **RDS 7-Day Automatic Restart Policy**:
> Amazon RDS automatically restarts stopped DB instances after **7 consecutive days** if not started manually. To prevent accidental charges if you are away, run `./scripts/aws-down.sh` or check the RDS console weekly, or rely on the automated nightly safety net.

---

### 4. Automated Cost Guards & Safety Nets

Bookdrop includes 4 automated cost guards managed in Terraform:

1. **CloudWatch Log Retention**: Set to `14 days` via Terraform variable `var.log_retention_days = 14`. Log events older than 14 days automatically expire.
2. **ECR Lifecycle Cleanup**: Keeps only the `10 most recent container images` via Terraform variable `var.ecr_image_count = 10`. Older image digests are expired automatically.
3. **AWS Budgets Alert**: Monitored by `bookdrop-monthly-budget` set at `$15.00/month` limit (`var.monthly_budget_amount`). Alerts are dispatched via email to `nirukshith2002@gmail.com` when actual spend crosses `50%`, `80%`, and `100%`.
4. **Nightly Stop Safety Net (EventBridge Scheduler)**: An automated Amazon EventBridge Scheduler rule (`bookdrop-nightly-shutdown-schedule`) triggers an AWS Lambda function (`bookdrop-nightly-shutdown`) every night at **11:00 PM IST** (`cron(0 23 * * ? *)`, timezone: `Asia/Kolkata`). If you forget to run `./scripts/aws-down.sh` after an evening deploy, the safety net automatically shuts down ECS tasks, the EC2 host, and RDS.

---

### 5. Terraform Drift & `ignore_changes` Settings

All Bookdrop infrastructure is managed via Terraform under the [`terraform/`](terraform/) directory.

> [!IMPORTANT]
> **Preventing Terraform Drift on Dynamic Scaling**:
> In [`terraform/main.tf`](terraform/main.tf), `aws_ecs_service.bookdrop_api_service` is explicitly declared with:
>
> ```hcl
> lifecycle {
>   ignore_changes = [
>     desired_count,
>     task_definition
>   ]
> }
> ```
>
> - **Why `desired_count` is ignored**: The scaling scripts (`aws-up.sh` and `aws-down.sh`) toggle `desired_count` dynamically between `0` and `1`. Without `ignore_changes`, running `terraform apply` while the app is stopped would detect drift and force the service back to `desired_count = 1`, unexpectedly starting tasks and incurring costs.
> - **Why `task_definition` is ignored**: The GitHub Actions Deploy workflow dynamically registers new task definitions and updates the service with each deployment. `ignore_changes` ensures Terraform does not rollback the task definition revision to an older hardcoded value.
> - **Auto Scaling Groups vs. Standalone Instances**: If an EC2 instance belongs to an Auto Scaling Group (ASG), you **must scale the ASG** (`min-size = 0, desired-capacity = 0`), never stop the EC2 instance directly. When an ASG instance is stopped directly, the ASG health check considers it unhealthy and immediately terminates and launches a new replacement instance. Bookdrop's app host is provisioned as a standalone EC2 host instance (`i-070c77c1d322f9550`), allowing safe direct stop and start operations.

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

- **Liveness (`/health/live`)**: Confirms the process is responsive without querying external dependencies (avoids container reboot loops during database outages).

  ```bash
  curl -i http://localhost:3000/health/live
  ```

  Expected: HTTP 200 `{"status":"ok","info":{"server":{"status":"up"}},"error":{},"details":{"server":{"status":"up"}}}`

- **Readiness (`/health/ready`)**: Verifies database connectivity (`SELECT 1`) to ensure the container is ready to accept incoming traffic from load balancers.
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

- **Node.js**: v20 or v22 LTS
- **Docker** & **Docker Compose**

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

_(The seed script is idempotent and safe to run multiple times in development. Demo accounts are only seeded when `NODE_ENV !== 'production'`)_.

> [!CAUTION]
> **Production Seeding Safeguard**:
> In production (`NODE_ENV=production`), database seeding is **blocked by default** (aborts with an error) to protect live data.
> To safely seed missing records in production without wiping existing data, you must explicitly pass `--allow-prod-seed` (or set `ALLOW_PROD_SEED=true`):
>
> ```bash
> NODE_ENV=production npx ts-node prisma/seed.ts --allow-prod-seed
> ```
>
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

| Role          | Email                      | Default Password        |
| :------------ | :------------------------- | :---------------------- |
| **ADMIN**     | `admin@bookdrop.local`     | `AdminPassword123!`     |
| **LIBRARIAN** | `librarian@bookdrop.local` | `LibrarianPassword123!` |
| **MEMBER**    | `member@bookdrop.local`    | `MemberPassword123!`    |

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

- **Creation & Promotion**: If the user does not exist, a new account with `Role.ADMIN` is created. If the user already exists, their role is promoted to `ADMIN` and their password is updated.
- **Session Invalidation**: When promoting or updating an existing user, all active refresh tokens for that account are revoked automatically.
- **Password Validation**: Enforces the same validation as public registration (minimum 8 characters, Argon2id encryption).
- **Zero Leakage**: Never prints passwords or dumps environment variables to console output.
- **Docker Container Compatible**: Automatically runs via `ts-node` in development and via compiled JavaScript (`node dist/scripts/create-admin.js`) in production images.

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
  register(
    input: {
      name: "Ada Lovelace"
      email: "ada@example.com"
      password: "securePassword123"
    }
  ) {
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
  login(
    input: { email: "admin@bookdrop.local", password: "AdminPassword123!" }
  ) {
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
  createBook(
    input: {
      title: "Dune"
      isbn: "978-0441172719"
      description: "Science fiction epic on the desert planet Arrakis."
      publishedYear: 1965
      authorIds: [1]
      categoryIds: [2]
    }
  ) {
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

## Circulation Lifecycles & State Machines

Circulation manages physical inventory and reservation requests using two distinct, fully unit-tested finite state machines.

### 1. Copy State Machine (Physical Inventory)

Physical book copies transition between operational and physical condition states. In accordance with domain rules, condition changes are performed manually by library staff, whereas allocation states (`ON_HOLD`, `BORROWED`) are governed strictly by automated domain workflows.

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE : addCopies (Initial status)

    AVAILABLE --> ON_HOLD : [System] Hold Requested / Queue Promoted
    AVAILABLE --> DAMAGED : [Manual Staff] transitionCopyStatus
    AVAILABLE --> LOST : [Manual Staff] transitionCopyStatus
    AVAILABLE --> RETIRED : [Manual Staff] retireCopy

    ON_HOLD --> AVAILABLE : [System] Hold Cancelled / Expired
    ON_HOLD --> BORROWED : [System] Hold Fulfilled / Checkout

    BORROWED --> AVAILABLE : [System] Book Returned in good condition
    BORROWED --> DAMAGED : [Manual Staff] Book Returned damaged
    BORROWED --> LOST : [Manual Staff / System] Overdue / Declared lost

    DAMAGED --> AVAILABLE : [Manual Staff] Repaired
    DAMAGED --> LOST : [Manual Staff] Lost from storage
    DAMAGED --> RETIRED : [Manual Staff] retireCopy (Irreparable)

    LOST --> AVAILABLE : [Manual Staff] Located / Replaced
    LOST --> DAMAGED : [Manual Staff] Located damaged
    LOST --> RETIRED : [Manual Staff] retireCopy (Written off)

    RETIRED --> [*] : Permanent terminal state
```

- **Manual Transitions (Staff - LIBRARIAN / ADMIN)**:
  - `AVAILABLE <-> LOST`
  - `AVAILABLE <-> DAMAGED`
  - `LOST <-> DAMAGED`
  - Any unheld copy in `AVAILABLE`, `LOST`, or `DAMAGED` can be permanently retired via `retireCopy`.
- **System-Only Transitions (Reserved for Holds and Loans workflows)**:
  - `AVAILABLE -> ON_HOLD` (Hold request placed or queue promoted)
  - `ON_HOLD -> AVAILABLE` (Hold cancelled or expired)
  - `ON_HOLD -> BORROWED` (Hold fulfilled at circulation desk)
  - `BORROWED -> AVAILABLE` (Book returned)
- **Retirement Invariants**: Copies in `ON_HOLD` or `BORROWED` status **cannot** be manually altered or retired. Once a copy is `RETIRED`, it enters an irreversible terminal state.

---

### 2. Hold State Machine (Remote Requests & Pickup Deadlines)

Patron remote requests move through a linear, forward-only lifecycle from active reservation to resolution.

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : requestHold / Queue Promotion

    ACTIVE --> FULFILLED : [Staff] Desk Pickup (fulfillHold)
    ACTIVE --> CANCELLED : [Member] cancelMyHold / [Staff] cancelHold
    ACTIVE --> EXPIRED : [System Cron] Pickup deadline passed (expireDueHolds)

    FULFILLED --> [*] : Terminal state (loan activated)
    CANCELLED --> [*] : Terminal state (copy released)
    EXPIRED --> [*] : Terminal state (copy released)
```

- **ACTIVE**: Hold successfully reserved against an available copy with a 24-hour pickup deadline (`expiresAt = now() + 24h`).
- **FULFILLED**: Patron visits the library and checks out the reserved copy.
- **CANCELLED**: Patron self-cancels (`cancelMyHold`) or staff administratively cancels with an audit note (`cancelHold`).
- All resolved states (`FULFILLED`, `CANCELLED`, `EXPIRED`) are immutable terminal states.

---

### 3. Loan State Machine & Lifecycle (Physical Copy Loans)

Loans track physical book copies borrowed by patrons. Loans originate either from an active hold pickup (`confirmPickup`) or a direct walk-in checkout (`checkoutCopy`).

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : confirmPickup (PICKUP) / checkoutCopy (WALK_IN)

    ACTIVE --> RETURNED : [Staff] returnLoan (GOOD: CopyReleasePort -> AVAILABLE)
    ACTIVE --> RETURNED : [Staff] returnLoan (DAMAGED: note required, copy -> DAMAGED)
    ACTIVE --> LOST : [Staff] markLoanLost (fee & note required, copy -> LOST)

    RETURNED --> [*] : Terminal closed state
    LOST --> [*] : Terminal closed state
```

- **ACTIVE**: Loan is active and in the patron's possession. Due date is set 14 calendar days out at `23:59:59.999` in the library's local timezone (`LIBRARY_TIMEZONE`).
- **Dynamic Overdue Evaluation**: There is no scheduled cron job mutating overdue loans in the database. `isOverdue` is calculated dynamically on query (`now > dueAt && status === 'ACTIVE'`), alongside dynamic computation of `daysRemaining`, `daysLate`, and `accruedLateFeeRs`.
- **RETURNED**: The patron returns the physical book copy at the circulation desk (`returnLoan`):
  - **GOOD condition**: Copy is released through `CopyReleasePort` (`AVAILABLE`). If returned after due date, an unpaid `LATE_RETURN` fine is assessed.
  - **DAMAGED condition**: A descriptive note is mandatory (`CONDITION_NOTE_REQUIRED`). Copy transitions `BORROWED -> DAMAGED`. If a damage fee is assessed, a `DAMAGED_BOOK` fine is created. If also late, both `LATE_RETURN` and `DAMAGED_BOOK` fines are created.
- **LOST**: The physical copy is declared lost by staff (`markLoanLost`):
  - Copy transitions `BORROWED -> LOST`.
  - Staff-assessed replacement fee creates an unpaid `LOST_BOOK` fine.
  - No late fees are assessed on lost loans.
- Both `RETURNED` and `LOST` are terminal states. A loan marked `LOST` cannot be returned through `returnLoan`.

---

### 4. Fine State Machine & Financial Ledger

Fines track monetary debts assessed to library patrons for overdue returns, damaged books, or lost materials. Fines follow an immutable append-only ledger pattern backed by `Fine` and `FinePayment` records.

```mermaid
stateDiagram-v2
    [*] --> UNPAID : createFine (LATE_RETURN / DAMAGED_BOOK / LOST_BOOK)

    UNPAID --> PARTIALLY_PAID : [Staff] recordFinePayment (amount < outstanding)
    UNPAID --> PAID : [Staff] recordFinePayment (amount == outstanding)
    UNPAID --> WAIVED : [Admin] waiveFine (justification note required)

    PARTIALLY_PAID --> PAID : [Staff] recordFinePayment (remaining balance)
    PARTIALLY_PAID --> WAIVED : [Admin] waiveFine (retains previous payments)

    PAID --> [*] : Terminal settled state
    WAIVED --> [*] : Terminal settled state
```

- **UNPAID**: Initial fine state (`paidMinor = 0`). Blocks the patron from borrowing books (`checkoutCopy`, `confirmPickup`) or placing holds (`requestHold`).
- **PARTIALLY_PAID**: Patron made a partial payment at the desk. Fine remains active and continues to block new checkouts until fully settled.
- **PAID**: Fine is settled in full (`paidMinor == amountMinor`). Immediately unblocks patron borrowing privileges.
- **WAIVED**: Fine is administratively forgiven by an `ADMIN` (`waivedReason` recorded, audited by `waivedById`). Waived fines unblock patron borrowing immediately. Any earlier partial payments remain recorded in the immutable payment ledger.
- **Immutability Invariant**: Settled fines (`PAID`, `WAIVED`) cannot receive additional payments (`FINE_NOT_PAYABLE`). Overpayments exceeding the outstanding balance are rejected with `OVERPAYMENT`.

---

## 💰 Monetary Rules, Days Late, & Book Price Late-Fee Capping

### Money-Handling Rule (Strict Integer Minor Units)

1. **Integer Minor Units (Paise)**: All monetary amounts (`amountMinor`, `paidMinor`, `assessedFeeMinor`, `priceMinor`, `priceMinorAtBorrow`, `uncappedAmountMinor`, `capMinor`) are calculated and stored strictly as **integer minor units** (paise: ₹1.00 = 100 paise) in PostgreSQL `BIGINT` and TypeScript `number`.
2. **Never Floating-Point Arithmetic**: Floating-point representations (`0.1 + 0.2 = 0.30000000000000004`) are strictly forbidden in domain services and SQL queries.
3. **API Edge Validation**: Amounts cross the GraphQL boundary in Rupees as `Float`, but are immediately validated at the API boundary using strict regular expressions (`^\d+(\.\d{1,2})?$`) via `parseRupeesToMinor` and `parseBookPriceToMinor`. Sub-cent fractional inputs (e.g. `₹10.555`), non-positive values, or values exceeding limits (`MAX_BOOK_PRICE_RS = 1,000,000`) are rejected fail-fast with `INVALID_AMOUNT` or `INVALID_PRICE`.
4. **Display Conversion**: Minor units are converted to Rupees (`minorToRs` or `formatRs`) exclusively at the GraphQL presentation layer when building resolver responses.

---

### Book Replacement Price as Late-Fee Cap

A late return fine can **never exceed the replacement price of the book**.

```
Late Fee = min(Days Late × LATE_FEE_PER_DAY_RS, Cap)
```

#### Why Snapshotting at Borrow Time Matters

- **Eliminates Retroactive Liability Shifts**: When a member checks out a book (`checkoutCopy` or `confirmPickup`), Bookdrop takes an immutable snapshot of the book's current replacement price (`Loan.priceMinorAtBorrow`). If catalog staff subsequently raise the book price (e.g. from ₹400 to ₹800 due to inflation or catalog revaluation), the patron's fine remains strictly capped at the snapshot price ₹400.
- **Audit & Legal Predictability**: Prevents retroactive financial mutation and patron disputes. The financial terms of the loan are locked at transaction time.

#### 4-Tier Cap Resolution Hierarchy

When a loan is returned or when `accruedLateFeeRs` is queried on an active overdue loan, the cap resolves through four descending tiers:

1. **Snapshot on the Loan (`Loan.priceMinorAtBorrow`)**: Primary cap, locked at borrow time.
2. **Live Book Replacement Price**: If the loan has no snapshot (pre-dates price tracking or migrated legacy loans), Circulation queries `CatalogPublicApi.getBookPricesMinor([bookId])` at return time.
3. **Global Cap (`LATE_FEE_CAP_RS`)**: If the book itself has no replacement price (`null`), the system falls back to the configured global cap (if set).
4. **No Cap (`null`)**: If neither the loan, book, nor global config specifies a price/cap, the late fee accrues uncapped.

> [!NOTE]
> The price cap applies **exclusively** to `LATE_RETURN` fines. Damaged book fees (`DAMAGED_BOOK`) and lost book replacement fees (`LOST_BOOK`) are assessed independently based on physical damage assessments and catalog value.

---

### Worked-Example Table: Late Fee & Price Cap Scenarios

Late fees accrue at **₹10.00 / calendar day** based on local date boundaries in the configured `LIBRARY_TIMEZONE` (14-day standard loan period):

| Scenario                           | Book Price (Borrow / Current)           | Days Late | Uncapped Fee |    Cap Applied    | Final Fine  | GraphQL `wasCapped` | Explanation                                                                                                    |
| :--------------------------------- | :-------------------------------------- | :-------: | :----------: | :---------------: | :---------: | :-----------------: | :------------------------------------------------------------------------------------------------------------- |
| **Fee Below Cap**                  | ₹500 / ₹500                             |  3 days   |     ₹30      |       ₹500        | **₹30.00**  |       `false`       | Accrued fee (3 × ₹10 = ₹30) is below the ₹500 replacement price. No capping.                                   |
| **Fee Above Cap**                  | ₹500 / ₹500                             | 100 days  |    ₹1,000    |       ₹500        | **₹500.00** |       `true`        | Uncapped fee is ₹1,000. Capped at book replacement price ₹500. Patron blocked by `UNPAID_FINES` until settled. |
| **Price Changed After Borrow**     | **₹400** at borrow / **₹800** at return |  60 days  |     ₹600     |  ₹400 (snapshot)  | **₹400.00** |       `true`        | **Snapshot isolation**: Capped at checkout price ₹400, ignoring the subsequent catalog price increase to ₹800. |
| **Legacy Loan (No Snapshot)**      | None at borrow / **₹300** at return     |  50 days  |     ₹500     | ₹300 (live price) | **₹300.00** |       `true`        | **Tier 2 fallback**: Loan started before price tracking; resolves live catalog price at return time.           |
| **Unpriced Book (No Global Cap)**  | None / None                             |  50 days  |     ₹500     |       None        | **₹500.00** |       `false`       | **Tier 4 fallback**: No loan snapshot, no book price, no global cap. Fee accrues uncapped.                     |
| **Unpriced Book (Global Cap Set)** | None / None (`LATE_FEE_CAP_RS=50`)      |  50 days  |     ₹500     |   ₹50 (global)    | **₹50.00**  |       `true`        | **Tier 3 fallback**: Book is unpriced, but global cap of ₹50 takes effect.                                     |
| **On-Time Return**                 | ₹500 / ₹500                             |  0 days   |      ₹0      |       ₹500        |  **₹0.00**  |       `false`       | Returned within 14 calendar days. Zero fine.                                                                   |

---

### GraphQL Schema & API Additions

#### Catalog (Books)

- `Book.replacementPriceRs: Float?` (public read-only replacement price in Rupees).
- `CreateBookInput.priceRs: Float?` / `UpdateBookInput.priceRs: Float?` (staff-only mutations, validated: positive, max 2 decimals, max ₹10,00,000; returns code `INVALID_PRICE`).
- Rejection of non-staff price edits with `FORBIDDEN`.

#### Circulation (Fines & Loans)

- `Fine.uncappedAmountRs: Float?` & `Fine.capRs: Float?`: Records the fee that would have accrued and the exact cap applied.
- `Fine.wasCapped: Boolean!` & `MyFine.wasCapped: Boolean!`: Dynamically evaluated in resolver (`amountMinor < (uncappedAmountMinor ?? amountMinor)`).
- `Loan.accruedLateFeeRs`: Dynamically computes real-time accrued late fee capped by the 4-tier hierarchy for active overdue loans.
- `markLoanLost(loanId, note, assessedFeeRs?)`: `assessedFeeRs` is optional; if omitted, defaults to the loan's snapshot price (or current book price). If the book has no price and no fee is provided, fails fail-fast with error code `AMOUNT_REQUIRED`.

---

## 🏛️ Circulation Desk Procedures

### 1. Process a Book Return (`returnLoan`)

1. Patron presents the borrowed book at the circulation desk.
2. Staff scans the copy barcode and inspects its physical condition.
3. If the copy is in **GOOD** condition:
   - Execute `returnLoan(copyBarcode: "...", condition: GOOD)`.
   - The loan is closed (`RETURNED`), and the copy becomes `AVAILABLE` via `CopyReleasePort`.
   - If the book is late, a `LATE_RETURN` fine is assessed automatically.
4. If the copy is **DAMAGED**:
   - Staff must supply a descriptive note explaining the damage (`conditionNote`). Omitting the note fails with `CONDITION_NOTE_REQUIRED`.
   - Staff may optionally enter a repair/replacement fee in Rupees (`damageFeeRs`).
   - The copy moves to `DAMAGED` status with an audit history row. If late and damaged, two distinct fines are created.

### 2. Declare a Lost Book (`markLoanLost`)

1. If a patron reports a book lost, or staff confirms it was never returned:
2. Staff invokes `markLoanLost(loanId: "...", assessedFeeRs: 350.0, note: "Lost by patron on train")`.
3. In one atomic transaction:
   - The loan is locked and moved to `LOST`.
   - The physical copy is moved to `LOST`.
   - A `LOST_BOOK` fine is assessed for the replacement fee. Late return fines are skipped.

### 3. Record a Fine Payment (`recordFinePayment`)

1. Patron pays outstanding dues at the circulation desk (cash, card, or UPI).
2. Staff calls `recordFinePayment(fineId: "...", amountRs: 50.0, note: "Cash desk payment")`.
3. The system appends an immutable `FinePayment` ledger entry, increments `paidMinor`, and transitions the fine to `PARTIALLY_PAID` or `PAID`. Overpayment is rejected.
4. When all fines are cleared, the patron is automatically unblocked from borrowing.

### 4. Administratively Waive a Fine (`waiveFine` - Admin Only)

1. If a patron qualifies for an administrative exemption (e.g. verified medical emergency, institutional partner):
2. An **ADMIN** user calls `waiveFine(fineId: "...", reason: "Medical emergency documented")`. Librarians receive `FORBIDDEN`.
3. The fine transitions to `WAIVED`. Any previous partial payments remain intact in the ledger, and the patron is unblocked.

---

---

### 7. Circulation: Request Hold on a Title (Member)

Requires `Authorization: Bearer <member_token>`:

```graphql
mutation RequestHold {
  requestHold(bookId: 1) {
    id
    bookId
    bookTitle
    status
    expiresAt
    createdAt
  }
}
```

_Note: `copyBarcode` is masked as `null` for MEMBER queries to prevent patron front-running of physical shelf copies._

### 8. Circulation: Cancel Own Active Hold (Member)

Requires `Authorization: Bearer <member_token>`:

```graphql
mutation CancelMyHold {
  cancelMyHold(holdId: 1) {
    id
    status
    resolvedAt
  }
}
```

### 9. Circulation: Query My Holds (Member)

Requires `Authorization: Bearer <member_token>`:

```graphql
query MyHolds {
  myHolds(filter: { status: ACTIVE }) {
    id
    bookTitle
    status
    expiresAt
    copyBarcode # Evaluates to null for patrons
  }
}
```

### 10. Circulation: Staff Inventory & Copy Management (Librarian / Admin)

Requires `Authorization: Bearer <librarian_or_admin_token>`:

```graphql
# Add physical copies with shelf location
mutation AddCopies {
  addCopies(bookId: 1, count: 2, shelfLocation: "STACK-A3") {
    id
    barcode
    status
    shelfLocation
  }
}

# Manually transition condition status (AVAILABLE, DAMAGED, LOST)
mutation TransitionCopyStatus {
  transitionCopyStatus(
    input: {
      copyId: 10
      targetStatus: DAMAGED
      reason: "Water damage on cover"
    }
  ) {
    id
    status
  }
}

# Retire damaged or written-off copy
mutation RetireCopy {
  retireCopy(id: 10, reason: "Beyond repair") {
    id
    isRetired
    retiredAt
  }
}
```

### 11. Circulation: Staff Hold Administration (Librarian / Admin)

Requires `Authorization: Bearer <librarian_or_admin_token>`:

```graphql
# Cancel hold administratively with staff note
mutation CancelHoldByStaff {
  cancelHold(id: 1, staffNote: "Patron called to cancel pickup") {
    id
    status
    resolvedNote
  }
}

# Query all holds across members with pagination and unmasked copy barcodes
query GetAllHolds {
  holds(pagination: { take: 10 }, filter: { status: ACTIVE }) {
    id
    userId
    bookTitle
    copyBarcode # Exposed to staff: "BD-000042"
    status
    expiresAt
  }
}
```

---

## Circulation Desk Workflows (Step 5 & 6)

### 1. Pickup Desk Flow (`confirmPickup`)

The pickup desk flow handles fulfilling a reserved physical copy when the patron arrives at the library desk.

```mermaid
sequenceDiagram
    autonumber
    actor Patron as Member Patron
    actor Staff as Desk Staff (Librarian/Admin)
    participant API as GraphQL API
    participant Lock as PostgreSQL Advisory Lock
    participant DB as PostgreSQL DB
    participant Events as Domain Events

    Patron->>Staff: Arrives at desk to collect hold
    Staff->>API: Query pickupDeskHolds(memberEmail, copyBarcode)
    API-->>Staff: Active holds list with bookTitle & memberName (batched via DataLoaders)
    Staff->>API: Mutation confirmPickup(holdId, copyBarcode)
    API->>DB: Read Hold (unlocked) to discover member userId
    API->>Lock: Acquire pg_advisory_xact_lock(3000, userId)
    API->>DB: Re-read Hold FOR UPDATE
    alt Hold is EXPIRED (expiresAt <= now)
        API->>DB: Roll back transaction
        API->>DB: Autonomous transaction: expireHold(holdId) -> EXPIRED, copy -> AVAILABLE
        API-->>Staff: Error: HOLD_EXPIRED (State converged)
    else Barcode does not match hold copy
        API-->>Staff: Error: COPY_MISMATCH (Hold remains ACTIVE)
    else Member active loans count >= MAX_ACTIVE_LOANS (3)
        API-->>Staff: Error: LOAN_LIMIT_REACHED (Hold remains ACTIVE for later pickup)
    else Validation passes
        API->>DB: HoldsPublicApi.fulfillHold (Hold -> FULFILLED)
        API->>DB: CopiesService.transitionStatus (Copy ON_HOLD -> BORROWED)
        API->>DB: Insert Loan (status: ACTIVE, source: PICKUP, dueAt: 14d end-of-day)
        API->>DB: Commit Transaction
        API->>Events: Emit hold.fulfilled(holdId, loanId)
        API->>Events: Emit loan.started(loanId, userId, bookId, copyId, borrowedAt, dueAt, PICKUP)
        API-->>Staff: Return Loan payload (bookTitle, dueAt, daysRemaining)
    end
```

### 2. Walk-In Checkout Flow (`checkoutCopy`)

The walk-in checkout flow lends an available physical shelf copy directly to a library member without a prior hold.

```mermaid
sequenceDiagram
    autonumber
    actor Patron as Walk-in Member
    actor Staff as Desk Staff (Librarian/Admin)
    participant API as GraphQL API
    participant Lock as PostgreSQL Advisory Lock
    participant DB as PostgreSQL DB
    participant Events as Domain Events

    Patron->>Staff: Brings available shelf copy to circulation desk
    Staff->>API: Mutation checkoutCopy(memberEmail, copyBarcode)
    API->>API: IdentityPublicApi.findMemberByEmail(memberEmail)
    API->>Lock: Acquire pg_advisory_xact_lock(3000, memberId)
    API->>DB: Read Copy FOR UPDATE by barcode
    alt Member not found
        API-->>Staff: Error: MEMBER_NOT_FOUND
    else Copy barcode not found
        API-->>Staff: Error: COPY_NOT_FOUND
    else Copy is retired
        API-->>Staff: Error: COPY_NOT_AVAILABLE
    else Copy is ON_HOLD for another patron
        API-->>Staff: Error: COPY_ON_HOLD
    else Copy is BORROWED, LOST, or DAMAGED
        API-->>Staff: Error: COPY_NOT_AVAILABLE
    else Member already has an active hold on this book
        API-->>Staff: Error: HOLD_EXISTS_USE_PICKUP
    else Member active loans >= MAX_ACTIVE_LOANS (3)
        API-->>Staff: Error: LOAN_LIMIT_REACHED
    else Validation passes
        API->>DB: CopiesService.transitionStatus (Copy AVAILABLE -> BORROWED)
        API->>DB: Insert Loan (holdId: null, status: ACTIVE, source: WALK_IN, dueAt: 14d end-of-day)
        API->>DB: Commit Transaction
        API->>Events: Emit loan.started(loanId, userId, bookId, copyId, borrowedAt, dueAt, WALK_IN)
        API-->>Staff: Return Loan payload
    end
```

---

## Due-Date Rules & Timezone Configuration

### Due-Date Rule

- **14 Calendar Days**: Loans have a standard lending duration of 14 calendar days from the checkout date.
- **End-of-Local-Day**: Due dates expire strictly at `23:59:59.999` local time on the 14th calendar day.
- **Pure Computation**: Implemented via `computeDueDate(borrowedAt, libraryTimezone, loanDays = 14)` in [`src/config/library-rules.ts`](src/config/library-rules.ts) using Luxon:
  ```typescript
  DateTime.fromJSDate(borrowedAt, { zone: libraryTimezone })
    .plus({ days: loanDays })
    .endOf('day')
    .toJSDate();
  ```
- **DST and Leap Year Safety**: Luxon calendar math handles Daylight Saving Time shifts (e.g., 23-hour or 25-hour days) and leap years deterministically, returning the exact end of local day in UTC.

### Timezone Setting (`LIBRARY_TIMEZONE`)

- Configured via the `LIBRARY_TIMEZONE` environment variable (e.g., `America/New_York`, `Asia/Colombo`, `Europe/London`).
- Validated on startup via Joi in [`src/config/env.validation.ts`](src/config/env.validation.ts) using `Intl.DateTimeFormat` validation.
- Defaults to `UTC` if unset.

---

## GraphQL Operations & RBAC Matrix (Circulation Desk, Returns, & Fines)

| Operation                                                          | Type     | Allowed Roles        | Rate Limit        | Description                                                                                                                                                                    |
| :----------------------------------------------------------------- | :------- | :------------------- | :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pickupDeskHolds(memberEmail?, copyBarcode?)`                      | Query    | **LIBRARIAN, ADMIN** | 20 req/min        | Look up active holds ready for collection at the desk. Resolves `bookTitle` and `memberName` via batch DataLoaders (1 query each, 0 N+1).                                      |
| `confirmPickup(holdId: Int!, copyBarcode: String!)`                | Mutation | **LIBRARIAN, ADMIN** | 20 req/min        | Fulfills an active hold and creates an ACTIVE loan in a single atomic transaction. Self-heals expired holds upon rollback.                                                     |
| `checkoutCopy(memberEmail: String!, copyBarcode: String!)`         | Mutation | **LIBRARIAN, ADMIN** | 20 req/min        | Lends an available physical copy to a walk-in member (`holdId = null`). Enforces copy status guards, unpaid fine checks, and patron quota.                                     |
| `returnLoan(copyBarcode, condition, conditionNote?, damageFeeRs?)` | Mutation | **LIBRARIAN, ADMIN** | 20 req/min        | Processes book return in one transaction. Condition GOOD releases copy via `CopyReleasePort`; DAMAGED marks copy damaged (note required). Assesses late and damage fines.      |
| `markLoanLost(loanId, assessedFeeRs, note)`                        | Mutation | **LIBRARIAN, ADMIN** | 20 req/min        | Marks loan and physical copy LOST, assessing a `LOST_BOOK` replacement fine. Skipping late return fines.                                                                       |
| `recordFinePayment(fineId, amountRs, note?)`                       | Mutation | **LIBRARIAN, ADMIN** | 20 req/min        | Records patron fine payment. Appends immutable `FinePayment` row; updates fine to PARTIALLY_PAID or PAID. Rejects overpayment.                                                 |
| `waiveFine(fineId, reason)`                                        | Mutation | **ADMIN only**       | 20 req/min        | Administratively forgives patron fine. Retains prior payments and records audit reason. Unblocks patron immediately.                                                           |
| `loans(filter?, pagination?)`                                      | Query    | **LIBRARIAN, ADMIN** | Default (100/min) | Staff listing of loans with filters (`status`, `userId`, `bookId`, `overdue`, `dueBefore`) and cursor pagination.                                                              |
| `overdueLoans(pagination?)`                                        | Query    | **LIBRARIAN, ADMIN** | Default (100/min) | Staff shortcut query returning active overdue loans with dynamically computed late fees.                                                                                       |
| `loan(id: Int!)`                                                   | Query    | **LIBRARIAN, ADMIN** | Default (100/min) | Staff single-loan lookup by primary key ID.                                                                                                                                    |
| `memberFines(memberEmail, status?)`                                | Query    | **LIBRARIAN, ADMIN** | Default (100/min) | Staff query to look up all fines for a specific member resolved via `IdentityPublicApi`.                                                                                       |
| `fines(filter?, pagination?)`                                      | Query    | **LIBRARIAN, ADMIN** | Default (100/min) | Staff listing of fines across the system with status/reason filters.                                                                                                           |
| `fine(id: ID!)`                                                    | Query    | **LIBRARIAN, ADMIN** | Default (100/min) | Staff single-fine lookup with nested payment history.                                                                                                                          |
| `myLoans(status?)`                                                 | Query    | **MEMBER**           | Default (100/min) | Patron query returning only their own loans. Physical barcodes are redacted (`copyBarcode = null`). Computes `isOverdue`, `daysRemaining`, `daysLate`, and `accruedLateFeeRs`. |
| `myFines(status?)`                                                 | Query    | **MEMBER**           | Default (100/min) | Patron query returning own fines with related book titles batched via DataLoader. Never leaks barcodes, staff names, or other member IDs.                                      |

---

## Stable Error Codes

All domain errors map to stable, machine-readable codes in GraphQL `error.extensions.code`. Error messages are scrubbed to never leak internal implementation details:

| Error Code                | HTTP Status         | Trigger Condition                                                                                            |
| :------------------------ | :------------------ | :----------------------------------------------------------------------------------------------------------- |
| `HOLD_NOT_FOUND`          | 200 (GraphQL error) | Specified hold ID does not exist in the database.                                                            |
| `HOLD_NOT_ACTIVE`         | 200 (GraphQL error) | Specified hold is already FULFILLED, CANCELLED, or EXPIRED.                                                  |
| `HOLD_EXPIRED`            | 200 (GraphQL error) | Hold pickup deadline (`expiresAt <= now`) has elapsed. Triggers autonomous convergence to EXPIRED.           |
| `COPY_MISMATCH`           | 200 (GraphQL error) | Scanned barcode at pickup desk does not match the copy allocated to the hold.                                |
| `COPY_NOT_FOUND`          | 200 (GraphQL error) | Scanned barcode does not match any physical copy record.                                                     |
| `COPY_NOT_AVAILABLE`      | 200 (GraphQL error) | Copy is retired, BORROWED, LOST, or DAMAGED.                                                                 |
| `COPY_ON_HOLD`            | 200 (GraphQL error) | Walk-in checkout attempted on a copy currently reserved (`ON_HOLD`) for another patron.                      |
| `HOLD_EXISTS_USE_PICKUP`  | 200 (GraphQL error) | Walk-in checkout attempted by a member who already holds the same book (must use pickup desk).               |
| `MEMBER_NOT_FOUND`        | 200 (GraphQL error) | Member email or ID was not found in the Identity area.                                                       |
| `LOAN_LIMIT_REACHED`      | 200 (GraphQL error) | Member has reached the maximum quota of 3 active loans (`MAX_ACTIVE_LOANS = 3`).                             |
| `LOAN_NOT_FOUND`          | 200 (GraphQL error) | Specified loan ID does not exist in the database.                                                            |
| `LOAN_NOT_ACTIVE`         | 200 (GraphQL error) | Loan is already RETURNED or LOST when attempting return or marking lost.                                     |
| `NO_ACTIVE_LOAN_FOR_COPY` | 200 (GraphQL error) | Attempted `returnLoan` on a copy that currently has no ACTIVE loan record.                                   |
| `CONDITION_NOTE_REQUIRED` | 200 (GraphQL error) | Staff marked returned copy DAMAGED without providing the required descriptive note.                          |
| `INVALID_AMOUNT`          | 200 (GraphQL error) | Monetary amount is negative, zero, exceeds max fine, or contains sub-cent decimal places (>2 decimals).      |
| `FINE_NOT_FOUND`          | 200 (GraphQL error) | Specified fine ID does not exist in the database.                                                            |
| `FINE_NOT_PAYABLE`        | 200 (GraphQL error) | Payment attempted against a fine that is already settled (`PAID` or `WAIVED`).                               |
| `OVERPAYMENT`             | 200 (GraphQL error) | Payment amount exceeds the remaining outstanding fine balance.                                               |
| `UNPAID_FINES`            | 200 (GraphQL error) | Member has outstanding unpaid or partially paid fines blocking checkout or hold requests.                    |
| `OVERDUE_LOANS`           | 200 (GraphQL error) | Member has active overdue loans blocking new checkouts or hold requests.                                     |
| `FORBIDDEN`               | 200 (GraphQL error) | Authenticated user lacks required role (e.g. MEMBER calling staff mutations, LIBRARIAN calling `waiveFine`). |
| `UNAUTHENTICATED`         | 200 (GraphQL error) | Request lacks a valid JWT bearer token.                                                                      |

---

### Sample GraphQL Operations (Desk Circulation)

#### 1. Desk Holds Lookup (Staff)

```graphql
query PickupDeskHolds {
  pickupDeskHolds(memberEmail: "alice@example.com") {
    id
    memberName
    bookTitle
    copyBarcode
    pickupDeadline
  }
}
```

#### 2. Confirm Pickup (Staff)

```graphql
mutation ConfirmPickup {
  confirmPickup(holdId: 10, copyBarcode: "BD-000042") {
    id
    status
    borrowedAt
    dueAt
    bookTitle
    daysRemaining
  }
}
```

#### 3. Walk-In Checkout (Staff)

```graphql
mutation CheckoutCopy {
  checkoutCopy(memberEmail: "alice@example.com", copyBarcode: "BD-000055") {
    id
    status
    dueAt
    copyBarcode
    isOverdue
  }
}
```

#### 4. Query My Loans (Member)

```graphql
query MyLoans {
  myLoans(status: ACTIVE) {
    id
    bookTitle
    borrowedAt
    dueAt
    isOverdue
    daysRemaining
    daysLate
    copyBarcode # Redacted to null for patrons
  }
}
```

## Architectural Boundaries & Microservice Readiness

Bookdrop is structured into distinct bounded contexts designed for seamless decomposition into independent microservices:

- **Identity**: `src/users`, `src/auth` (Users, Credentials, Refresh Tokens, Roles)
- **Catalog**: `src/books` (Books, Authors, Categories)
- **Circulation**: `src/circulation` (Copies, and upcoming Holds, Loans, Queue, Fines)

### Domain Boundary Rules & Isolation

- Cross-domain boundary rules are enforced at build-time via ESLint (`no-restricted-imports`). Domains may only import public barrel facades (`src/books`, `src/auth`, `src/circulation/copies`) and are strictly forbidden from importing internal services or models.
- Relational joins across domains are eliminated: `BooksService` does not query `Copy` records, and `CopiesService` does not query `Book` records directly.
- Data aggregation (such as `availableCopies` on `Book`) is resolved at the GraphQL resolver layer (`BookCopiesResolver`) using batched `DataLoader` queries (`CopiesPublicApi.availableCountsForBooks`).

| Source Model (Area)               | Target Model (Area)  | Field                           | Status & Strategy Upon Service Split                                                                                     |
| :-------------------------------- | :------------------- | :------------------------------ | :----------------------------------------------------------------------------------------------------------------------- |
| `Copy` (Circulation)              | `Book` (Catalog)     | `Copy.bookId -> Book.id`        | **To remove when services are split.** Will become an unconstrained scalar `bookId` validated via Catalog gRPC/REST API. |
| `CopyStatusHistory` (Circulation) | `User` (Identity)    | `changedById: Int?`             | **Already decoupled.** Deliberately designed as a plain scalar integer ID without a database foreign key constraint.     |
| `Hold` (Circulation)              | `User` (Identity)    | `Hold.userId: Int`              | **Already decoupled.** Plain scalar integer reference; no cross-boundary database foreign key.                           |
| `Hold` (Circulation)              | `Book` (Catalog)     | `Hold.bookId: Int`              | **Already decoupled.** Plain scalar integer reference; no cross-boundary database foreign key.                           |
| `Hold` (Circulation)              | `Copy` (Circulation) | `Hold.copyId -> Copy.id`        | **Intra-domain relationship.** Retains relational foreign key constraint within the Circulation database boundary.       |
| `Loan` (Circulation)              | `User` (Identity)    | `Loan.userId: Int`              | **Already decoupled.** Plain scalar integer reference; no cross-boundary database foreign key.                           |
| `Loan` (Circulation)              | `Book` (Catalog)     | `Loan.bookId: Int`              | **Already decoupled.** Plain scalar integer reference; no cross-boundary database foreign key.                           |
| `Loan` (Circulation)              | `User` (Identity)    | `Loan.checkedOutById: Int`      | **Already decoupled.** Plain staff user ID reference; no cross-boundary database foreign key.                            |
| `Loan` (Circulation)              | `User` (Identity)    | `Loan.returnedById: Int?`       | **Already decoupled.** Plain staff user ID reference; no cross-boundary database foreign key.                            |
| `Loan` (Circulation)              | `Copy` (Circulation) | `Loan.copyId -> Copy.id`        | **Intra-domain relationship.** Retains relational foreign key constraint within the Circulation database boundary.       |
| `Loan` (Circulation)              | `Hold` (Circulation) | `Loan.holdId -> Hold.id`        | **Intra-domain relationship.** Optional 1-to-1 relationship linking a loan to its originating hold within Circulation.   |
| `Fine` (Circulation)              | `User` (Identity)    | `Fine.userId: Int`              | **Already decoupled.** Plain scalar integer reference; no cross-boundary database foreign key.                           |
| `Fine` (Circulation)              | `User` (Identity)    | `Fine.waivedById: Int?`         | **Already decoupled.** Plain staff user ID reference; no cross-boundary database foreign key.                            |
| `Fine` (Circulation)              | `Loan` (Circulation) | `Fine.loanId -> Loan.id`        | **Intra-domain relationship.** Optional relationship linking a fine to its loan within Circulation.                      |
| `FinePayment` (Circulation)       | `Fine` (Circulation) | `FinePayment.fineId -> Fine.id` | **Intra-domain relationship.** Relational foreign key constraint linking a payment to its parent fine.                   |
| `FinePayment` (Circulation)       | `User` (Identity)    | `FinePayment.receivedById: Int` | **Already decoupled.** Plain staff user ID reference; no cross-boundary database foreign key.                            |

### Domain Ports & Extensibility (Open-Closed Principle)

- **`CopyReleasePort` (`src/circulation/loans/ports/copy-release.port.ts`)**:
  - An abstract interface with `release(copyId: number, tx: PrismaTransaction): Promise<void>`.
  - The Stage 7 default implementation (`DefaultCopyReleaseAdapter`) transitions the returned copy `BORROWED -> AVAILABLE` with `transitionStatus` inside the transaction.
  - _Stage 8 Extensibility_: Stage 8 will introduce a reservation queue adapter that inspects waiting holds for the title, assigns the copy directly to the next waiting patron (`ON_HOLD`), and emits notification events — without requiring any modifications to the core `returnLoan` domain logic.
- **`FinesPublicApi.createFine` (`src/circulation/fines/fines-public-api.interface.ts`)**:
  - Clean boundary interface exposed by Fines to Circulation and external modules.
  - Accepts structured input including a required idempotent `dedupeKey` (e.g. `late-return:<loanId>`, `lost:<loanId>`, `damaged:<loanId>`).
  - If a fine with the key already exists, returns the existing record without raising duplicate-entry errors, guaranteeing idempotency during network retries or concurrent operations.

> [!NOTE]
> **PostgreSQL Partial Unique Indexes in Circulation (Holds & Loans)**:
> Prisma schema does not natively represent conditional/partial SQL indexes with `WHERE` clauses. Therefore, critical business invariants are managed via raw SQL in migrations:
>
> - `hold_one_active_per_copy`: `CREATE UNIQUE INDEX hold_one_active_per_copy ON "Hold" ("copyId") WHERE status = 'ACTIVE';` (prevents double-allocation of a physical copy to multiple active holds)
> - `hold_one_active_per_user_book`: `CREATE UNIQUE INDEX hold_one_active_per_user_book ON "Hold" ("userId", "bookId") WHERE status = 'ACTIVE';` (prevents a member from holding the same title multiple times concurrently, while allowing re-holds after resolution)
> - `loan_one_active_per_copy`: `CREATE UNIQUE INDEX loan_one_active_per_copy ON "Loan" ("copyId") WHERE status = 'ACTIVE';` (guarantees a physical copy cannot be checked out to two patrons simultaneously)
>
> `prisma migrate dev` and `prisma migrate deploy` track these indexes through the migration history. Because Prisma only alters indexes declared in `schema.prisma`, it safely ignores these unmanaged partial indexes without generating drift or dropping them.

> [!IMPORTANT]
> **Lost Book Lifecycle & Limitations (Stage 7)**:
> Once an active loan is declared lost via `markLoanLost`, its status transitions to `LOST`, its copy transitions to `LOST`, and an assessed replacement fee (`LOST_BOOK`) is generated without late fee penalties.
> A loan marked `LOST` is terminal and cannot be returned through `returnLoan`. Handling a lost book that is later found or recovered is out of scope for the current circulation lifecycle. A future stage will introduce a dedicated found-copy workflow (re-cataloging, physical condition assessment, and replacement fine adjustment).

---

## Domain Events & Message Contracts

Bookdrop implements an event-driven architecture using asynchronous domain events. Events are defined in [`src/contracts/events.ts`](src/contracts/events.ts) and dispatched strictly **after** database transactions successfully commit. If a transaction fails or rolls back, no domain events are published.

### Event Catalog & Payloads

| Event Name              | Domain        | Description                                                  | Payload Schema                                                                                                                                                                   |
| :---------------------- | :------------ | :----------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copy.created`          | `copy`        | Physical copy added to catalog inventory                     | `{ copyId: number, bookId: number, barcode: string, status: 'AVAILABLE', shelfLocation: string, actorId: number \| null, occurredAt: Date }`                                     |
| `copy.status_changed`   | `copy`        | Copy status transitioned (manual or workflow)                | `{ copyId: number, bookId: number, fromStatus: CopyStatus, toStatus: CopyStatus, reason: string \| null, actorId: number \| null, occurredAt: Date }`                            |
| `copy.retired`          | `copy`        | Copy retired permanently from circulation                    | `{ copyId: number, bookId: number, barcode: string, reason: string \| null, actorId: number \| null, occurredAt: Date }`                                                         |
| `hold.created`          | `hold`        | Active hold created for patron                               | `{ holdId: number, userId: number, bookId: number, copyId: number, expiresAt: Date, createdAt: Date }`                                                                           |
| `hold.cancelled`        | `hold`        | Hold cancelled by patron or staff                            | `{ holdId: number, cancelledBy: 'member' \| 'staff', reason: string \| null, userId: number, bookId: number, copyId: number, cancelledById: number \| null, cancelledAt: Date }` |
| `hold.expired`          | `hold`        | Pickup deadline expired; copy released                       | `{ holdId: number, userId: number, bookId: number, copyId: number, expiredAt: Date }`                                                                                            |
| `hold.fulfilled`        | `circulation` | Hold fulfilled upon desk pickup collection                   | `{ holdId: number, loanId: number }`                                                                                                                                             |
| `loan.started`          | `loan`        | Active loan started via pickup or walk-in checkout           | `{ loanId: number, userId: number, bookId: number, copyId: number, borrowedAt: Date, dueAt: Date, source: 'PICKUP' \| 'WALK_IN' }`                                               |
| `loan.returned`         | `loan`        | Loan closed upon return at desk                              | `{ loanId: number, userId: number, bookId: number, copyId: number, returnedAt: Date, daysLate: number, condition: ReturnCondition }`                                             |
| `loan.lost`             | `loan`        | Loan declared lost by staff with replacement fee             | `{ loanId: number, userId: number, bookId: number, copyId: number, occurredAt: Date }`                                                                                           |
| `fine.created`          | `fine`        | Fine assessed for late return, damaged copy, or lost book    | `{ fineId: number, userId: number, reason: FineReason, amountMinor: number, loanId: number \| null }`                                                                            |
| `fine.payment_recorded` | `fine`        | Payment recorded against an outstanding fine                 | `{ fineId: number, paymentId: number, userId: number, amountMinor: number, paidMinor: number, remainingMinor: number, receivedById: number }`                                    |
| `fine.settled`          | `fine`        | Fine settled in full (PAID) or administratively WAIVED       | `{ fineId: number, userId: number, reason: FineReason, status: 'PAID' \| 'WAIVED', settledAt: Date }`                                                                            |
| `book.price_changed`    | `catalog`     | Replacement price set, updated, or cleared on a catalog book | `{ bookId: number, oldPriceMinor: number \| null, newPriceMinor: number \| null, actorId: number \| null, occurredAt: Date }`                                                    |

### Observability & Subscriber

A centralized subscriber ([`src/common/events/domain-events.subscriber.ts`](src/common/events/domain-events.subscriber.ts)) listens to domain events using wildcard patterns:

- `@OnEvent('copy.*')`
- `@OnEvent('hold.*')`
- `@OnEvent('loan.*')`
- `@OnEvent('fine.*')`
- `@OnEvent('book.*')`

All received events are formatted as structured JSON via [`JsonLogger`](src/common/logger/json-logger.ts) including standard timestamps, log levels, event domain names, and payloads. This provides seamless out-of-the-box ingestion for log aggregation tools (e.g., Datadog, ELK, CloudWatch).

---

## Security Hardening

- **Helmet**: Sets defensive HTTP headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`). In development, Content Security Policy (CSP) is relaxed so the Apollo Sandbox UI loads properly; in production, strict CSP is enforced.
- **Rate Limiting (`@nestjs/throttler`)**: GraphQL-aware throttling with default quota of 100 requests/minute, strict throttling (10 requests/minute) on sensitive authentication endpoints (`login`, `register`, `refreshTokens`), and staff desk throttling (20 requests/minute) on circulation mutations (`confirmPickup`, `checkoutCopy`, `returnLoan`, `markLoanLost`, `recordFinePayment`, `waiveFine`).
- **Query Depth Limiting**: Protects against denial-of-service query nesting attacks by capping GraphQL AST depth at 5 (`depthLimit(5)`).
- **Production Protection**: GraphQL Introspection and Playground are automatically disabled when `NODE_ENV=production`.
- **Field-Level Access Control**: Sensitive fields (`Book.copyCounts`, `Loan.copyBarcode`) are guarded independently at the GraphQL field resolver level using `@UseGuards(RolesGuard)` and field resolvers.

---

## Testing & Quality Assurance

### Run Unit Tests

```bash
npm test
```

_Executes 529 unit tests across 34 test suites covering pure due-date calculation, days-late arithmetic, fee capping, currency parsing/formatting, domain state machines (Copies, Holds, Fines), eligibility policies, clock deadlines, services, loaders, guards, and validators._

### Run End-to-End (E2E) Tests

```bash
npm run test:e2e
```

_Executes 134 integration tests across 9 suites sequentially against the real PostgreSQL container (Returns & Fines lifecycle, advisory lock concurrency loops, payment ledger, raw SQL check constraints, Loans lifecycle, pickup desk, walk-in checkouts, holds lifecycle, 20-member copy contention, CAS race conditions, database partial unique indexes, Auth, RBAC, Catalog, Security headers, Rate limiting, Depth limits)._

### Run Code Linter & Boundary Check

```bash
npm run lint
```

_Enforces TypeScript formatting, code quality, and strict ESLint domain boundary rules across modules._

### Build Production Bundle

```bash
npm run build
```
