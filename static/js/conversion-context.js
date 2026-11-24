(function () {
  const endpoint = "https://ttgx-conversion-correlator-3b22vat2gq-uc.a.run.app/api/conversion-context";
  const clientIdPattern = /^GA\d(?:\.\d+){3}$/;
  const measurementIdPattern = /^G-[A-Z0-9]+$/;
  const landingUrlStorageKey = "ttgx-conversion-context-landing-url";
  const captureStorageKey = "ttgx-conversion-context-captured";
  const navigationWaitMs = 300;

  function hasAnalyticsConsent() {
    return window.ttgxAnalyticsConsent === true;
  }

  function getGa4MeasurementId() {
    for (const command of window.dataLayer || []) {
      if (command && command[0] === "config"
        && typeof command[1] === "string"
        && measurementIdPattern.test(command[1])) {
        return command[1];
      }
    }

    return Object.keys(window.google_tag_manager || {})
      .find((tagId) => measurementIdPattern.test(tagId));
  }

  function getGa4Value(measurementId, field) {
    return new Promise((resolve) => {
      let completed = false;
      const timeout = window.setTimeout(() => {
        completed = true;
        resolve(undefined);
      }, navigationWaitMs);

      window.gtag("get", measurementId, field, (value) => {
        if (completed) return;
        completed = true;
        window.clearTimeout(timeout);
        resolve(typeof value === "string" || typeof value === "number"
          ? String(value)
          : undefined);
      });
    });
  }

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    for (const part of document.cookie.split(";")) {
      const cookie = part.trim();
      if (cookie.startsWith(prefix)) {
        try {
          return decodeURIComponent(cookie.slice(prefix.length)) || undefined;
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  }

  function getJourneyLandingUrl() {
    try {
      const savedUrl = window.sessionStorage.getItem(landingUrlStorageKey);
      if (savedUrl) return savedUrl;

      const landingUrl = window.location.href;
      window.sessionStorage.setItem(landingUrlStorageKey, landingUrl);
      return landingUrl;
    } catch (error) {
      console.warn("Could not preserve the checkout landing URL", error);
      return window.location.href;
    }
  }

  async function saveCheckoutContext(landingUrl) {
    if (!hasAnalyticsConsent()) return false;

    const measurementId = getGa4MeasurementId();
    if (!measurementId) {
      console.warn("Skipping checkout context: no GA4 Measurement ID found in the loaded GTM configuration");
      return false;
    }
    if (typeof window.gtag !== "function") {
      console.warn("Skipping checkout context: the gtag API is unavailable");
      return false;
    }

    const [gaClientId, gaSessionId] = await Promise.all([
      getGa4Value(measurementId, "client_id"),
      getGa4Value(measurementId, "session_id"),
    ]);
    if (!hasAnalyticsConsent()) return false;
    if (!gaClientId) {
      console.warn("Skipping checkout context: GA4 did not return a client ID within 300 ms");
      return false;
    }
    if (!clientIdPattern.test(gaClientId)) {
      console.warn("Skipping checkout context: GA4 returned a client ID in an unsupported format");
      return false;
    }

    const pageUrl = window.location.href;
    const response = await fetch(endpoint, {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ga_client_id: gaClientId,
        ga_session_id: gaSessionId,
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
        landing_url: landingUrl,
        event_source_url: pageUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(`Conversion context endpoint returned ${response.status}`);
    }
    return true;
  }

  function startCheckoutJourney() {
    let shouldCapture = true;
    try {
      if (window.sessionStorage.getItem(captureStorageKey)) return;
      window.sessionStorage.setItem(captureStorageKey, "pending");
    } catch (error) {
      console.warn("Could not track checkout context capture in session storage", error);
    }

    void saveCheckoutContext(getJourneyLandingUrl())
      .then((saved) => {
        if (!saved) shouldCapture = false;
      })
      .catch((error) => {
        console.warn("Could not save initial checkout conversion context", error);
        shouldCapture = false;
      })
      .finally(() => {
        if (!shouldCapture) {
          try {
            window.sessionStorage.removeItem(captureStorageKey);
          } catch (error) {
            console.warn("Could not reset checkout context capture state", error);
          }
        }
      });
  }

  const journeyLandingUrl = getJourneyLandingUrl();
  if (document.readyState === "complete") {
    startCheckoutJourney();
  } else {
    window.addEventListener("load", startCheckoutJourney, { once: true });
  }

  function isTabletopLink(anchor) {
    try {
      const url = new URL(anchor.href);
      return url.hostname === "tabletop.events"
        && url.pathname.startsWith("/conventions/twin-cities-tabletop-games-expo/");
    } catch {
      return false;
    }
  }

  document.addEventListener("click", (event) => {
    if (!hasAnalyticsConsent() || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || !isTabletopLink(anchor)
      || (anchor.target && anchor.target !== "_self")
      || anchor.hasAttribute("download")) {
      return;
    }

    event.preventDefault();
    const savePromise = saveCheckoutContext(journeyLandingUrl).catch((error) => {
      console.warn("Could not save checkout conversion context", error);
    });
    const navigationTimeout = new Promise((resolve) => {
      window.setTimeout(resolve, navigationWaitMs);
    });

    void Promise.race([savePromise, navigationTimeout])
      .finally(() => window.location.assign(anchor.href));
  });
})();
