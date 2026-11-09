const REFRESH_MUTATION = `
  mutation RefreshTokens($refreshToken: String!) {
    refreshTokens(refreshToken: $refreshToken) {
      accessToken
      refreshToken
      user {
        id
        email
        name
        role
      }
    }
  }
`;

export class GraphQLError extends Error {
  errors: any[];
  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'GraphQLError';
    this.errors = errors;
  }
}

function getGraphQLEndpoint(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_GRAPHQL_URL || '/api/graphql';
  }
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  return `${backendUrl}/graphql`;
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const refreshToken = localStorage.getItem('bookdrop_refresh_token');
  if (!refreshToken) return null;

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const endpoint = getGraphQLEndpoint();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: REFRESH_MUTATION,
          variables: { refreshToken },
        }),
      });

      const json = await res.json();
      if (json.data?.refreshTokens) {
        const { accessToken: newAccess, refreshToken: newRefresh, user } = json.data.refreshTokens;
        localStorage.setItem('bookdrop_access_token', newAccess);
        localStorage.setItem('bookdrop_refresh_token', newRefresh);
        localStorage.setItem('bookdrop_user', JSON.stringify(user));
        return newAccess;
      }
      // If refresh failed, clear tokens
      localStorage.removeItem('bookdrop_access_token');
      localStorage.removeItem('bookdrop_refresh_token');
      localStorage.removeItem('bookdrop_user');
      return null;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function fetchGraphQL<T = any>(
  query: string,
  variables: Record<string, any> = {},
  options: { token?: string; skipAuth?: boolean } = {}
): Promise<T> {
  const endpoint = getGraphQLEndpoint();

  let token = options.token;
  if (!token && !options.skipAuth && typeof window !== 'undefined') {
    token = localStorage.getItem('bookdrop_access_token') || undefined;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
  } catch (networkError: any) {
    throw new Error(
      `Network error connecting to Bookdrop GraphQL API at ${endpoint}: ${networkError.message}`
    );
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Invalid JSON response from ${endpoint} (HTTP ${response.status})`);
  }

  // Handle Unauthorized / 401 error or GraphQL Unauthorized error
  const hasAuthError =
    response.status === 401 ||
    (json.errors &&
      json.errors.some((err: any) =>
        err.message?.toLowerCase().includes('unauthorized') ||
        err.extensions?.code === 'UNAUTHENTICATED' ||
        err.extensions?.originalError?.statusCode === 401
      ));

  if (hasAuthError && !options.skipAuth && typeof window !== 'undefined') {
    const newToken = await attemptTokenRefresh();
    if (newToken) {
      // Retry once with new token
      return fetchGraphQL<T>(query, variables, { token: newToken, skipAuth: false });
    }
  }

  if (json.errors && json.errors.length > 0) {
    const firstMessage = json.errors[0]?.message || 'GraphQL operation failed';
    throw new GraphQLError(firstMessage, json.errors);
  }

  return json.data as T;
}

