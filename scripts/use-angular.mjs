#!/usr/bin/env node
// Switch this project to a specific Angular major version (17 - 22).
//   node scripts/use-angular.mjs 17
//   rm -rf node_modules package-lock.json && npm install
// The source code itself is identical for every version; only package.json and the builder names in angular.json change.
import { readFileSync, writeFileSync } from 'node:fs';

const major = Number(process.argv[2]);
if (!Number.isInteger(major) || major < 17 || major > 22) {
  console.error('Usage: node scripts/use-angular.mjs <17|18|19|20|21|22>');
  process.exit(1);
}

const TYPESCRIPT = { 17: '~5.4.0', 18: '~5.5.0', 19: '~5.8.0', 20: '~5.9.0', 21: '~5.9.0', 22: '~6.0.2' };
const useDevkit = major <= 19; // @angular/build only exists from 18 and is the default builder from 20
const range = `^${major}.0.0`;

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const name of Object.keys(pkg.dependencies)) if (name.startsWith('@angular/')) pkg.dependencies[name] = range;
for (const name of Object.keys(pkg.devDependencies)) {
  if (name.startsWith('@angular/') || name === '@angular-devkit/build-angular') delete pkg.devDependencies[name];
}
pkg.devDependencies[useDevkit ? '@angular-devkit/build-angular' : '@angular/build'] = range;
pkg.devDependencies['@angular/cli'] = range;
pkg.devDependencies['@angular/compiler-cli'] = range;
pkg.devDependencies['typescript'] = TYPESCRIPT[major];
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

let ng = readFileSync('angular.json', 'utf8');
ng = ng.replace(/"(?:@angular\/build|@angular-devkit\/build-angular):(application|dev-server)"/g, (_m, kind) =>
  `"${useDevkit ? '@angular-devkit/build-angular' : '@angular/build'}:${kind}"`,
);
writeFileSync('angular.json', ng);

console.log(`Configured for Angular ${major} (TypeScript ${TYPESCRIPT[major]}, builder ${useDevkit ? '@angular-devkit/build-angular' : '@angular/build'}).`);
console.log('Now run:  rm -rf node_modules package-lock.json && npm install');
