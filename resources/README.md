# Shoo app icon: the Dashing Clock

An alarm clock on little legs, sprinting and sweating, stuck at 8:59.

| File | Use |
| --- | --- |
| `icon.svg` | Editable source of the full icon |
| `icon-foreground.svg` / `icon-background.svg` | Editable layers for Android adaptive icons |
| `icon.png` | 1024×1024, no transparency, square corners: App Store and Play Store |
| `icon-foreground.png` | Android adaptive foreground (transparent, art inside the safe zone) |
| `icon-background.png` | Android adaptive background (orange gradient) |

This folder follows the layout `@capacitor/assets` expects, so once the Capacitor
iOS and Android projects exist, `npx @capacitor/assets generate` builds every
platform size from these files.

Web/PWA icons live in `public/icons/` (`favicon.svg`, `apple-touch-icon.png`,
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`).

Colors: orange `#ff8a3d` → `#ff4d2e`, ink `#1e1b2e`, sweat `#7fd6ff`.
