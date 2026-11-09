import { ChildProcess, spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

describe('Stage 13: Apollo Federation Supergraph E2E Integration', () => {
  jest.setTimeout(60000);

  let identityProc: ChildProcess;
  let libraryCoreProc: ChildProcess;
  let gatewayProc: ChildProcess;
  const prisma = new PrismaClient();

  const testEmail = `stage13_patron_${Date.now()}@example.com`;
  let authToken: string;

  async function waitForUrl(
    url: string,
    timeoutMs = 30000,
    procErrors?: { error: string },
  ) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (procErrors && procErrors.error) {
        throw new Error(
          `Process error detected while waiting for ${url}: ${procErrors.error}`,
        );
      }
      try {
        const res = await fetch(url);
        if (res.status === 200 || res.status === 400 || res.status === 405) {
          return true;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(
      `Timeout waiting for ${url}. Process errors: ${procErrors?.error || 'None'}`,
    );
  }

  beforeAll(async () => {
    const rootDir = resolve(__dirname, '..');
    const identityDir = resolve(rootDir, 'services/identity-service');
    const gatewayDir = resolve(rootDir, 'services/gateway');

    // Ensure build artifacts exist before spawning processes
    if (!existsSync(resolve(rootDir, 'dist/main.js'))) {
      execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
    }
    if (!existsSync(resolve(identityDir, 'dist/main.js'))) {
      execSync('npx prisma generate && npm run build', {
        cwd: identityDir,
        stdio: 'inherit',
      });
    }
    if (!existsSync(resolve(gatewayDir, 'dist/main.js'))) {
      execSync('npm run build', { cwd: gatewayDir, stdio: 'inherit' });
    }

    const identityErrors = { error: '' };
    const libraryErrors = { error: '' };
    const gatewayErrors = { error: '' };

    // 1. Spawn Identity Subgraph on Port 3001
    identityProc = spawn(
      process.execPath,
      ['services/identity-service/dist/main.js'],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          PORT: '3001',
          NODE_ENV: 'test',
        },
        stdio: 'pipe',
      },
    );
    identityProc.stderr?.on('data', (d) => {
      identityErrors.error += d.toString();
    });
    identityProc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        identityErrors.error += ` [Identity process exited prematurely with code ${code}]`;
      }
    });

    // 2. Spawn Library Core Subgraph on Port 3002
    libraryCoreProc = spawn(process.execPath, ['dist/main.js'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: '3002',
        IDENTITY_SERVICE_STANDALONE: 'true',
        NOTIFICATIONS_SERVICE_STANDALONE: 'true',
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });
    libraryCoreProc.stderr?.on('data', (d) => {
      libraryErrors.error += d.toString();
    });
    libraryCoreProc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        libraryErrors.error += ` [Library Core process exited prematurely with code ${code}]`;
      }
    });

    // Wait until both subgraphs are healthy and accepting connections
    await waitForUrl('http://localhost:3001/graphql', 30000, identityErrors);
    await waitForUrl('http://localhost:3002/graphql', 30000, libraryErrors);

    // 3. Spawn Apollo Gateway on Port 3000
    gatewayProc = spawn(process.execPath, ['services/gateway/dist/main.js'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: '3000',
        IDENTITY_SUBGRAPH_URL: 'http://localhost:3001/graphql',
        LIBRARY_CORE_SUBGRAPH_URL: 'http://localhost:3002/graphql',
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });
    gatewayProc.stderr?.on('data', (d) => {
      gatewayErrors.error += d.toString();
    });
    gatewayProc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        gatewayErrors.error += ` [Gateway process exited prematurely with code ${code}]`;
      }
    });

    // Wait until Gateway has composed supergraph and started HTTP server
    await waitForUrl('http://localhost:3000/health', 30000, gatewayErrors);
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    } catch {
      // Ignore if user wasn't persisted
    }
    await prisma.$disconnect();

    if (gatewayProc) gatewayProc.kill('SIGTERM');
    if (libraryCoreProc) libraryCoreProc.kill('SIGTERM');
    if (identityProc) identityProc.kill('SIGTERM');
  });

  it('Gateway Health: should return status ok from GET /health', async () => {
    const res = await fetch('http://localhost:3000/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gateway');
  });

  it('Supergraph Routing: should route "register" mutation to Identity Subgraph via Gateway', async () => {
    const mutation = `
      mutation RegisterPatron($input: RegisterInput!) {
        register(input: $input) {
          accessToken
          user {
            id
            email
            name
            role
          }
        }
      }
    `;

    const res = await fetch('http://localhost:3000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            name: 'Federation Patron',
            email: testEmail,
            password: 'Password123!',
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.errors).toBeUndefined();
    expect(json.data.register.accessToken).toBeDefined();
    expect(json.data.register.user.email).toBe(testEmail);
    expect(json.data.register.user.role).toBe('MEMBER');

    authToken = json.data.register.accessToken;
  });

  it('Supergraph Routing: should route "books" query to Library Core Subgraph via Gateway', async () => {
    const query = `
      query GetBooks {
        books {
          id
          title
          isbn
        }
      }
    `;

    const res = await fetch('http://localhost:3000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.errors).toBeUndefined();
    expect(Array.isArray(json.data.books)).toBe(true);
    expect(json.data.books.length).toBeGreaterThan(0);
  });

  it('Cross-Service Query: should resolve "me" (Identity) + "books" (Library Core) in a single request with auth header forwarding', async () => {
    const crossServiceQuery = `
      query CrossServiceDashboard {
        me {
          id
          name
          email
          role
        }
        books {
          id
          title
        }
      }
    `;

    const res = await fetch('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ query: crossServiceQuery }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.errors).toBeUndefined();

    // From Identity Subgraph
    expect(json.data.me).toBeDefined();
    expect(json.data.me.email).toBe(testEmail);
    expect(json.data.me.name).toBe('Federation Patron');

    // From Library Core Subgraph
    expect(json.data.books).toBeDefined();
    expect(Array.isArray(json.data.books)).toBe(true);
    expect(json.data.books.length).toBeGreaterThan(0);
  });
});
