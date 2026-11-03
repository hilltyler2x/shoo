# Shoo: Never Be Late.

Shoo knows where you need to be and when: work shifts, class, the gym, the
dentist, a flight, dinner. It works out when you have to walk out the door,
checks traffic, and sends funny notifications that get less polite the longer
you sit there, with jokes that fit the occasion. When you leave, it backs off.
When you arrive on time, it's proud of you.

Plans come from:

- saved places plus weekly or one-time plans you add by hand
- linked calendars by iCal link (Google, Outlook, iCloud) and work schedule apps
  that share one (Homebase, When I Work, 7shifts, Deputy)
- the phone's own calendar, and the iPhone Reminders app (timed reminders)
- Quick add: paste a schedule or confirmation email, or pick a screenshot.
  Screenshots are read on the device with Tesseract; nothing is uploaded.

Events with an address are looked up on the map; events at a saved place
("Planet Fitness", "Work") are matched by name.

It runs as a website today and is built to become an iPhone and Android app
with Capacitor without a rewrite.

## How it works

| Folder | What's in it |
| --- | --- |
| `src/core/` | The rules: leave time, nag schedule, message copy per occasion, calendar (.ics) reader, places and plan list, schedule/email text reader, "have you left?" tracking. Pure TypeScript, no browser or network code, so the phone apps reuse it unchanged. |
| `src/platform/` | Small adapters for things each platform does differently: notifications, location, storage. The website plugs in browser versions; the phone apps plug in native ones. |
| `src/ui/` | React screens: Today, Plans, Setup. Phone-first, screen-sized shell with safe-area insets. |
| `src/api.ts` | Talks to the server. Keeps retrying with "starting up…" while Render's free server wakes. |
| `server/` | Small Express server. Holds the maps key, fetches calendars, needs a passcode, rate limited per visitor. Also serves the built website. |
| `tests/` | Vitest. No real API keys: maps and calendar hosts are faked. |

### The nag ladder

Working back from the start time: *arrive early buffer* → *travel time* →
*leave time* → *get-ready time*.

- **Gentle** (before leave time): "Hey, you might wanna start putting your shoes on 👟"
- **Getting serious** (past leave time, still on time if you go now): "Shoo. Shoo. SHOO. 🚪"
- **Panic mode** (leaving now means walking in late): "…This is me not asking nicely anymore. LEAVE."
- **Made it**: "Look at you, on time like a responsible adult 🏆"

All copy lives in `src/core/messages.ts`.

### Phone background limits (read this before adding features)

iOS doesn't let apps run whenever they like, so Shoo is designed around it:

- Every nag is **scheduled ahead of time** as a local notification. They fire
  even when the app is closed. iOS allows 64 pending, so Shoo keeps at most 60.
- "Have you left?" uses a **geofence** around where you are. iOS wakes the app
  when you cross it (even if closed, as long as it wasn't swiped away), and the
  app cancels the remaining nags. This needs "Always" location permission.
- Traffic is re-checked whenever the app is open. A traffic jam that appears
  after you close the app won't move the nags until you open it again.
- Android is more flexible (a foreground service can keep checking).
- The **website** can only nag while the tab is open. "I've left" and "I'm
  here" buttons are the fallback.

## Run it locally

```bash
npm install
npm run dev      # website on http://localhost:5173, API on :8787
npm test
```

Optional server settings (in your shell or Render's dashboard):

| Name | What |
| --- | --- |
| `APP_PASSCODE` | Passcode the app asks for. Unset = open (local dev only). |
| `GOOGLE_MAPS_API_KEY` | Live traffic and better address search (Routes API + Geocoding API). Without it: OSRM routing and OpenStreetMap search, no traffic. |
| `CONTACT_EMAIL` | Sent to OpenStreetMap's search, as its usage policy asks. |
| `RATE_LIMIT_PER_HOUR` | Requests per visitor per hour. Default 300. |

## Phone apps (Capacitor)

The same code wrapped as an iPhone and Android app. App ID / bundle ID:
**`com.tylerhill.shoo`** (it must match Apple's Identifier and the App Store
Connect record exactly).

- `npm run build:app` builds the website against the live server
  (`VITE_API_URL` in `.env.app`) and copies it into `ios/` and `android/`.
- The app's own native plugin does the background work:
  `ios/App/App/ShooNative.swift` and
  `android/app/src/main/java/com/tylerhill/shoo/` (scheduled nags, the
  "you left" / "you made it" geofences, the "I've left" button on each nag).
  The JavaScript side is `src/platform/native/`.
- `.github/workflows/build.yml` builds a test APK on every merge to `main`
  (at `releases/download/test-build/Shoo-test.apk`) and uploads the iPhone app
  to TestFlight from a `macos-26` runner once the four Apple secrets exist:
  `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`.
- `npm run icons` renders the iPhone and Android icons from the Dashing Clock in `resources/` (web icons are in `public/icons/`).

## Deploy

`render.yaml` is a Render Blueprint: render.com → New → Blueprint → pick this
repo → fill in the secrets → deploy.

## Shoo Pro

Free: one saved place, typed-in plans, live traffic, Gentle and Getting
serious nags. Pro ($4.99/mo with $1.99 for the first 3 months, $29.99/yr with
a 7-day free trial, or $49.99 lifetime) unlocks everything else. The rules are
in `src/core/pro.ts`; purchases go through RevenueCat
(`src/platform/native/purchases.ts`, entitlement `pro`).

Pro switches on only when `VITE_REVENUECAT_IOS_KEY` / `VITE_REVENUECAT_ANDROID_KEY`
are set in `.env.app` (RevenueCat's public SDK keys). Until then, and always on
the website, everything is unlocked.

## Publishing to the App Store and Google Play

- **Builds** (`build.yml`, on every merge to `main`): the iPhone app goes to
  TestFlight; the signed Android bundle goes to the `store-build` release and
  Play's internal testing track. Secrets: `APPLE_TEAM_ID`, `ASC_KEY_ID`,
  `ASC_ISSUER_ID`, `ASC_KEY_P8` (Apple); `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `PLAY_SERVICE_ACCOUNT_JSON` (Google).
- **Listings and release** (`store.yml`, run by hand: Actions → Publish to
  stores): uploads the text and screenshots in `fastlane/`, and can submit the
  newest build to App Review or move it to Play's closed testing / production.
- Privacy policy and support pages: `public/privacy.html`, `public/support.html`
  (served by GitHub Pages). Store privacy answers: `store/privacy-labels.md`.
- Store apps never show the server passcode lock: if the server asks for one,
  they skip it and call the map services directly. Leave `APP_PASSCODE` unset on
  Render once the apps are public.
