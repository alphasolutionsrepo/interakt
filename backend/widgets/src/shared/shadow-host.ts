export interface ShadowHost {
  root: ShadowRoot;
  mount: HTMLElement;
  applyCssVars: (vars: Record<string, string | undefined>) => void;
  destroy: () => void;
}

/**
 * Attach an open Shadow DOM to the container and inject widget CSS.
 * Uses adoptedStyleSheets where supported (Chrome 73+, Firefox 101+, Safari 16.4+),
 * falling back to an inline <style> tag.
 */
export function createShadowHost(
  containerId: string,
  css: string,
): ShadowHost {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(
      `[Interakt] Container with id "${containerId}" not found. Add <div id="${containerId}"></div> before initializing.`,
    );
  }

  const host = document.createElement('div');
  host.setAttribute('data-interakt-widget', '');
  host.style.all = 'initial';
  host.style.display = 'block';
  container.appendChild(host);

  const root = host.attachShadow({ mode: 'open' });

  const supportsAdopted =
    'adoptedStyleSheets' in Document.prototype &&
    typeof CSSStyleSheet !== 'undefined' &&
    'replaceSync' in CSSStyleSheet.prototype;

  if (supportsAdopted) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
    } catch {
      injectStyleTag(root, css);
    }
  } else {
    injectStyleTag(root, css);
  }

  const mount = document.createElement('div');
  mount.className = 'interakt-root';
  root.appendChild(mount);

  const applyCssVars = (vars: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(vars)) {
      if (value == null) continue;
      mount.style.setProperty(key, value);
    }
  };

  const destroy = () => {
    if (host.parentNode) host.parentNode.removeChild(host);
  };

  return { root, mount, applyCssVars, destroy };
}

function injectStyleTag(root: ShadowRoot, css: string): void {
  const style = document.createElement('style');
  style.textContent = css;
  root.appendChild(style);
}
