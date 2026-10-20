# Opening splash screen (landing)

The first screen of BambooLeaf: the logo and the name, centred, for 3.5 seconds, then the app opens by itself.
There is no other text and no language switch.

- `LandingGate` wraps the app. It shows `LandingPage` once per browser tab session, then mounts the app.
- `LandingPage` waits `SPLASH_MS` (3.5 s, in `landing-state.ts`), fades out for the last `FADE_OUT_MS` (0.4 s), then calls `onEnter`. A click or tap skips the wait. Its timers are cleared if the page goes away first.
- A reload in the same tab (for example after logout) goes straight to the app.
- Skip it with `VITE_SHOW_LANDING=false` (useful for demo recordings and local work).
- The logo is drawn from `logo-geometry.ts`. The SVG files in `frontend/public` use the same shapes. Change the numbers there, not in the components.
- Colours and fonts follow the app (lime accent, slate surfaces, Outfit). Dark mode follows the app's saved theme (`bambooleaf_theme`) and its `html.dark` class.
- The page respects reduced motion: no animation and no fade, it just stays for the same time.
- Tests: `../backend/node_modules/.bin/tsx --test tests/landing/landing.test.ts` (run from `frontend`; the frontend has no `tsx` of its own). The test lives outside `src/` so the app build does not type-check Node test modules.
