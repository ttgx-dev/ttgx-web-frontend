(function () {
  const consentStorageKey = "ttgx-analytics-consent";
  const consentSessionStorageKey = "ttgx-analytics-consent";
  const regionStorageKey = "ttgx-privacy-region";
  const regionLookupUrl = "https://api.country.is/";
  const defaultOnCountries = new Set(["US"]);
  const grantedConsent = {
    analytics_storage: "granted",
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  };
  const deniedConsent = {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
  let analyticsLoaded = false;
  let banner;
  let title;
  let message;
  let actions;
  let settingsLink;
  let trackingEnabledByDefault = false;
  let userChoiceMade = false;
  let geoLookupController;

  function getSavedConsent() {
    try {
      const saved = window.localStorage.getItem(consentStorageKey);
      if (saved) return saved;
    } catch (error) {
      console.warn("Could not read analytics consent", error);
    }
    try {
      return window.sessionStorage.getItem(consentSessionStorageKey);
    } catch (error) {
      console.warn("Could not read session analytics consent", error);
      return null;
    }
  }

  function saveConsent(value) {
    try {
      window.localStorage.setItem(consentStorageKey, value);
    } catch (error) {
      console.warn("Could not save analytics consent", error);
      try {
        window.sessionStorage.setItem(consentSessionStorageKey, value);
      } catch (sessionError) {
        console.warn("Could not save session analytics consent", sessionError);
      }
    }
  }

  function hasGlobalPrivacyControl() {
    return navigator.globalPrivacyControl === true;
  }

  function readCachedRegion() {
    try {
      const region = window.sessionStorage.getItem(regionStorageKey);
      return region === "default-on" || region === "opt-in" ? region : null;
    } catch (error) {
      console.warn("Could not read the privacy region for this session", error);
      return null;
    }
  }

  async function resolvePrivacyRegion() {
    const cachedRegion = readCachedRegion();
    if (cachedRegion) return cachedRegion;

    geoLookupController = new AbortController();
    const timeout = window.setTimeout(() => geoLookupController.abort(), 3000);
    try {
      const response = await fetch(regionLookupUrl, {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: geoLookupController.signal,
      });
      if (!response.ok) {
        throw new Error(`Country lookup returned ${response.status}`);
      }

      const result = await response.json();
      if (typeof result.country !== "string" || !/^[A-Z]{2}$/.test(result.country)) {
        throw new Error("Country lookup returned an invalid country code");
      }

      const region = defaultOnCountries.has(result.country) ? "default-on" : "opt-in";
      try {
        window.sessionStorage.setItem(regionStorageKey, region);
      } catch (error) {
        console.warn("Could not cache the privacy region for this session", error);
      }
      return region;
    } finally {
      window.clearTimeout(timeout);
      geoLookupController = null;
    }
  }

  function appendScript(src, onload, onerror) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    if (onload) script.addEventListener("load", onload, { once: true });
    if (onerror) script.addEventListener("error", onerror, { once: true });
    document.head.appendChild(script);
    return script;
  }

  function initializeGoogleTagManager() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("consent", "update", grantedConsent);

    appendScript(
      "https://www.googletagmanager.com/gtm.js?id=GTM-NXPDNVJ9",
      null,
      function () {
        console.warn("Could not load Google Tag Manager");
      },
    );
  }

  function initializeMetaPixel() {
    if (window.fbq) {
      window.fbq("consent", "grant");
      return;
    }

    const fbq = function () {
      if (fbq.callMethod) {
        fbq.callMethod.apply(fbq, arguments);
      } else {
        fbq.queue.push(arguments);
      }
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;
    fbq("init", "1646341093493858");
    fbq("track", "PageView");
    appendScript("https://connect.facebook.net/en_US/fbevents.js", null, function () {
      console.warn("Could not load the Meta Pixel");
    });
  }

  function initializeMetricool() {
    appendScript("https://tracker.metricool.com/resources/be.js", function () {
      if (window.beTracker && typeof window.beTracker.t === "function") {
        window.beTracker.t({ hash: "a4819dfd430901a19998168d4484ef62" });
      } else {
        console.warn("Metricool loaded without its tracking API");
      }
    }, function () {
      console.warn("Could not load Metricool");
    });
  }

  function startAnalytics() {
    if (analyticsLoaded) {
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", grantedConsent);
      }
      if (typeof window.fbq === "function") {
        window.fbq("consent", "grant");
      }
      return;
    }

    analyticsLoaded = true;
    initializeGoogleTagManager();
    initializeMetaPixel();
    initializeMetricool();
    appendScript("/js/conversion-context.js", null, function () {
      console.warn("Could not load conversion context tracking");
    });
  }

  function stopAnalytics() {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", deniedConsent);
    }
    if (typeof window.fbq === "function") {
      window.fbq("consent", "revoke");
    }
  }

  function createButton(label, className, onClick) {
    const button = document.createElement("button");
    button.className = className;
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function addParagraph(text, parent) {
    const paragraph = document.createElement("p");
    paragraph.className = "ttgx-consent__message";
    paragraph.textContent = text;
    (parent || message).appendChild(paragraph);
  }

  function addMoreDetails(includeRegionLookup) {
    const details = document.createElement("details");
    details.className = "ttgx-consent__details";

    const summary = document.createElement("summary");
    summary.textContent = "Show more";

    const content = document.createElement("div");
    addParagraph("Google Tag Manager, Meta Pixel and Metricool help us measure visits, campaigns and badge-checkout activity. These tools may use identifiers for measurement. We don't show ads on this site.", content);
    if (includeRegionLookup) {
      addParagraph("If a regional lookup is needed, we send your IP address to Country.is to determine your country.", content);
    }

    details.append(summary, content);
    message.appendChild(details);
  }

  function hideBanner() {
    banner.hidden = true;
    if (settingsLink) settingsLink.setAttribute("aria-expanded", "false");
  }

  function renderBanner(mode) {
    title.textContent = "Your privacy choices";
    message.replaceChildren();
    actions.replaceChildren();
    addParagraph("We use analytics to improve the site and understand visits.");

    if (mode === "opt-out") {
      addParagraph("Optional tracking is on by default for U.S. visitors. You can turn it off here or anytime using Your Privacy Choices.");
      addMoreDetails(true);
      actions.appendChild(
        createButton("Turn off optional tracking", "ttgx-consent__button ttgx-consent__button--secondary", function () {
          chooseConsent(false);
        }),
      );
    } else if (mode === "enabled") {
      addParagraph("Tracking is on because you allowed it. You can turn it off anytime.");
      addMoreDetails(true);
      actions.appendChild(
        createButton("Turn off optional tracking", "ttgx-consent__button ttgx-consent__button--secondary", function () {
          chooseConsent(false);
        }),
      );
    } else if (mode === "gpc") {
      addParagraph("Your browser’s Global Privacy Control signal is active, so optional tracking is off.");
      addMoreDetails(false);
      actions.appendChild(
        createButton("Keep optional tracking off", "ttgx-consent__button ttgx-consent__button--secondary", function () {
          chooseConsent(false);
        }),
      );
    } else {
      if (mode === "checking-failed") {
        addParagraph("We couldn’t determine your country, so tracking is off until you allow it.");
        addMoreDetails(true);
      } else if (mode === "opt-in") {
        addParagraph("Tracking stays off until you allow it. You can change your choice anytime using Your Privacy Choices.");
        addMoreDetails(true);
      } else {
        addParagraph("Tracking is off. You can allow it or keep it off.");
        addMoreDetails(true);
      }
      actions.append(
        createButton("Reject optional", "ttgx-consent__button ttgx-consent__button--secondary", function () {
          chooseConsent(false);
        }),
        createButton("Allow optional tracking", "ttgx-consent__button ttgx-consent__button--primary", function () {
          chooseConsent(true);
        }),
      );
    }

    banner.hidden = false;
    if (settingsLink) settingsLink.setAttribute("aria-expanded", "true");
  }

  function createBanner() {
    banner = document.createElement("section");
    banner.className = "ttgx-consent";
    banner.id = "privacy-choices";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-labelledby", "ttgx-consent-title");
    banner.hidden = true;

    const content = document.createElement("div");
    content.className = "ttgx-consent__content";

    title = document.createElement("h2");
    title.className = "ttgx-consent__title";
    title.id = "ttgx-consent-title";

    const header = document.createElement("div");
    header.className = "ttgx-consent__header";
    const closeButton = createButton("×", "ttgx-consent__close", function () {
      hideBanner();
      if (settingsLink) settingsLink.focus({ preventScroll: true });
    });
    closeButton.setAttribute("aria-label", "Close privacy choices");
    header.append(title, closeButton);

    message = document.createElement("div");
    actions = document.createElement("div");
    actions.className = "ttgx-consent__actions";

    content.append(header, message, actions);
    banner.appendChild(content);
    document.body.appendChild(banner);
  }

  function chooseConsent(allowed) {
    userChoiceMade = true;
    if (geoLookupController) geoLookupController.abort();

    if (allowed && hasGlobalPrivacyControl()) {
      window.ttgxAnalyticsConsent = false;
      saveConsent("denied");
      stopAnalytics();
      renderBanner("gpc");
      return;
    }

    window.ttgxAnalyticsConsent = allowed;
    trackingEnabledByDefault = false;
    saveConsent(allowed ? "granted" : "denied");
    if (allowed) {
      startAnalytics();
    } else {
      stopAnalytics();
    }
    hideBanner();
    if (settingsLink) settingsLink.focus();
  }

  function applyRegion(region) {
    if (userChoiceMade) return;
    if (hasGlobalPrivacyControl()) {
      window.ttgxAnalyticsConsent = false;
      saveConsent("denied");
      stopAnalytics();
      hideBanner();
      return;
    }

    const savedConsent = getSavedConsent();
    if (savedConsent === "denied") {
      window.ttgxAnalyticsConsent = false;
      hideBanner();
      return;
    }
    if (savedConsent === "granted") {
      window.ttgxAnalyticsConsent = true;
      startAnalytics();
      hideBanner();
      return;
    }

    if (region === "default-on") {
      window.ttgxAnalyticsConsent = true;
      trackingEnabledByDefault = true;
      saveConsent("default-on");
      startAnalytics();
      hideBanner();
      return;
    }

    window.ttgxAnalyticsConsent = false;
    renderBanner(region ? "opt-in" : "checking-failed");
  }

  function openSettings() {
    if (hasGlobalPrivacyControl()) {
      renderBanner("gpc");
    } else if (window.ttgxAnalyticsConsent === true) {
      renderBanner(trackingEnabledByDefault ? "opt-out" : "enabled");
    } else {
      renderBanner("off");
    }
    const firstAction = actions.querySelector("button");
    if (firstAction) firstAction.focus();
  }

  async function determineRegion() {
    if (userChoiceMade) return;
    try {
      const region = await resolvePrivacyRegion();
      applyRegion(region);
    } catch (error) {
      if (userChoiceMade) return;
      console.warn("Could not determine the visitor's privacy region", error);
      applyRegion(null);
    }
  }

  function initialize() {
    window.ttgxAnalyticsConsent = false;
    createBanner();

    settingsLink = document.getElementById("ttgx-cookie-settings");
    if (settingsLink) {
      settingsLink.addEventListener("click", function (event) {
        event.preventDefault();
        openSettings();
      });
    }

    if (hasGlobalPrivacyControl()) {
      saveConsent("denied");
      return;
    }

    const savedConsent = getSavedConsent();
    if (savedConsent === "denied") return;
    if (savedConsent === "granted") {
      window.ttgxAnalyticsConsent = true;
      startAnalytics();
      return;
    }

    const cachedRegion = readCachedRegion();
    if (savedConsent === "default-on" && cachedRegion === "default-on") {
      window.ttgxAnalyticsConsent = true;
      trackingEnabledByDefault = true;
      startAnalytics();
      hideBanner();
      return;
    }

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        void determineRegion();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
