import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (
  import.meta.env.DEV
    ? 'http://localhost:10000'
    : '' // In production, VITE_API_BASE_URL must be set in environment variables
);

if (!API_BASE_URL && !import.meta.env.DEV) {
  console.error('[apiClient] VITE_API_BASE_URL is not set. API calls will fail.');
}

/**
 * Dispatches a POST query to the Render compute nodes with dynamic auth token injection.
 * Integrates directly with existing view components.
 * Returns response wrapped in { data } to match Firebase httpsCallable signature.
 */
export const callZenkaiAPI = async (endpointName, payload = {}, timeoutMs = 30000) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Operation blocked: Missing authenticated profile context.");

  // Use cached token (valid 1hr) — only refreshes when actually expired.
  // Previously used getIdToken(true) which forced a network round-trip on every call (+400ms).
  const idToken = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api/${endpointName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || errorBody.message || `Server network exception: ${response.status}`);
    }

    const result = await response.json();
    return { data: result };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  }
};


