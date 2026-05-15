/**
 * Inline script that sets the initial theme class before React hydrates.
 * Reads from localStorage, falls back to prefers-color-scheme.
 */
export function ThemeScript() {
  const code = `(() => {
    try {
      const stored = localStorage.getItem('theme');
      const dark = stored ? stored === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', dark);
    } catch {}
  })();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
