# Angular version compatibility

The same source code builds on **Angular 17.2 through 22**. Each version below was installed from scratch and checked with a full `ng build` and the template type-checker (`ngc`): 17.3, 18.2, 19.2, 20, 21 and 22.2. The app has not been run in a browser on these versions.

## Switching versions

```bash
node scripts/use-angular.mjs 17        # any of 17, 18, 19, 20, 21, 22
rm -rf node_modules package-lock.json
npm install
npm start
```

The script only edits `package.json` (Angular, CDK, CLI, TypeScript versions and the build package) and the builder names in `angular.json`. Source files are not touched.

| Angular | TypeScript | Build package |
|---|---|---|
| 17 | ~5.4 | `@angular-devkit/build-angular` |
| 18, 19 | ~5.5 / ~5.8 | `@angular-devkit/build-angular` |
| 20, 21 | ~5.9 | `@angular/build` |
| 22 | ~6.0 | `@angular/build` |

(`@angular/build` does not exist for Angular 17, so 17-19 use the older package name for the same esbuild builder.)

## Minimum version: Angular 17.2

The app uses signal inputs (`input()`, Angular 17.1) and signal queries (`viewChild()`, Angular 17.2). 17.0 and 17.1 are not supported; run `npm install @angular/core@^17.3` or newer within the 17 line.

## What was changed for compatibility

- `standalone: true` added to every component (Angular 17 and 18 need it; 19+ ignore it).
- Removed `provideBrowserGlobalErrorListeners()` from `app.config.ts` (Angular 20+ only).
- Replaced `@let` in `property-field` (needs 18.1+) with `@if (x(); as y)`.
- Replaced `@else if (x; as y)` (needs 18.0+) in `properties-panel` and `view-panel` with a nested `@else { @if (x; as y) {...} }`.
- Replaced `@lucide/angular` (its templates use `@let`, so it needs Angular 18.1+) with the framework-free `lucide` package. `IconComponent` now builds the SVG itself; the icon names used in templates are unchanged.
- `tsconfig.json`: `module: ES2022`, `moduleResolution: bundler`, `useDefineForClassFields: false` instead of `module: preserve` (needs TypeScript 5.4).
- `angular.json`: added `outputPath`, `index` and asset `output`, which Angular 17 requires and later versions accept.

## Rules to keep it compatible

Avoid these when editing templates or code, or the build breaks on older versions:

| Feature | Needs |
|---|---|
| `@let` in templates | 18.1 |
| `@else if (x; as y)` | 18.0 |
| `linkedSignal`, `resource()` | 19 |
| `provideZonelessChangeDetection()` | 20 |
| `@angular/build` builder | 18 |

A backup of the files before these changes is in `_backup-before-compat-2026-11-17.tgz`.
