import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://gateway-service:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      headers['authorization'] = authHeader;
    }

    const res = await fetch(`${BACKEND_URL}/graphql`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { errors: [{ message: err.message || 'Failed to proxy request to GraphQL Gateway' }] },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const targetUrl = new URL(`${BACKEND_URL}/graphql`);
    targetUrl.search = url.search;

    const headers: Record<string, string> = {};
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      headers['authorization'] = authHeader;
    }

    const res = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { errors: [{ message: err.message || 'Failed to proxy request to GraphQL Gateway' }] },
      { status: 502 }
    );
  }
}

