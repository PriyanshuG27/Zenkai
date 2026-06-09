import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV 
  ? 'http://localhost:10000' 
  : 'https://fitdesi-engine.onrender.com');

/**
 * Dispatches a POST query to the Render compute nodes with dynamic auth token injection.
 * Integrates directly with existing view components.
 * Returns response wrapped in { data } to match Firebase httpsCallable signature.
 */
export const callFitDesiAPI = async (endpointName, payload = {}, timeoutMs = 30000) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Operation blocked: Missing authenticated profile context.");

  // Retrieve JWT authorization signature dynamically
  const idToken = await currentUser.getIdToken(true);

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

/**
 * Quietly pings the health gateway of your Render host on application mount.
 * Triggers instance wake-up phases before the user initiates explicit actions.
 */
export const executeColdStartPing = () => {
  fetch(`${API_BASE_URL}/health`)
    .then(res => res.json())
    .then(() => console.log("Render node confirmed awake."))
    .catch(() => console.warn("Render engine instance cold start wake-up chain initiated."));
};
