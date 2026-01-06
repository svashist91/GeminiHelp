export interface SearchHit {
  messageId: string;
  snippet: string;
  rank: number;
  createdAt: string;
}

export interface SearchResultGroup {
  sessionId: string;
  sessionTitle: string;
  hits: SearchHit[];
}

export interface SearchResponse {
  query: string;
  results: SearchResultGroup[];
}

export async function searchChats(
  getToken: () => Promise<string | null>,
  q: string,
  limit = 20
): Promise<SearchResponse> {
  const token = await getToken();

  if (!token) {
    throw new Error('Please log in again');
  }

  const url = `http://localhost:3001/api/chat/search?q=${encodeURIComponent(q)}&limit=${limit}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      throw new Error('Please log in again');
    }

    if (!res.ok) {
      throw new Error('Search failed');
    }

    return res.json();
  } catch (err) {
    console.error('[search] request failed', err);
    throw err instanceof Error ? err : new Error('Search failed');
  }
}

