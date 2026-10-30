import { useEffect, useState } from "react";

// One request per URL for the life of the page. Switching back to a day you've seen is instant.
const inFlight = new Map();

function load(url) {
  if (!inFlight.has(url)) {
    const request = fetch(url).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      return res.json();
    });
    request.catch(() => inFlight.delete(url));
    inFlight.set(url, request);
  }
  return inFlight.get(url);
}

/**
 * Stale-while-revalidate: while a new URL loads, the previous answer stays on screen
 * with `stale` set, so views can dim it instead of blanking or silently lying.
 */
export function useQuery(url) {
  const [state, setState] = useState({ url: null, data: null, error: null });

  useEffect(() => {
    let live = true;
    load(url).then(
      (data) => live && setState({ url, data, error: null }),
      (err) => live && setState({ url, data: null, error: err.message }),
    );
    return () => {
      live = false;
    };
  }, [url]);

  const pending = state.url !== url;
  return {
    data: state.data,
    error: pending ? null : state.error,
    pending,
    stale: pending && state.data !== null,
  };
}
