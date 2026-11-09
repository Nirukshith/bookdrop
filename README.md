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
| **MEMBER**    | • View catalog books and single book details (`books`, `book` - public)<br>• Register and authenticate (`register`, `login`, `refreshTokens`, `logout`)<br>• View own authenticated profile (`me`)<br>• Request remote holds on titles (`requestHold`)<br>• View own active and historical holds (`myHolds`)<br>• Cancel own active hold (`cancelMyHold`)<br>• View own loans with dynamic overdue fees (`myLoans`)<br>• View own outstanding and historical fines with book title (`myFines`)<br>• Join waiting queue for titles with zero available copies (`joinReservationQueue`)<br>• View own waiting reservations with queue position (`myReservations`)<br>• Cancel own waiting reservation (`cancelReservation`)<br>• _Forbidden from modifying catalog books, managing physical copy inventory, viewing physical copy barcodes (masked), cancelling other patrons' holds/reservations, viewing full book queues, returning loans, declaring lost books, recording payments, waiving fines, or administrative user operations._                                                                |
| **LIBRARIAN** | • All MEMBER permissions<br>• Manage catalog inventory: create new books (`createBook`) and update existing book details/authors/categories (`updateBook`)<br>• Manage physical copy inventory: add copies (`addCopies`), update location (`updateCopy`), manually change condition status (`transitionCopyStatus`), and retire copies (`retireCopy`)<br>• Query physical copy inventory and inspect unmasked barcodes (`copies`, `copy`, `bookCopies`, `Book.copies`)<br>• Manage remote holds across the system: view all member holds (`holds`, `hold`) and administratively cancel holds with staff audit notes (`cancelHold`)<br>• Circulation desk operations: pickup desk fulfillment (`confirmPickup`), walk-in checkouts (`checkoutCopy`), loan returns (`returnLoan`), declaring lost books (`markLoanLost`), viewing active overdue loans (`overdueLoans`), and loan ledger lookups (`loans`, `loan`)<br>• Fine desk operations: record fine payments (`recordFinePayment`), query fine ledger and member fines (`fines`, `fine`, `memberFines`)<br>• Reservation queue operations: inspect FIFO queue for any book (`queueForBook`), lookup individual reservation (`reservation`), inspect title queue length (`Book.queueLength`), and cancel patron reservations with staff audit reason (`cancelReservation`)<br>• _Forbidden from waiving fines or administrative user operations._ |
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
| `SCHEDULER_ENABLED`       | Enables in-process cron timer scheduling for background jobs (`expire-holds`, `send-reminders`). Disabled by default in tests and CLI scripts. | `true`                                                                 |    Optional (default: `false`)    |
| `ADMIN_EMAIL`             | Target email address when running the `npm run create-admin` bootstrap script                                                                 | `admin@bookdrop.io`                                                    |    Required for `create-admin`    |
| `ADMIN_NAME`              | Full name when running the `npm run create-admin` bootstrap script                                                                            | `Primary Administrator`                                                |    Required for `create-admin`    |
| `ADMIN_PASSWORD`          | Plaintext password (min. 8 characters) when running `npm run create-admin`                                                                    | `SecureProductionPassword123!`                                         |    Required for `create-admin`    |
| `RABBITMQ_URL`            | AMQP connection URI for RabbitMQ message broker                                                                                                | `amqp://bookdrop:bookdrop@localhost:5672`                              | Optional (default: `amqp://bookdrop:bookdrop@localhost:5672`) |
| `NOTIFICATIONS_SERVICE_STANDALONE` | When true, disables in-process notification consumption and cron scheduling in bookdrop-api, delegating them to the standalone notifications-service | `false`                                                                | Optional (default: `false`)       |

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
  - An abstract interface with `release(copyId: number, tx: PrismaTransaction, onCommit?: (cb: () => void) => void): Promise<void>`.
  - In Stage 8, `DefaultCopyReleaseAdapter` delegates copy availability to `CopiesService.transitionStatus(copyId, [BORROWED], AVAILABLE, ..., tx)`. Through the `CopyAvailabilityListener` port (`PromotionService`), the copy is immediately and atomically offered to the reservation queue. If an eligible member is waiting, the copy transitions `AVAILABLE -> ON_HOLD` for that patron and creates a `QUEUE_PROMOTION` hold without committing an unreserved available state.
- **`FinesPublicApi.createFine` (`src/circulation/fines/fines-public-api.interface.ts`)**:
  - Clean boundary interface exposed by Fines to Circulation and external modules.
  - Accepts structured input including a required idempotent `dedupeKey` (e.g. `late-return:<loanId>`, `lost:<loanId>`, `damaged:<loanId>`).
  - If a fine with the key already exists, returns the existing record without raising duplicate-entry errors, guaranteeing idempotency during network retries or concurrent operations.

> [!NOTE]
> **PostgreSQL Partial Unique Indexes in Circulation (Holds, Loans, & Reservations)**:
> Prisma schema does not natively represent conditional/partial SQL indexes with `WHERE` clauses. Therefore, critical business invariants are managed via raw SQL in migrations:
>
> - `hold_one_active_per_copy`: `CREATE UNIQUE INDEX hold_one_active_per_copy ON "Hold" ("copyId") WHERE status = 'ACTIVE';` (prevents double-allocation of a physical copy to multiple active holds)
> - `hold_one_active_per_user_book`: `CREATE UNIQUE INDEX hold_one_active_per_user_book ON "Hold" ("userId", "bookId") WHERE status = 'ACTIVE';` (prevents a member from holding the same title multiple times concurrently, while allowing re-holds after resolution)
> - `loan_one_active_per_copy`: `CREATE UNIQUE INDEX loan_one_active_per_copy ON "Loan" ("copyId") WHERE status = 'ACTIVE';` (guarantees a physical copy cannot be checked out to two patrons simultaneously)
> - `reservation_one_waiting_per_user_book`: `CREATE UNIQUE INDEX reservation_one_waiting_per_user_book ON "Reservation" ("userId", "bookId") WHERE status = 'WAITING';` (prevents a member from having more than one active waiting reservation per book while preserving historical audit entries)
>
> `prisma migrate dev` and `prisma migrate deploy` track these indexes through the migration history. Because Prisma only alters indexes declared in `schema.prisma`, it safely ignores these unmanaged partial indexes without generating drift or dropping them.

> [!IMPORTANT]
> **Lost Book Lifecycle & Limitations (Stage 7)**:
> Once an active loan is declared lost via `markLoanLost`, its status transitions to `LOST`, its copy transitions to `LOST`, and an assessed replacement fee (`LOST_BOOK`) is generated without late fee penalties.
> A loan marked `LOST` is terminal and cannot be returned through `returnLoan`. Handling a lost book that is later found or recovered is out of scope for the current circulation lifecycle. A future stage will introduce a dedicated found-copy workflow (re-cataloging, physical condition assessment, and replacement fine adjustment).

---

## 📋 Stage 8: Reservation Queue (Waiting List) & Promotion Engine

Stage 8 implements a high-concurrency waiting list system for titles with zero available physical copies, featuring atomic FIFO queue promotion, automatic copy handoff, patron ineligibility skipping, and deadlock-resilient transaction execution.

### Core Domain Rules & Policies

1. **Strict FIFO Queue Order**:
   - There is exactly one queue per book, ordered strictly first-in-first-out by reservation `id` ASC.
   - Queue position is dynamic and calculated on demand using PostgreSQL window functions: `ROW_NUMBER() OVER (PARTITION BY "bookId" ORDER BY "id" ASC)` across active `WAITING` rows.

2. **Joining Eligibility & Invariants**:
   - A patron may join a book's queue only when the book has **0 AVAILABLE** copies. If any copy is available, the request fails with `COPY_AVAILABLE` ("request a hold instead").
   - A patron cannot join if they already have an active hold on the book (`ALREADY_HELD`) or are already queued for that book (`ALREADY_QUEUED`).
   - Active loan/hold limits (`MAX_ACTIVE_LOANS = 3`, `MAX_ACTIVE_HOLDS = 3`) are **not** checked when joining the queue; they are evaluated when promotion occurs.
   - Patrons with overdue loans (`OVERDUE_LOANS`) or unpaid fines (`UNPAID_FINES`) are blocked from joining.
   - Active queue quota: A member can have at most `MAX_ACTIVE_RESERVATIONS = 5` active `WAITING` reservations across the library (`QUEUE_LIMIT_REACHED`).
   - Queue entries never expire by time. They remain active until promoted or cancelled.

3. **Atomic FIFO Promotion Engine**:
   - **Zero-Unassigned Availability Invariant**: Every path that makes a physical copy `AVAILABLE` immediately and atomically offers it to the reservation queue within the **SAME transaction**:
     - Loan return in `GOOD` condition (via `DefaultCopyReleaseAdapter` / `CopyReleasePort`).
     - Patron or staff hold cancellation (`cancelHold`, `cancelMyHold`).
     - Scheduled pickup hold expiration (`expireHold`).
     - Copy condition status transitions back to `AVAILABLE` (`changeStatus`).
     - Catalog additions of new copies (`addCopy`, `addCopies`).
   - **Promotion Lifecycle**:
     - When offered, the copy transitions `AVAILABLE -> ON_HOLD` for the first eligible waiting member.
     - Creates a `Hold` record with `source: QUEUE_PROMOTION` and a pickup deadline of `PICKUP_HOLD_DAYS` (1 day) from the moment of promotion.
     - The reservation record transitions `WAITING -> PROMOTED`, recording `promotedAt` and linking `holdId`.
     - Post-commit domain events `reservation.promoted` and `hold.created` are emitted.
   - **Ineligibility Skipping & Place Retention**:
     - If candidate patron at position 1 fails eligibility (`checkRequestEligibility`: hold limit, loan limit, unpaid fines, overdue loans), they are **skipped** and **retain their WAITING place**.
     - The engine evaluates the next candidate in FIFO order until an eligible patron is found.
     - If all waiting patrons are ineligible, the copy remains `AVAILABLE`.

4. **Queue Superseding**:
   - If a queued member acquires the book through another channel (e.g., walk-in checkout via `checkoutCopy`, or a remote hold via `requestHold`), their active `WAITING` reservation on that book is automatically and atomically cancelled in the same transaction with `cancelReason = SUPERSEDED` (`reservation.cancelled` emitted post-commit).

5. **Advisory Lock Hierarchy & Deadlock Retry**:
   - To eliminate deadlock risks during cross-member promotions and multi-resource updates, transactions adhere strictly to a top-down lock ordering hierarchy:
     $$\text{Member Advisory Lock (4201)} \longrightarrow \text{Book Reservation Advisory Lock (4202)} \longrightarrow \text{Row Locks (Reservation, Copy, Hold)}$$
   - All transactions triggering queue updates or copy transitions are wrapped in `withTransactionRetry` with exponential jitter backoff, retrying automatically on PostgreSQL transient serialization failures (`40001`) or deadlocks (`40P01`).
   - Side-effect safety: Domain event emission is deferred to `onCommit()` callbacks, guaranteeing zero phantom events on transaction retries or rollbacks.

### Reservation Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> WAITING: joinReservationQueue (Book has 0 AVAILABLE copies)
    WAITING --> PROMOTED: Copy becomes AVAILABLE & Patron is ELIGIBLE (Hold created)
    WAITING --> CANCELLED: cancelReservation (by MEMBER, STAFF, or SUPERSEDED)
    PROMOTED --> [*]: Hold fulfilled to LOAN or expired/cancelled in Stage 9
    CANCELLED --> [*]: Terminal state
```

### GraphQL API Reference (Stage 8)

#### Queries
```graphql
# Patron's own active and historical reservations with dynamic queue position
query {
  myReservations {
    id
    bookId
    book { title }
    status
    position # 1-based queue position if WAITING, null otherwise
    createdAt
    promotedAt
    cancelledAt
    cancelReason
    holdId
  }
}

# Staff inspection of FIFO reservation queue for a specific title
query {
  queueForBook(bookId: 101) {
    id
    userId
    user { email name }
    status
    position
    createdAt
  }
}

# Single reservation lookup
query {
  reservation(id: 42) {
    id
    status
    position
    holdId
  }
}

# Field on Book: Total active waiting patrons
query {
  book(id: 101) {
    title
    queueLength
  }
}
```

#### Mutations
```graphql
# Join waiting list for a title with 0 available copies
mutation {
  joinReservationQueue(bookId: 101) {
    id
    status
    position
    createdAt
  }
}

# Cancel an active reservation (Member can cancel own; Staff can cancel any)
mutation {
  cancelReservation(reservationId: 42, reason: "No longer needed") {
    id
    status
    cancelReason
    cancelledAt
  }
}
```

---

## Scheduled Jobs, Missed Pickups, and Reminders (Stage 9)

Bookdrop features an enterprise background job execution system designed for multi-instance distributed deployments, high reliability, and zero connection-pool starvation.

### Architecture: Distributed Leases & Connection Pool Safety

```
┌────────────────────────────────────────────────────────┐
│                   JobRunnerService                     │
│  - Acquires lease via atomic PostgreSQL CAS            │
│  - Heartbeat lease extension every floor(TTL / 2)     │
│  - Respects max run time budget (50s)                  │
│  - Releases lease in finally block                     │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼ Atomic CAS
┌────────────────────────────────────────────────────────┐
│              PostgreSQL: "JobLease" Table              │
│  UPDATE "JobLease"                                     │
│  SET "lockedUntil" = NOW() + '120 seconds'::interval,  │
│      "lockedBy" = 'worker-node-hostname:pid',          │
│      "lastStartedAt" = NOW()                           │
│  WHERE name = 'expire-holds'                           │
│    AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())│
└────────────────────────────────────────────────────────┘
```

1. **Why Distributed Leases instead of PostgreSQL Advisory Locks?**
   - `pg_advisory_xact_lock` is strictly bound to a single transaction; the lock releases automatically the moment that transaction commits or rolls back.
   - Background jobs process items in **separate, short-lived transactions**. Holding a single transaction open while batch-processing hundreds of items would exhaust database connection pools, create row contention, and block active API traffic.
   - Distributed leases stored in the `JobLease` table survive across multiple transactions while guaranteeing that only one worker node executes a given job at any point in time.

2. **Atomic Compare-and-Swap (CAS) & Automatic Crash Recovery:**
   - Leases are acquired with an atomic conditional update (`lockedUntil < NOW()`). If two worker nodes attempt to acquire the lease simultaneously, exactly one row update succeeds (`count === 1`); the second node yields immediately without error.
   - If a container crashes, restarts, or runs out of memory, the lease automatically expires when `lockedUntil < NOW()` (`LEASE_SECONDS = 120`). No human intervention or manual DB unlock is required.

3. **Connection Pool Safety & Fault Isolation:**
   - Every candidate within a job batch is processed in its own isolated transaction with exponential-backoff retry (`withTransactionRetry`).
   - If item #87 encounters a deadlock or failure, it is logged and skipped. Items 1 through 86 remain committed, and item 88 proceeds normally.
   - Database connections are held for only milliseconds per item, avoiding connection starvation.

4. **Time Budgeting & Batch Limits:**
   - `JOB_BATCH_SIZE = 100`: Jobs process a maximum of 100 items per sweep.
   - `JOB_MAX_RUN_SECONDS = 50`: Long-running sweeps check their elapsed time after every item and gracefully yield before exceeding the budget, leaving ample buffer before the lease expires.

---

### Registered Jobs & Schedule Intervals

The in-process scheduler (`@nestjs/schedule`) activates only when `SCHEDULER_ENABLED=true`. When disabled (default in test and development), no recurring timers are spawned.

| Job Name         | Interval | Purpose                                                                                                                                                                                                         |
| :--------------- | :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expire-holds`   | Every 60s | Queries active holds where `expiresAt <= NOW()` in batches using `FOR UPDATE SKIP LOCKED`. Calls `HoldsService.expireHold`, releases physical copies back to circulation, and promotes waiting queue reservations. |
| `send-reminders` | Every 15m | Performs three sweeps using idempotent `ReminderMark` deduplication to emit communication events for approaching deadlines.                                                                                     |

#### Three Sweeps of `send-reminders`:
1. **Loans Due Soon (`loan.due_soon`)**: Active loans with `dueAt > now AND dueAt <= now + 48h` (`DUE_SOON_HOURS = 48`). Inserts `LOAN_DUE_SOON` mark and emits `loan.due_soon` with remaining hours.
2. **Loans Overdue (`loan.overdue`)**: Active loans with `dueAt <= now`. Inserts `LOAN_OVERDUE` mark and emits `loan.overdue` with `daysLate`.
   > [!NOTE]
   > A loan that is already overdue the first first time the job sweeps it receives **only** the `loan.overdue` event, never a `loan.due_soon` event.
3. **Holds Expiring Soon (`hold.expiring_soon`)**: Active holds with `expiresAt > now AND expiresAt <= now + 6h` (`HOLD_REMINDER_HOURS = 6`). Inserts `HOLD_EXPIRING_SOON` mark and emits `hold.expiring_soon` with remaining hours.

---

### Missed Pickups & Rs 100 Fine Assessment

All hold expiration flows exclusively through `HoldsService.expireHold`, ensuring consistent missed-pickup tracking whether triggered by the background job, CLI script, or the circulation desk.

- **Only Expired Holds Count**: A hold counts as a missed pickup **only** when its final status is `EXPIRED`. Holds cancelled by the patron, cancelled by staff, or fulfilled upon pickup collection never count. Promoted queue holds (`QUEUE_PROMOTION`) that expire DO count.
- **System-Delay Grace Excuse**: If a hold is processed more than `MISSED_PICKUP_GRACE_MINUTES = 60` after its `expiresAt` (e.g., if the application container was stopped or the job caught up late), the hold is expired and the physical copy is released, but the missed pickup is marked `excused = true` with reason `SYSTEM_DELAY`. Excused missed pickups **never** count toward the fine threshold.
- **3-Strike Threshold (`MISSED_PICKUPS_BEFORE_FINE = 3`)**:
  - Unassessed, unexcused missed pickups (`fineId IS NULL AND excused = false`) are grouped in batches of 3, oldest first (`selectMissedPickupsToAssess`).
  - For each group of 3, one fine of **Rs 100** (10,000 paise integer minor units, reason `MISSED_PICKUPS`) is created via `FinesPublicApi.createFine` with idempotent dedupe key `missed-pickups:<userId>:<oldestPickupId>`.
  - The 3 missed pickup records are linked to the newly created fine (`fineId`), resetting the member's unassessed count to zero.

#### Worked Example:
```
Hold #1 expires on Monday at 10:00 AM (processed at 10:01 AM)
  ↳ MissedPickup #1 created: excused = false. (Unassessed count = 1, Fines = 0)

Hold #2 expires on Wednesday at 2:00 PM (processed at 2:02 PM)
  ↳ MissedPickup #2 created: excused = false. (Unassessed count = 2, Fines = 0)

Hold #3 expires on Friday at 9:00 AM (server stopped; processed at 11:30 AM — 150m late > 60m grace)
  ↳ MissedPickup #3 created: excused = true (SYSTEM_DELAY). (Unassessed count remains 2, Fines = 0)

Hold #4 expires on Sunday at 4:00 PM (processed at 4:01 PM)
  ↳ MissedPickup #4 created: excused = false. (Unassessed count = 3)
  ↳ THRESHOLD REACHED! Fine created: Rs 100 (reason: MISSED_PICKUPS).
  ↳ MissedPickups #1, #2, #4 updated with fineId.
  ↳ Unassessed count resets to 0.
```

---

### Execution Interfaces (CLI & GraphQL)

#### 1. Command-Line Interface (CLI)
```bash
# Run hold expiration job
npm run jobs:run -- --job=expire-holds

# Run reminder sweeps job
npm run jobs:run -- --job=send-reminders

# Run all registered jobs sequentially
npm run jobs:run -- --job=all

# Legacy script (forwards directly to expire-holds via the runner)
npm run holds:expire-due
```

#### 2. GraphQL API

##### Member Query: View Own Missed Pickups
```graphql
query {
  myMissedPickups {
    unassessedCount # e.g. 2
    threshold       # 3
    recent {
      id
      bookTitle     # Batched efficiently via DataLoader
      missedAt
      excused
      excusedReason
    }
  }
}
```

##### Librarian & Admin Query: Member Missed Pickups Lookup
```graphql
query {
  memberMissedPickups(memberEmail: "patron@example.com") {
    unassessedCount
    threshold
    recent {
      bookTitle
      missedAt
      excused
      excusedReason
    }
  }
}
```

##### Admin Queries & Mutations: Job Monitoring and Execution
```graphql
# Inspect job lease states, last run status, error message, and JSON execution stats
query {
  jobStatuses {
    name
    isLeased
    lockedUntil
    lockedBy
    lastStartedAt
    lastFinishedAt
    lastStatus
    lastError
    lastStats
  }
}

# Trigger an immediate run of a background job (subject to strict 5 req/min rate limit)
mutation {
  runJob(name: "expire-holds") {
    jobName
    status
    durationMs
    skipped
    error
    stats
  }
}
```

---

### Delivery Guarantees: Transparent At-Most-Once Event Dispatch

> [!IMPORTANT]
> **At-Most-Once Event Dispatch in Stage 9**:
> In Bookdrop, domain events (`hold.expiring_soon`, `loan.due_soon`, `loan.overdue`, `missed_pickup.recorded`, etc.) are published into an in-memory event bus strictly **after** database transactions successfully commit.
>
> If the application container crashes, terminates, or loses power between the database transaction commit and event dispatch:
> - The database state (`Hold`, `MissedPickup`, `ReminderMark`, `Fine`) is permanently and safely committed.
> - The in-memory event notification is dropped and will not be emitted (at-most-once delivery).
>
> In a subsequent architecture stage (Stage 10/11), Bookdrop will introduce the **Transactional Outbox Pattern**: events will be inserted into an `OutboxMessage` database table inside the exact same atomic transaction as the domain state changes, and polled by a dedicated publisher process to guarantee **at-least-once** event delivery.

---

### AWS ECS Deployment & Terraform Configuration

To enable the background job scheduler in your live AWS production environment, configure `SCHEDULER_ENABLED = "true"` in your ECS task definition container definitions.

#### Terraform Configuration Snippet (`terraform/main.tf` or ECS Task Definition)

```hcl
resource "aws_ecs_task_definition" "bookdrop_api" {
  family                   = "bookdrop-api-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["EC2"]
  cpu                      = "256"
  memory                   = "512"

  container_definitions = jsonencode([
    {
      name      = "bookdrop-api"
      image     = "${var.ecr_repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "PORT"
          value = "3000"
        },
        {
          name  = "TRUST_PROXY"
          value = "true"
        },
        # =====================================================================
        # Stage 9: Enable Background Job Scheduler
        # =====================================================================
        {
          name  = "SCHEDULER_ENABLED"
          value = "true"
        }
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/bookdrop/prod/DATABASE_URL"
        },
        {
          name      = "JWT_ACCESS_SECRET"
          valueFrom = "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/bookdrop/prod/JWT_ACCESS_SECRET"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.bookdrop_api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}
```

> [!TIP]
> **Multi-Instance Clustering**:
> When running multiple ECS task replicas (`desired_count > 1`), `SCHEDULER_ENABLED` can safely be set to `"true"` across **all** instances. The `JobLease` distributed database lock ensures that only one instance executes a job at any given time, providing automatic active-passive failover with zero duplicate job runs.

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
| `reservation.joined`          | `reservation` | Member joined reservation queue for title                    | `{ reservationId: number, userId: number, bookId: number, position: number, occurredAt: Date }`                                                                                  |
| `reservation.cancelled`       | `reservation` | Active reservation cancelled (member, staff, or superseded)  | `{ reservationId: number, userId: number, bookId: number, reason: ReservationCancelReason, cancelledById: number, occurredAt: Date }`                                            |
| `reservation.promoted`        | `reservation` | Waiting reservation promoted to active hold upon copy avail  | `{ reservationId: number, userId: number, bookId: number, holdId: number, copyId: number, occurredAt: Date }`                                                                    |
| `missed_pickup.recorded`      | `circulation` | Patron hold expired without collection (excused or active)   | `{ missedPickupId: number, holdId: number, userId: number, bookId: number, excused: boolean, excusedReason: string \| null, missedAt: Date }`                                         |
| `missed_pickup.fine_assessed` | `circulation` | 3 unassessed missed pickups triggered a Rs 100 penalty fine  | `{ fineId: number, userId: number, amountMinor: number, missedPickupIds: number[], assessedAt: Date }`                                                                            |
| `loan.due_soon`               | `circulation` | Active loan due within approaching window (≤ 48 hours)       | `{ loanId: number, userId: number, bookId: number, copyId: number, dueAt: Date, hoursRemaining: number, occurredAt: Date }`                                                      |
| `loan.overdue`                | `circulation` | Active loan passed due deadline; communication event emitted | `{ loanId: number, userId: number, bookId: number, copyId: number, dueAt: Date, daysLate: number, occurredAt: Date }`                                                             |
| `hold.expiring_soon`          | `circulation` | Active hold expires within reminder window (≤ 6 hours)       | `{ holdId: number, userId: number, bookId: number, copyId: number, expiresAt: Date, hoursRemaining: number, occurredAt: Date }`                                                 |

### Observability & Subscriber

A centralized subscriber ([`src/common/events/domain-events.subscriber.ts`](src/common/events/domain-events.subscriber.ts)) listens to domain events using wildcard patterns:

- `@OnEvent('copy.*')`
- `@OnEvent('hold.*')`
- `@OnEvent('loan.*')`
- `@OnEvent('fine.*')`
- `@OnEvent('book.*')`
- `@OnEvent('reservation.*')`
- `@OnEvent('missed_pickup.*')`

All received events are formatted as structured JSON via [`JsonLogger`](src/common/logger/json-logger.ts) including standard timestamps, log levels, event domain names, and payloads. This provides seamless out-of-the-box ingestion for log aggregation tools (e.g., Datadog, ELK, CloudWatch).

---

## Notifications System: Email Delivery (Stage 10)

Bookdrop features an asynchronous, decoupled email notification subsystem located in `src/notifications/`. Designed according to clean architecture and service-extraction principles, the notifications subsystem reacts to domain events emitted across the library lifecycle and dispatches customer communications via swappable email providers.

```mermaid
flowchart TD
    subgraph Domain ["Domain Operations (Catalog / Circulation / Identity)"]
        Tx["DB Transaction (Hold / Loan / Fine / User)"] -->|Commit| Evt["EventEmitter2.emit(domain.event)"]
    end

    subgraph Enqueue ["Step 1: Fast Enqueue (<1ms)"]
        Evt -->|@OnEvent| Sub["NotificationsSubscriber"]
        Sub -->|Pure Mapping Table| Map["mapEventToNotification(event)"]
        Map -->|INSERT ON CONFLICT DO NOTHING| DBQueue[("Notification Table (Status: PENDING)")]
    end

    subgraph Dispatch ["Step 2: Scheduled Send Job (send-notifications)"]
        Job["SendNotificationsJob (Every 30s)"] -->|Reclaim Expired Locks| DBQueue
        Job -->|validUntil <= now| Cancel["Set status: CANCELLED"]
        Job -->|FOR UPDATE SKIP LOCKED (batch 20)| DBQueue
        Job -->|Resolve Fresh Data| Lookups["IdentityPublicApi & CatalogPublicApi"]
        Job -->|Token Bucket Pacing (1/s)| Limiter["TokenBucketRateLimiter"]
        Limiter -->|Send Email| Provider["EmailProvider (Console / SMTP / AWS SES)"]
        Provider -->|Success| Sent["Set status: SENT"]
        Provider -->|Transient Error (4xx, Timeout)| Retry["Set status: PENDING + Exponential Backoff"]
        Provider -->|Permanent Error (5xx, Bounce)| Failed["Set status: FAILED"]
    end
```

### Core Design Principles

1. **Events Enqueue, a Background Job Sends**: Event subscribers never make outbound HTTP/SMTP network calls and never throw into the event bus. They only execute a rapid `INSERT ... ON CONFLICT (dedupeKey) DO NOTHING` (< 1ms). A transient network glitch or third-party email outage can never crash, delay, or roll back a patron's borrowing, return, or hold transaction.
2. **Durable & Idempotent**: Every notification record generates a deterministic, business-derived `dedupeKey` (e.g., `loan-started:101`, `welcome:42`). If an event is re-emitted, the database unique constraint ensures zero duplicate records are enqueued.
3. **Delivery Guarantees (Honest Analysis)**:
   - **Event to Database Row**: Currently **at-most-once**. An unhandled node crash occurring in the brief sub-millisecond gap between a domain transaction commit and the event handler execution could lose that event (a future stage will upgrade this to a transactional outbox table).
   - **Database Row to Dispatch**: **At-least-once**. The background worker claims notifications using atomic row locking (`FOR UPDATE SKIP LOCKED`). If the service crashes after the upstream email provider accepts the dispatch but before the local database marks the row `SENT`, the lock expires after `NOTIFICATION_LOCK_SECONDS` (120s) and at most one duplicate email will be re-sent.
4. **Stale Notification Dropping (`validUntil`)**: Time-sensitive messages (such as `LOAN_DUE_SOON` or `HOLD_EXPIRING_SOON`) carry a `validUntil` expiration timestamp. If worker downtime causes processing to lag past this deadline, the job cancels the notification immediately without emailing the patron, preventing confusing and obsolete alerts.
5. **Fresh Data Resolution at Send Time**: Stored notification payloads hold only immutable references and state. Patron email addresses are resolved fresh via `IdentityPublicApi` and book titles via `CatalogPublicApi` using batched lookups right before rendering, ensuring emails always reflect updated member emails or catalog title corrections.
6. **Privacy & Security Hardening**:
   - **Stored XSS Prevention**: User-controlled inputs (book titles, author names, patron names) are strictly HTML-escaped before injection into templates.
   - **Header Injection Shield**: Outgoing email subject lines are sanitized to strip `\r` and `\n` control characters, preventing email header breakout attacks and unauthorized spam relaying.
   - **Masked PII Logging**: Server logs record recipient emails only in masked form (e.g., `p***@example.com`). Internal database IDs and auth tokens are never included in message bodies.

---

### Notification Lifecycle State Machine

The delivery lifecycle is governed by a strict, pure transition matrix with unit-tested invariants:

```mermaid
stateDiagram-v2
    [*] --> PENDING: Event Enqueued (dedupeKey)
    PENDING --> SENDING: Claimed by Worker (SKIP LOCKED)
    PENDING --> CANCELLED: validUntil passed
    SENDING --> SENT: Provider Dispatch Succeeded
    SENDING --> PENDING: Transient Error (computeBackoffMs)
    SENDING --> FAILED: Permanent Error or Attempts >= 5
    FAILED --> PENDING: Admin retryNotification Mutation
    SENT --> [*]
    CANCELLED --> [*]
```

- **Exponential Backoff with Jitter**:
  $$\text{backoffMs} = \min\left(30\text{s} \times 2^{\text{attempt}} + \text{jitter}(0\text{ to }20\%), 3600\text{s}\right)$$
- **Max Attempts**: Up to 5 attempts before terminal transition to `FAILED`.

---

### The 15 Email Templates & Business Triggers

| Domain Event | Condition | Template | `dedupeKey` | `validUntil` |
| :--- | :--- | :--- | :--- | :--- |
| `hold.created` | `source = 'REQUEST'` | `HOLD_CONFIRMED` | `hold-confirmed:<holdId>` | Hold `expiresAt` |
| `hold.created` | `source = 'QUEUE_PROMOTION'` | _Skipped_ | — | Covered by `reservation.promoted` |
| `reservation.promoted` | Always | `RESERVATION_READY` | `reservation-ready:<reservationId>` | Hold `expiresAt` |
| `hold.expiring_soon` | Always | `HOLD_EXPIRING_SOON` | `hold-expiring:<holdId>` | Hold `expiresAt` |
| `hold.cancelled` | `cancelledBy = 'staff'` | `HOLD_CANCELLED_BY_STAFF` | `hold-cancelled:<holdId>` | None |
| `hold.cancelled` | `cancelledBy = 'member'` | _Skipped_ | — | Patron initiated own cancellation |
| `hold.expired` | Always | _Skipped_ | — | Covered by `missed_pickup.recorded` |
| `missed_pickup.recorded` | `excused = false` | `HOLD_EXPIRED_MISSED` | `hold-expired:<holdId>` | None |
| `missed_pickup.recorded` | `excused = true` | `HOLD_EXPIRED_EXCUSED` | `hold-expired:<holdId>` | None |
| `missed_pickup.fine_assessed` | Always | `MISSED_PICKUP_FINE` | `missed-fine:<fineId>` | None |
| `loan.started` | Always | `LOAN_STARTED` | `loan-started:<loanId>` | None |
| `loan.due_soon` | Always | `LOAN_DUE_SOON` | `loan-due-soon:<loanId>` | Loan `dueAt` |
| `loan.overdue` | Always | `LOAN_OVERDUE` | `loan-overdue:<loanId>` | None |
| `loan.returned` | `daysLate = 0` and `GOOD` | `RETURN_RECEIPT` | `return-receipt:<loanId>` | None |
| `loan.returned` | Late return or damaged | _Skipped_ | — | Covered by `fine.created` notice |
| `fine.created` | `reason != MISSED_PICKUPS` | `FINE_ASSESSED` | `fine-assessed:<fineId>` | None |
| `fine.settled` | `status = 'PAID'` | `FINE_PAID` | `fine-settled:<fineId>` | None |
| `fine.settled` | `status = 'WAIVED'` | `FINE_WAIVED` | `fine-settled:<fineId>` | None |
| `user.registered` | Always | `WELCOME` | `welcome:<userId>` | None |

---

### Email Providers & Traffic Shaping

Bookdrop supports three pluggable email providers:

1. **`ConsoleEmailProvider` (`EMAIL_PROVIDER=console`)**:
   - Default provider for local development, staging previews, and automated testing.
   - Logs masked recipient addresses, message IDs, and subjects without making external network calls.
2. **`SmtpEmailProvider` (`EMAIL_PROVIDER=smtp`)**:
   - Standard RFC-compliant SMTP integration using Nodemailer.
   - Categorizes SMTP 4xx response codes and network timeouts as `TransientEmailError` (triggers backoff retry), and 5xx response codes as `PermanentEmailError` (immediate `FAILED`).
3. **`SesEmailProvider` (`EMAIL_PROVIDER=ses`)**:
   - High-throughput AWS Simple Email Service (SES) integration using `@aws-sdk/client-ses`.
   - **Strict Safety Guard**: Throws an unhandled fatal error and refuses to start if `NODE_ENV !== 'production'`. Real patron emails can never accidentally dispatch from local laptops or test suites.

#### Token Bucket Rate Limiting

AWS SES sandbox accounts enforce a hard ceiling of 1 email per second (`EMAIL_MAX_PER_SECOND=1`). To prevent `ThrottlingException` errors and failure cascades, all dispatches flow through a local in-memory **Token Bucket Rate Limiter** with fractional-millisecond token refill. When bursts occur, outbound requests are smoothly shaped and paced rather than dropped.

---

### GraphQL Inspection & Administrative Controls

The Notifications system exposes inspection queries for members and staff, along with an administrative manual retry mutation:

```graphql
# 1. Member: Inspect own notification history
query MyNotifications {
  myNotifications(pagination: { take: 10, skip: 0 }) {
    id
    template
    status
    createdAt
    sentAt
  }
}

# 2. Staff: Inspect notifications for a specific member by email
query MemberNotifications {
  memberNotifications(memberEmail: "patron@example.com", pagination: { take: 20 }) {
    id
    template
    status
    createdAt
    sentAt
  }
}

# 3. Admin: Reset a FAILED notification back to PENDING for re-delivery
mutation RetryFailedNotification {
  retryNotification(id: 105) {
    id
    status
  }
}
```

---

### AWS ECS & Terraform Configuration

When deploying Bookdrop to AWS ECS in production, configure the following container environment variables and IAM permissions:

```hcl
# AWS ECS Task Definition Environment Snippet
environment = [
  { name = "EMAIL_PROVIDER",        value = "ses" },
  { name = "EMAIL_FROM",            value = "notifications@bookdrop.io" },
  { name = "EMAIL_FROM_NAME",       value = "Bookdrop Library" },
  { name = "SES_REGION",            value = "us-east-1" },
  { name = "EMAIL_MAX_PER_SECOND",   value = "14" }, # Production SES quota
  { name = "NOTIFICATION_BATCH_SIZE", value = "20" }
]
```

```hcl
# AWS IAM Task Execution Policy for Amazon SES
statement {
  sid    = "AllowBookdropSESDispatch"
  effect = "Allow"
  actions = [
    "ses:SendEmail",
    "ses:SendRawEmail"
  ]
  resources = [
    "arn:aws:ses:us-east-1:123456789012:identity/bookdrop.io"
  ]
}
```

---

## Message Broker: RabbitMQ Event Streaming (Stage 11)

In Stage 11, Bookdrop establishes an enterprise message bus using **RabbitMQ** (`3.13-management-alpine`) to decouple the unified **Library Core** (Catalog + Circulation) and **Identity** domains from the **Notifications** consumer subsystem.

### Architectural Decoupling

Rather than relying solely on in-process memory buses, domain events are mirrored to durable RabbitMQ queues, enabling services to scale independently and withstand consumer restarts without losing events.

```mermaid
flowchart LR
    subgraph LibraryCore ["Library Core (Catalog + Circulation)"]
        Domain["Domain Service (Holds / Loans / Fines / Reservations)"]
        EE["EventEmitter2"]
        Pub["RabbitMQPublisherService"]
        Domain -->|Emits Event| EE
        EE -->|@OnEvent| Pub
    end

    subgraph Broker ["RabbitMQ Broker (Port 5672)"]
        Q["Queue: bookdrop.notifications (Durable)"]
        Pub -->|client.emit(eventName, payload)| Q
    end

    subgraph NotificationsSubsystem ["Notifications Subsystem"]
        Consumer["NotificationsConsumer (@Controller / @EventPattern)"]
        Sub["NotificationsSubscriber"]
        DB[("Database (Notification Outbox Table)")]
        Q -->|AMQP Deliver (noAck: false)| Consumer
        Consumer -->|Manual ACK| Q
        Consumer -->|enqueueNotification| Sub
        Sub -->|Idempotent Upsert (dedupeKey)| DB
    end
```

### Key Technical Implementations

1. **Hybrid NestJS Microservice Bootstrap**: The main application boots as both an HTTP/GraphQL server and an AMQP microservice listener (`app.connectMicroservice<MicroserviceOptions>({ transport: Transport.RMQ, ... })`), allowing progressive decomposition into independent microservices.
2. **Error-Shielded Publisher**: The `RabbitMQPublisherService` intercepts domain events emitted on the `@nestjs/event-emitter` bus and forwards them via `ClientProxy.emit`. Dispatches are wrapped in non-blocking error guards so broker delays or connectivity hiccups never roll back primary database transactions.
3. **Manual Acknowledgments (`noAck: false`)**: The `NotificationsConsumer` processes incoming messages and issues an explicit `channel.ack(msg)` upon successful enqueue. If processing fails, it issues `channel.nack(msg, false, false)` to drop poisoned messages safely.
4. **Strict Idempotency**: All notification ingestion leverages deterministic `dedupeKey` unique constraints in PostgreSQL (`ON CONFLICT DO NOTHING`). Duplicate event deliveries across network reconnects are absorbed safely with zero side effects.
5. **RabbitMQ Management Dashboard**:
   - Web UI: [http://localhost:15672](http://localhost:15672)
   - Default credentials: `bookdrop` / `bookdrop`

---

## Notifications Microservice: Standalone Architecture (Stage 12)

Stage 12 extracts the notification subsystem from `bookdrop-api` into an autonomous, headless microservice located at [`services/notifications-service/`](services/notifications-service/).

### Architecture Overview

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer"]
        Web["Web Portal (Next.js)"]
    end

    subgraph CoreService ["bookdrop-api (HTTP / GraphQL :3000)"]
        Auth["Identity Domain"]
        Circ["Library Core (Catalog + Circulation)"]
        Pub["RabbitMQPublisherService"]
        Auth -->|Emits user.registered| Pub
        Circ -->|Emits loan.*, hold.*, fine.*| Pub
    end

    subgraph MessageBroker ["RabbitMQ Broker (:5672)"]
        Q["Queue: bookdrop.notifications"]
        Pub -->|AMQP Dispatch| Q
    end

    subgraph NotificationsService ["services/notifications-service (Autonomous Worker)"]
        Consumer["NotificationsConsumer (AMQP Listener)"]
        Outbox[("PostgreSQL Notification Outbox")]
        Worker["SendNotificationsJob (Every 30s)"]
        Limiter["TokenBucketRateLimiter"]
        SES["AWS SES / SMTP / Console"]

        Q -->|Pulls Message| Consumer
        Consumer -->|Idempotent Upsert| Outbox
        Worker -->|FOR UPDATE SKIP LOCKED| Outbox
        Worker -->|Rate Limited Dispatch| Limiter
        Limiter -->|Send Email| SES
    end

    Web -->|GraphQL Requests| CoreService
```

### Key Architectural Benefits

1. **Failure Isolation**: An email provider outage (e.g. AWS SES rate limits or SMTP network partition) has zero blast radius on patron borrowing, returning, or authentication.
2. **Event Loop Offloading**: CPU-heavy HTML email templating, token bucket throttling, and batch database polling run in a dedicated microservice container, keeping the GraphQL checkout desk API ultra-responsive (< 15ms).
3. **Independent Scalability**: The notification worker scales independently based on message queue depth without multiplying GraphQL API server replicas.
4. **Featherweight Footprint**: The microservice contains no GraphQL/Apollo or password-hashing dependencies, booting in under 1 second and compiling to an optimized **127MB** container image.

---

## Apollo GraphQL Federation Supergraph Architecture (Stage 13)

Stage 13 decomposes Bookdrop into an enterprise **Apollo Federation v2 Supergraph Architecture**. The web frontend connects to a single unified GraphQL Gateway on port `3000`, while backend domain responsibilities are partitioned into autonomous subgraphs and background workers.

### Architecture Overview

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer"]
        Web["Web Portal (Next.js 14)\nhttp://localhost:3000/graphql"]
    end

    subgraph GatewayLayer ["Apollo Supergraph Gateway (services/gateway :3000)"]
        GW["ApolloGateway Router\n(Query Planner & Auth Header Forwarding)"]
    end

    subgraph Subgraphs ["Autonomous Subgraphs"]
        subgraph S1 ["Identity Subgraph (services/identity-service :3001)"]
            AuthSvc["Auth & Users API"]
            AuthDB[("User & Token Store")]
            AuthSvc --> AuthDB
        end

        subgraph S2 ["Library Core Subgraph (bookdrop-api :3002)"]
            Catalog["Catalog (Books)"]
            Circ["Circulation Engine (Loans, Holds, Fines)"]
            CoreDB[("Library Core Store")]
            Catalog --> CoreDB
            Circ --> CoreDB
        end
    end

    subgraph MessageBroker ["RabbitMQ Event Bus (:5672)"]
        Ex["Exchange: bookdrop.events"]
        Q["Queue: bookdrop.notifications"]
        Ex --> Q
    end

    subgraph WorkerService ["Notifications Microservice (services/notifications-service)"]
        Worker["Headless AMQP Worker &\nOutbox Dispatcher (AWS SES / SMTP)"]
    end

    Web -->|Unified GraphQL Query| GW
    GW -->|Routes 'me', 'login', 'register'| AuthSvc
    GW -->|Routes 'books', 'loans', 'holds', 'fines'| S2

    AuthSvc -.->|Publishes user.registered| Ex
    S2 -.->|Publishes loan.*, hold.*, fine.*| Ex
    Q -->|Consumes Events| Worker
```

### Federated Microservices Rationale & Ports

| Service | Directory | Port | Protocol | Domain Responsibilities |
|---|---|---|---|---|
| **Apollo Gateway** | [`services/gateway/`](services/gateway/) | `3000` | HTTP / GraphQL | Supergraph schema composition, query planning, request routing, and context/auth header forwarding via `RemoteGraphQLDataSource`. |
| **Identity Subgraph** | [`services/identity-service/`](services/identity-service/) | `3001` | HTTP / GraphQL | Patron/Staff registration, Argon2 password hashing, JWT issuance & refresh token lifecycle, user roles, and `user.registered` event publishing. |
| **Library Core Subgraph** | Root (`bookdrop-api`) | `3002` | HTTP / GraphQL | Cataloging (`Book`), physical items (`Copy`), circulation checkout & return desk, FIFO reservation queues, fine calculation, and payment processing. |
| **Notifications Service** | [`services/notifications-service/`](services/notifications-service/) | _None (Headless)_ | AMQP (Port 5672) | Token-bucket rate-limited outbox worker consuming RabbitMQ events and delivering AWS SES / SMTP emails. |

---

## Security Hardening

- **Helmet**: Sets defensive HTTP headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`). In development, Content Security Policy (CSP) is relaxed so the Apollo Sandbox UI loads properly; in production, strict CSP is enforced.
- **Rate Limiting (`@nestjs/throttler`)**: GraphQL-aware throttling with default quota of 100 requests/minute, strict throttling (10 requests/minute) on sensitive authentication endpoints (`login`, `register`, `refreshTokens`), and staff desk throttling (20 requests/minute) on circulation mutations (`confirmPickup`, `checkoutCopy`, `returnLoan`, `markLoanLost`, `recordFinePayment`, `waiveFine`, `joinReservationQueue`, `cancelReservation`), and job execution (`runJob` throttled to 5 requests/minute).
- **Query Depth Limiting**: Protects against denial-of-service query nesting attacks by capping GraphQL AST depth at 5 (`depthLimit(5)`).
- **Production Protection**: GraphQL Introspection and Playground are automatically disabled when `NODE_ENV=production`.
- **Field-Level Access Control**: Sensitive fields (`Book.copyCounts`, `Loan.copyBarcode`) are guarded independently at the GraphQL field resolver level using `@UseGuards(RolesGuard)` and field resolvers.

---

## Testing & Quality Assurance

### Run Unit Tests

```bash
npm test
```

_Executes 821+ unit tests across 60 test suites covering pure due-date calculation, days-late arithmetic, fee capping, currency parsing/formatting, domain state machines (Copies, Holds, Fines, Reservations, Notifications), email formatting & sanitization, Token Bucket rate limiting, email providers, pure event-to-notification mapping, transaction retry helper with jitter backoff, eligibility policies, clock deadlines, services, loaders, guards, validators, job runner, distributed leases, scheduler, RabbitMQ publisher, and microservice consumer._

### Run End-to-End (E2E) Tests

```bash
npm run test:e2e
```

_Executes 185 integration tests across 14 suites sequentially against real PostgreSQL and RabbitMQ containers, including Stage 13 Apollo Federation Supergraph query routing, auth header forwarding, and cross-service queries across Gateway, Identity Subgraph, and Library Core Subgraph._

### Run Identity Subgraph Tests

```bash
cd services/identity-service
npm test
npm run build
```

_Executes 36 unit tests across 3 suites verifying Argon2 hashing, JWT rotation, token reuse detection, role guards, and GraphQL reference resolvers._

### Run Apollo Gateway Tests

```bash
cd services/gateway
npm test
npm run build
```

_Executes gateway unit tests and verifies supergraph composition and health endpoints._

### Run Notifications Microservice Tests

```bash
cd services/notifications-service
npm test
npm run test:e2e
```

_Executes 107 unit tests across 9 test suites and 1 E2E test verifying headless microservice booting, AMQP consumer processing, outbox sweeps, and email provider delivery._

### Run Code Linter & Boundary Check

```bash
npm run lint
```

_Enforces TypeScript formatting, code quality, and strict ESLint domain boundary rules across modules._

### Build Production Bundle

```bash
npm run build
```

---

## Stage 14 — Kubernetes Orchestration & Autonomous Scaling

Bookdrop's federated supergraph is fully deployable on Kubernetes using a local [Kind](https://kind.sigs.k8s.io/) cluster. All four microservices run as independent Deployments with health probes, resource limits, and horizontal autoscaling.

### Architecture in K8s

```
Internet
   │
   ▼ NodePort :30080  (host: http://localhost:8080)
┌──────────────────────┐
│   Apollo Gateway     │  ← Deployment (2 replicas)
│   gateway:k8s-local  │
└───────┬──────────────┘
        │  ClusterIP (internal DNS)
   ┌────┴───────────────────┐
   │                        │
   ▼ :3001                  ▼ :3002
┌──────────────┐    ┌──────────────────────┐
│  identity-   │    │    library-core       │  ← HPA: min 2 / max 5
│  service     │    │  (bookdrop-api image) │
└──────────────┘    └──────────────────────┘
        │                   │
        └────────┬──────────┘
                 ▼ :5672
         ┌──────────────────┐
         │    RabbitMQ      │
         └──────────────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │  notifications-service │  ← headless worker, no port
     └───────────────────────┘
                 │
     ┌───────────▼───────────┐
     │       PostgreSQL       │  ← ClusterIP :5432
     └───────────────────────┘
```

### K8s Manifest Files

| File | Purpose |
|------|---------|
| `k8s/namespace.yaml` | `bookdrop` namespace |
| `k8s/secrets.yaml` | DB URL, JWT secrets, RabbitMQ credentials |
| `k8s/postgres.yaml` | PostgreSQL Deployment + ClusterIP |
| `k8s/rabbitmq.yaml` | RabbitMQ Deployment + ClusterIP |
| `k8s/migration-job.yaml` | Prisma migrate + seed Job |
| `k8s/identity-deployment.yaml` | Identity service Deployment + ClusterIP |
| `k8s/library-core-deployment.yaml` | Library Core Deployment + ClusterIP (HPA target) |
| `k8s/notifications-deployment.yaml` | Notifications headless worker Deployment |
| `k8s/gateway-deployment.yaml` | Apollo Gateway Deployment + NodePort :30080 |
| `k8s/hpa.yaml` | HPA for library-core (min:2, max:5, CPU:70%, Mem:80%) |
| `k8s/deploy-local.sh` | Full automation: build → load → deploy |

### One-Command Local Deploy

```bash
# 1. Create the Kind cluster (first time only)
kind create cluster --config k8s/kind-config.yaml --name bookdrop-cluster

# 2. Deploy everything
bash k8s/deploy-local.sh
```

The script:
1. Builds all 4 Docker images locally
2. Loads them into the Kind cluster (`imagePullPolicy: Never`)
3. Applies namespace, secrets, Postgres, RabbitMQ
4. Runs the Prisma migration + seed Job
5. Scales down the legacy monolith and hands port 30080 to the Gateway
6. Deploys identity-service, library-core, notifications-service, gateway
7. Installs metrics-server + applies the HPA

### Smoke Tests

```bash
# Health check
curl -s http://localhost:8080/health | python3 -m json.tool

# GraphQL query (federated supergraph)
curl -s -X POST http://localhost:8080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ books { id title } }"}' | python3 -m json.tool
```

### View Running Pods & HPA

```bash
kubectl get pods -n bookdrop
kubectl get hpa  -n bookdrop
kubectl top pods -n bookdrop   # requires metrics-server
```
