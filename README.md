# Bookdrop

A library system with remote holds, pickup, and reservations.

Bookdrop is a backend-first library management platform where members can browse books, discover titles by author or category, and check the availability of physical copies. Future stages will introduce remote holds, loans, fines, and queue reservations.

---

## Tech Stack

* **Framework**: NestJS (TypeScript)
* **API**: GraphQL (Code-First with Apollo Server)
* **Database**: PostgreSQL 16 (run in Docker)
* **ORM**: Prisma ORM
* **Testing**: Jest (Unit) & Supertest (E2E)
* **CI/CD**: GitHub Actions

---

## Getting Started

### 1. Prerequisites
* **Node.js**: v22 LTS (matches CI runtime)
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
Ensure `DATABASE_URL` in `.env` matches your local database port (default: `localhost:5433` if port 5432 is occupied on macOS, or `localhost:5432`).

### 4. Start PostgreSQL with Docker
Start the isolated PostgreSQL 16 container:
```bash
docker compose up -d
```
Verify the container is healthy:
```bash
docker compose exec db pg_isready -U bookdrop -d bookdrop
```

### 5. Run Database Migrations
Apply the initial schema to the database:
```bash
npx prisma migrate deploy
```

### 6. Seed the Database
Seed 30 books, 10 authors, 8 categories, and 79 copies (all available):
```bash
npx prisma db seed
```
*(The seed script is idempotent and safe to run multiple times).*

### 7. Run the Application
Start the NestJS server in development mode:
```bash
npm run start:dev
```
The server will start at `http://localhost:3000`.

---

## Testing

Run unit tests:
```bash
npm test
```

Run end-to-end (E2E) GraphQL tests:
```bash
npm run test:e2e
```

Run ESLint code formatting checks:
```bash
npm run lint
```

---

## GraphQL API

Once the server is running, open the interactive GraphQL Playground / Apollo Sandbox at:
```
http://localhost:3000/graphql
```

### Example: Search and Filter Books
```graphql
query GetBooks {
  books(
    search: "1984"
    take: 5
    skip: 0
  ) {
    id
    title
    isbn
    publishedYear
    availableCopiesCount
    authors {
      id
      name
    }
    categories {
      id
      name
    }
  }
}
```

### Example: Query Single Book by ID
```graphql
query GetBookById {
  book(id: 1) {
    id
    title
    isbn
    description
    publishedYear
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

---

## Business Rules Configuration
Core library constraints (holds, loan duration, fine amounts) are managed centrally in [`src/config/library-rules.ts`](src/config/library-rules.ts):
* `PICKUP_HOLD_DAYS = 1`
* `LOAN_DAYS = 14`
* `MAX_ACTIVE_LOANS = 3`
* `MAX_ACTIVE_HOLDS = 3`
* `MISSED_PICKUPS_BEFORE_FINE = 3`
* `MISSED_PICKUP_FINE_RS = 100`
* `LATE_FEE_PER_DAY_RS = 10`

---

## Authentication & Tokens

### GraphQL Auth Mutations

```graphql
# Register a new member
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

# Login
mutation Login {
  login(input: {
    email: "ada@example.com"
    password: "securePassword123"
  }) {
    accessToken
    refreshToken
    user {
      id
      role
    }
  }
}

# Rotate refresh token
mutation Refresh {
  refreshTokens(refreshToken: "raw_refresh_token_string") {
    accessToken
    refreshToken
  }
}

# Logout (revokes active refresh token)
mutation Logout {
  logout(refreshToken: "raw_refresh_token_string")
}
```

### Token Delivery Trade-offs Note

Currently, `accessToken` and `refreshToken` are returned directly in the GraphQL response body:
* **Response Body Delivery (Current)**:
  - *Pros*: Simple, framework-agnostic, and works seamlessly with native mobile clients, CLI tools, and automated API testing without cookie-handling overhead.
  - *Cons*: If frontend clients store tokens in browser `localStorage` or `sessionStorage`, they become vulnerable to extraction via Cross-Site Scripting (XSS).
* **`httpOnly` Cookie Delivery (Recommended for Browser Frontends)**:
  - *Pros*: Shields the refresh token from client-side JavaScript, neutralizing XSS token theft.
  - *Cons*: Requires Cross-Origin Resource Sharing (CORS) credentials configuration and Cross-Site Request Forgery (CSRF) protections (e.g., SameSite attributes or anti-CSRF tokens). Browser cookie delivery can be revisited during frontend integration.
