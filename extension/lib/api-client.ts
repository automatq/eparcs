const API_BASE = "http://localhost:3000";

async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.session.get("authToken");
  return (result.authToken as string) ?? null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function saveLead(lead: any): Promise<any> {
  return apiRequest("/api/leads", {
    method: "POST",
    body: JSON.stringify(lead),
  });
}

export async function draftOutreach(leadId: string, channel: string): Promise<any> {
  return apiRequest("/api/ai/draft", {
    method: "POST",
    body: JSON.stringify({ leadId, channel }),
  });
}
