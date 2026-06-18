// COROS is an OPTIONAL, pluggable module. The COROS Open API requires
// developer/partner access that may not be granted — so the app works fully on
// Strava alone, and health metrics can be entered manually. When/if COROS access
// is obtained, implement fetchCorosDaily() below and the rest of the app
// (correlations, alerts) consumes the same health_metrics table transparently.

export function corosConfigured() {
  return Boolean(process.env.COROS_CLIENT_ID && process.env.COROS_CLIENT_SECRET);
}

export function corosStatus() {
  return {
    configured: corosConfigured(),
    note: corosConfigured()
      ? "Identifiants COROS présents, mais l'intégration de l'API n'est pas encore implémentée."
      : "Module COROS branché mais non connecté (l'accès à l'API COROS nécessite une demande développeur/partenaire). En attendant, saisis HRV/sommeil/récup à la main.",
  };
}

/**
 * Plug point for the COROS Open API (HRV, sleep, recovery, training load, VO2max).
 * Intentionally not implemented: partner access isn't guaranteed and can't be
 * tested here. When granted, fetch daily metrics here and upsert them with
 * source:'coros' into health_metrics — no other code needs to change.
 */
export async function fetchCorosDaily() {
  const err = new Error(
    corosConfigured()
      ? "Intégration COROS à implémenter (services/coros.js)."
      : "COROS non configuré : accès API partenaire requis. Utilise la saisie manuelle."
  );
  err.statusCode = 501;
  throw err;
}
