# Repository Guidelines

## Project Structure and Module Organization
- `src/` contains the shared rendering engine: core markdown pipeline, renderers, plugins, exporters, services, messaging, UI, themes, types, utils, and locale bundles.
- `chrome/`, `firefox/`, `vscode/`, `mobile/` hold platform-specific builds with their own `build.js` and `src/` entry points.
- `scripts/` provides maintenance utilities (i18n key checks, locale updates, font downloads, buffer shims).
- `test/` holds core test suites (`*.test.js`/`*.test.ts`).
- `docs/`, `icons/`, `demo/` store documentation and assets.

## Build, Test, and Development Commands
- Preferred package manager: `pnpm` (lockfile is `pnpm-lock.yaml`). Use `npm` only if pnpm is unavailable.
- Install dependencies: `pnpm install`.
- Build targets:
  - `pnpm run chrome` -> builds Chrome extension into `dist/chrome/`.
  - `pnpm run firefox` -> builds Firefox extension into `dist/firefox/`.
  - `pnpm run vscode` -> builds VS Code extension into `dist/vscode/`.
  - `pnpm run mobile` -> builds mobile WebView assets into `mobile/build/`.
- Mobile packaging:
  - `pnpm run app:init` -> runs `flutter pub get` in `mobile/`.
  - `pnpm run app` / `pnpm run ios` / `pnpm run android` -> platform packages.
- Type checking: `pnpm run typecheck` (tsc, no emit).

## Coding Style and Naming Conventions
- TypeScript and ESM throughout the shared engine and platform code.
- Follow existing formatting: 2-space indentation, single quotes, semicolons.
- File names are typically kebab-case (e.g., `markdown-processor.ts`, `docx-math-converter.ts`).
- Keep platform boundaries clear: shared logic in `src/`, platform adapters in `chrome/`, `firefox/`, `vscode/`, `mobile/`.

## Testing Guidelines
- Tests live in `test/` and use the `node:test` API.
- Run all tests: `npx fibjs test/all.test.js`.
- Run a single suite: `npx fibjs test/markdown-processor.test.js`.
- Always run `pnpm run typecheck` when touching TypeScript-heavy areas.

## Commit and Pull Request Guidelines
- Commit history favors conventional prefixes such as `feat:`, `fix:`, `refactor:` with short imperative subjects. Use the same style when possible.
- PRs should describe the user-visible impact, list affected platforms (chrome/firefox/vscode/mobile), and link related issues.
- Include screenshots or short clips for UI changes (webview, popup, settings panels).

## Localization and Assets
- Translation files live in `src/_locales/` and `vscode/_locales/`.
- When adding strings, update registries and run the i18n helpers in `scripts/` (e.g., `node scripts/check-missing-keys.js`).
