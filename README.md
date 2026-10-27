# Lineform

[Open the live app](https://line-coding-game.vercel.app/)

## Practice Modes

- **Draw waveform:** Start with a generated binary sequence, draw its electrical signal, and check your answer. Incorrect bit intervals are highlighted.
- **Solve line codes / Encode:** Enter a custom sequence and get the encoded waveform with a per-bit voltage table. HDB3 solutions identify balancing and violation marks.
- **Solve line codes / Decode:** Read a generated waveform and enter the original binary sequence.

Sequences support 4-24 bits. The editor includes voltage snapping, an eraser, undo and redo, solution reveals, and a code reference. Drawing works with a mouse, touch, or keyboard. Scores and streaks are stored in the browser; no account or backend is required.

Incomplete answers are not scored. Revealing a solution makes that challenge unscored, and a solved challenge cannot be scored twice.

## Supported Line Codes

| Code | Encoding convention |
| --- | --- |
| Unipolar NRZ | `1`: positive voltage for the whole bit; `0`: zero voltage. |
| Bipolar NRZ | Polar NRZ-L: `1` is positive and `0` is negative for the whole bit. |
| Unipolar RZ | `1`: positive voltage, then zero; `0`: zero throughout. |
| Bipolar RZ | Polar RZ: `1` is a positive pulse and `0` is a negative pulse; both return to zero halfway through the bit. |
| Manchester | G. E. Thomas convention: `1` falls from positive to negative; `0` rises from negative to positive. |
| Differential Manchester | Initial level is positive. `0` changes level at the bit boundary; `1` does not. Every bit changes level at its midpoint. |
| AMI | Successive `1` marks alternate polarity, starting positive; `0` stays at zero. Full-bit pulses. |
| RZ-AMI | AMI with half-bit pulses that return to zero. The first mark is positive. |
| Differential RZ | Dicode RZ: input changes `0` to `1` produce a positive pulse, and `1` to `0` produce a negative pulse. Unchanged input produces zero. The previous input bit starts at `0`. |
| HDB3 | AMI with four-zero substitution: an odd number of marks since the last violation selects `000V`; an even number selects `B00V`. |

Here, the labels "Bipolar NRZ" and "Bipolar RZ" refer to polar codes, not AMI. Manchester uses the opposite polarity mapping to IEEE 802.3; use the convention displayed in the app when checking answers.

RZ pulses have a 50% duty cycle. Each bit is represented internally by two half-bit voltage samples. `Tb` is one bit interval; voltage levels are normalized to `+1`, `0`, and `-1` volts.

For HDB3, `B` is a normal alternating-polarity balancing mark and `V` repeats the polarity of the preceding nonzero mark. Parity resets after each violation. The initial parity is even, so an initial `0000` becomes `B00V`.

## Local Setup

Use Node.js 24 and pnpm.

```bash
git clone https://github.com/krishna-ji/line-coding-game.git
cd line-coding-game
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite, usually `http://localhost:5173`. If that port is occupied, Vite selects another one.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server. |
| `pnpm test` | Run the encoding and grading tests with Node's built-in test runner. |
| `pnpm build` | Type-check the app and create the production build. |
| `pnpm preview` | Serve an existing production build locally. |

```bash
pnpm test
pnpm build
pnpm preview
```

Tests cover reference waveforms for all ten codes, every 8-bit input, HDB3 substitutions and parity, Manchester conventions, input validation, sequence generation, and missing-sample grading.

## Project Structure

- [index.html](index.html): HTML entry point and page metadata.
- [src/main.ts](src/main.ts): Practice modes, waveform canvas, input handling, feedback, and local progress.
- [src/line-codes.ts](src/line-codes.ts): Code definitions, pure encoders, challenge generation, and waveform grading.
- [src/style.css](src/style.css): Responsive layout and visual styling.
- [tests/line-codes.test.mjs](tests/line-codes.test.mjs): Encoding and grading regression tests.
- [package.json](package.json): Scripts and dependencies.

The app uses HTML, CSS, and vanilla TypeScript compiled to JavaScript by Vite. Icons come from Lucide, and fonts are bundled locally through Fontsource.

## Deployment

[Production](https://line-coding-game.vercel.app/) is hosted on Vercel and connected to [krishna-ji/line-coding-game](https://github.com/krishna-ji/line-coding-game).

- **Production branch:** `main`.
- **Framework preset:** Vite.
- **Node.js version:** 24.x.
- **Install command:** `pnpm install --frozen-lockfile`.
- **Build command:** `pnpm run build`.
- **Output directory:** `dist`.

Pushing a commit to `main` automatically builds and deploys production. Preview deployments require Vercel authentication; the production site is public. No application environment variables are required.

Uncommitted local changes are not deployed. Commit and push the changes you want to publish.