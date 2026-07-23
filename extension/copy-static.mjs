import { cpSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';

mkdirSync('dist/icons', { recursive: true });
cpSync('manifest.json', 'dist/manifest.json');
cpSync('icons', 'dist/icons', { recursive: true });

// Vite emits HTML entries at a path mirroring their source location
// (dist/src/options/options.html) — MV3 needs them flat at dist root.
function flatten(nestedPath, flatName) {
  if (existsSync(nestedPath)) {
    renameSync(nestedPath, `dist/${flatName}`);
  }
}
flatten('dist/src/options/options.html', 'options.html');
flatten('dist/src/popup/popup.html', 'popup.html');
if (existsSync('dist/src')) {
  rmSync('dist/src', { recursive: true, force: true });
}
