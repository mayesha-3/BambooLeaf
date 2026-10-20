# Opening page (landing)

The first screen of BambooLeaf. It shows once per browser tab session, then the app opens.

- `LandingGate` wraps the app. It shows `LandingPage` until the visitor clicks "Open BambooLeaf", then mounts the app.
- A reload in the same tab (for example after logout) goes straight to the app.
- Skip it with `VITE_SHOW_LANDING=false` (useful for demo recordings and local work).
- All text is in `i18n/` (one file per language, same keys). To add a language, add a file that satisfies `LandingCopy` and register it in `i18n/index.ts`.
- The logo is drawn from `logo-geometry.ts`. The SVG files in `frontend/public` use the same shapes. Change the numbers there, not in the components.
- The page respects the app light and dark mode, keyboard focus, and reduced motion.
- Tests: `../backend/node_modules/.bin/tsx --test tests/landing/landing.test.ts` (run from `frontend`; the frontend has no `tsx` of its own). The test lives outside `src/` so the app build does not type-check Node test modules.
- Colours and fonts follow the app (lime accent, slate surfaces, Outfit and Plus Jakarta Sans). Dark mode follows the app's saved theme (`bambooleaf_theme`) and its `html.dark` class.
