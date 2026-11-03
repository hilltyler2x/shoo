# Privacy answers for the stores

Shoo has no accounts, analytics, ads or tracking. Plans, places and settings
stay on the phone. Data that leaves the phone: coordinates and searched
addresses (for travel times and map search, via Shoo's server and Google Maps,
or OpenStreetMap), calendar links the user pastes (fetched by the server), and,
once Shoo Pro is on, purchases (Apple/Google and RevenueCat). Nothing is tied
to a name, email or account. These answers match `ios/App/App/PrivacyInfo.xcprivacy`
and https://hilltyler2x.github.io/shoo/privacy.html.

## Apple: App Store Connect → App Privacy

**Do you or your third-party partners collect data from this app?** Yes.

| Data type | Collected | Linked to the user? | Used for tracking? | Purpose |
| --- | --- | --- | --- | --- |
| Location → **Precise Location** | Yes | **No** | **No** | App Functionality |
| Purchases → **Purchase History** | Yes (only once Shoo Pro is switched on) | **No** | **No** | App Functionality |

Everything else: **not collected**. Specifically, answer "No" for Contact
Info, Health & Fitness, Financial Info, Sensitive Info, Contacts, User Content,
Browsing History, Search History, Identifiers, Usage Data, Diagnostics, and
Other Data. Calendar and Reminders items are read on the device and are not
collected.

Until Pro is turned on, you can leave Purchase History out and add it in the
same update that adds the RevenueCat keys.

## Google Play: App content → Data safety

- **Does your app collect or share any of the required user data types?** Yes
- **Is all of the user data collected by your app encrypted in transit?** Yes
- **Do you provide a way for users to request that their data be deleted?** No
  (there is no account and nothing is stored on a server; uninstalling removes everything)

Data types (all others: not collected):

| Category → type | Collected | Shared | Processed ephemerally? | Required or optional | Purpose |
| --- | --- | --- | --- | --- | --- |
| Location → **Approximate location** | Yes | No | Yes | Optional | App functionality |
| Location → **Precise location** | Yes | No | Yes | Optional | App functionality |
| Financial info → **Purchase history** (only once Pro is on) | Yes | No | No | Optional | App functionality |

"Shared" is No because Google Maps, OpenStreetMap and RevenueCat act as
service providers for Shoo, which Google's form does not count as sharing.
Calendar events are read on the device only, so Calendar is not collected.

## Google Play: other App content forms

- **Privacy policy**: https://hilltyler2x.github.io/shoo/privacy.html
- **Ads**: No, the app does not contain ads.
- **App access**: All functionality is available without special access.
- **Content rating**: questionnaire, category "Utility, Productivity, Communication, or Other", answer No to everything → Everyone.
- **Target audience**: 18 and over (simplest; avoids the Families policy). 13–17 is fine too if wanted.
- **News app**: No. **Government app**: No. **Financial features**: none. **Health**: none.
- **Exact alarm permission (SCHEDULE_EXACT_ALARM)**: if asked, choose "Calendar or alarm clock app" style use: the app's core function is time-critical reminders to leave.

### Location permissions declaration (background location)

Play asks for this because Shoo uses `ACCESS_BACKGROUND_LOCATION`.

- **Feature**: "Notice when I leave" (Setup screen)
- **Purpose text** (paste):

```
Shoo reminds people when it's time to leave for work, class or appointments, and keeps sending reminders until they go. With background location, Shoo uses geofences to notice when the user has left (so it stops reminding them) and when they arrive (to confirm they made it on time), even when the app is closed. Location is only used on the device for these geofences and is never shared or sold. Without it, users tap "I've left" by hand.
```

- **Video**: a 30-second screen recording on an Android phone: open Shoo →
  Setup → "Notice when I leave" card (it shows the disclosure text) → tap
  "Allow location" → pick "Allow all the time" → go back to Today. Upload it to
  YouTube as **Unlisted** and paste the link.
