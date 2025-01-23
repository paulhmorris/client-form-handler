import * as Sentry from "@sentry/node";

// Ensure to call this before importing any other modules!
Sentry.init({
  dsn: "https://c8f75d5a551649bfd427e878e44003ff@o4505496663359488.ingest.us.sentry.io/4508695297916928",
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});
