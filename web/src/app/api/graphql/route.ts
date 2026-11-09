import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const headers: Record<string, string> = {
      'content-type': req.headers.get('content-type') || 'application/json',
    };

    const auth = req.headers.get('authorization');
    if (auth) {
      headers['authorization'] = auth;
    }

    const res = await fetch(`${BACKEND_URL}/graphql`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        errors: [
          {
            message:
              error.message || 'Failed to proxy GraphQL request to Gateway',
          },
        ],
      },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { search } = new URL(req.url);
    const headers: Record<string, string> = {};
    const auth = req.headers.get('authorization');
    if (auth) {
      headers['authorization'] = auth;
    }

    const res = await fetch(`${BACKEND_URL}/graphql${search}`, {
      method: 'GET',
      headers,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        errors: [
          {
            message:
              error.message || 'Failed to proxy GraphQL request to Gateway',
          },
        ],
      },
      { status: 502 },
    );
  }
}

