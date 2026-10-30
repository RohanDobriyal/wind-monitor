import { useCallback, useEffect, useState } from "react";

/**
 * The page's state lives in the URL, so a link to "this day, this gate" opens the same view.
 * Only values that differ from the defaults are written, which keeps the bar clean.
 */
export function useUrlState(defaults) {
  const [state, setState] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(Object.keys(defaults).map((k) => [k, params.get(k) ?? defaults[k]]));
  });

  useEffect(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) {
      if (v !== defaults[k]) params.set(k, v);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [state, defaults]);

  const patch = useCallback((changes) => setState((prev) => ({ ...prev, ...changes })), []);
  return [state, patch];
}
