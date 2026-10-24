# Shoo: Never Be Late.

Shoo knows where your job is and when your shift starts. It works out when you
have to walk out the door, checks traffic, and sends funny notifications that
get less polite the longer you sit there. When you leave, it backs off. When
you arrive on time, it's proud of you.

It runs as a website today and is built to become an iPhone and Android app
with Capacitor without a rewrite.

## How it works

| Folder | What's in it |
| --- | --- |
| `src/core/` | The rules: leave time, nag schedule, message copy, calendar (.ics) reader, shift list, "have you left?" tracking. Pure TypeScript, no browser or network code, so the phone apps reuse it unchanged. |
| `src/platform/` | Small adapters for things each platform does differently: notifications, location, storage. The website plugs in browser versions; the phone apps plug in native ones. |
| `src/ui/` | React screens: Today, Shifts, Setup. Phone-first, screen-sized shell with safe-area insets. |
| `src/api.ts` | Talks to the server. Keeps retrying with "starting up…" while Render's free server wakes. |
| `server/` | Small Express server. Holds the maps key, fetches calendars, needs a passcode, rate limited per visitor. Also serves the built website. |
| `tests/` | Vitest. No real API keys: maps and calendar hosts are faked. |

### The nag ladder

Working back from the shift start: *arrive early buffer* → *travel time* →
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
- `npm run icons` re-renders every icon from `public/icon.svg`.

## Deploy

`render.yaml` is a Render Blueprint: render.com → New → Blueprint → pick this
repo → fill in the secrets → deploy.
