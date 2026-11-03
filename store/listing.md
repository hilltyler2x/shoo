# Shoo store listing

The listing text and pictures are uploaded by the **Publish to stores**
workflow (`.github/workflows/store.yml`, fastlane). Edit them here:

| What | Apple | Google Play |
| --- | --- | --- |
| Name | `fastlane/metadata/en-US/name.txt` | `fastlane/metadata/android/en-US/title.txt` |
| Subtitle / short description | `…/en-US/subtitle.txt` | `…/android/en-US/short_description.txt` |
| Description | `…/en-US/description.txt` | `…/android/en-US/full_description.txt` |
| Keywords, promo text | `…/en-US/keywords.txt`, `promotional_text.txt` | n/a |
| What's new | `…/en-US/release_notes.txt` | `…/android/en-US/changelogs/default.txt` |
| Review notes | `fastlane/metadata/review_information/notes.txt` | paste into App access if asked |
| Screenshots | `fastlane/screenshots/en-US/` (1320×2868) | `…/android/en-US/images/` (1080×1920, feature graphic 1024×500, icon 512) |

`npm run screenshots` re-renders every picture from the real app with demo plans.

Fixed facts:

- Privacy policy: https://hilltyler2x.github.io/shoo/privacy.html
- Support: https://hilltyler2x.github.io/shoo/support.html
- Bundle ID / package: `com.tylerhill.shoo`
- Category: Productivity (Apple secondary: Lifestyle). Price: Free.
- Age rating: answer None/No to every question → Apple 4+, Google Everyone.
- Privacy answers for both stores: `store/privacy-labels.md`.
