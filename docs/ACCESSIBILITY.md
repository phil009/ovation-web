# Accessibility

Target: **WCAG 2.2 AA**, enforced by tooling where possible. Users are often older, on mid-range Android phones, in dim and noisy halls.

## Built into the shared components

- `lang="en"`, landmarks (header, nav, main), a skip link, exactly one `h1` per page and a unique title on every route.
- After client-side navigation, focus moves to the page `h1` (`RouteFocus`). It waits for pages that show a skeleton first, and never takes focus from something the user has focused.
- **Forms:**
  - visible labels and a visible "(required)";
  - an error summary that receives focus and links to each field;
  - `aria-describedby` and `aria-invalid` on fields;
  - correct `autocomplete` and `inputmode`;
  - paste is never blocked;
  - the show-password toggle is a real button with `aria-pressed`.
- Every control is at least 48px tall. A 3px focus ring with a 2px offset reaches at least 3:1 on every background. Under `forced-colors`, focus and borders switch to system colours.
- One polite live region (`useAnnounce()`), debounced.
- Toasts with an action stay at least 10 seconds and pause on hover and focus.
- Wide tables (totals, audit log) scroll inside a focusable, labelled region; the page itself never scrolls sideways.
- Pledged and Received always show an icon plus the word. Money shows tabular digits and reads aloud as "50,000 naira".
- `prefers-reduced-motion` is honoured. Zoom is never restricted. Sizes are in rem, so user font scaling works.
- Light and dark themes, plus a manual toggle.

## Automated checks

| Check                                                                                                                                                                          | Where                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `jsx-a11y` strict rules, as errors                                                                                                                                             | `pnpm lint`                                  |
| Contrast of every token pairing in both themes (4.5:1 text, 3:1 UI and focus)                                                                                                  | `src/styles/contrast.test.ts`                |
| Labels, descriptions, error summary focus, password toggle                                                                                                                     | `src/components/ui/forms.test.tsx`           |
| axe (WCAG 2.0 to 2.2 A and AA) on `/login`, `/register`, `/join`, `/offline`, light and dark                                                                                   | `e2e/public.spec.ts`                         |
| axe on `/orgs`, `/orgs/new`, `/orgs/[id]`, `/settings` and the join preview, light and dark                                                                                    | `e2e/flows.spec.ts` (needs `E2E_API_URL`)    |
| axe and no sideways page scroll on events, new event, the event page (open and closed), edit awardee, members, invite codes and audit log, light and dark, as admin and viewer | `e2e/m2.spec.ts` (needs `E2E_API_URL`)       |
| Register, sign out, sign in and join with a code, keyboard only                                                                                                                | `e2e/keyboard.spec.ts` (needs `E2E_API_URL`) |

## Manual checklist (for Philip)

Tools can't run these. Tick each one once it's done on a real device.

- [ ] **TalkBack on Android Chrome:** register, sign in, create an organisation, join with a code. Error summaries are read on submit; the org switcher announces the current organisation; the "Waking the server" message is read once.
- [ ] **VoiceOver on iOS Safari:** the same flows. The install hint can be dismissed and has a name.
- [ ] **200 percent zoom** (and 320 CSS px width) on every page: nothing is cut off and there is no horizontal scroll.
- [ ] **Keyboard only** on desktop: every page, the account menu, the organisation switcher, every confirmation dialog (focus is trapped inside and returns to its trigger), and scrolling the totals table with the arrow keys.
- [ ] **Screen reader on the event page:** the totals table reads awardee names as row headers and amounts as "… naira"; adding an awardee announces "… added." and returns to the name field; the parsed amount ("= ₦3,000,000") is read while typing.
- [ ] **Windows High Contrast** (forced colours): focus rings, borders and badges stay visible. Check the header logo on a dark high-contrast theme.
- [ ] **Text spacing override** (WCAG 1.4.12 bookmarklet): no clipped text.
- [ ] **Android system font size at its largest:** forms stay usable.
- [ ] **A dim room on a mid-range phone:** brightness and contrast feel right in both themes.
