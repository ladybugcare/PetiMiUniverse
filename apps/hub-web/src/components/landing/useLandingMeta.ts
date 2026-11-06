import { useEffect } from 'react';

type LandingMeta = {
  title: string;
  description: string;
};

function metaElement(attr: 'name' | 'property', key: string): HTMLMetaElement {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.dataset.landingMeta = 'created';
    document.head.appendChild(el);
  }
  return el;
}

/** Título e descrição da página pública, restaurados ao sair. */
export function useLandingMeta({ title, description }: LandingMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionEl = metaElement('name', 'description');
    const ogTitle = metaElement('property', 'og:title');
    const ogDescription = metaElement('property', 'og:description');
    const previousDescription = descriptionEl.getAttribute('content');
    const previousOgTitle = ogTitle.getAttribute('content');
    const previousOgDescription = ogDescription.getAttribute('content');

    document.title = title;
    descriptionEl.setAttribute('content', description);
    ogTitle.setAttribute('content', title);
    ogDescription.setAttribute('content', description);

    return () => {
      document.title = previousTitle;
      restore(descriptionEl, previousDescription);
      restore(ogTitle, previousOgTitle);
      restore(ogDescription, previousOgDescription);
    };
  }, [title, description]);
}

function restore(el: HTMLMetaElement, previous: string | null) {
  if (el.dataset.landingMeta === 'created' && previous == null) {
    el.remove();
    return;
  }
  if (previous == null) el.removeAttribute('content');
  else el.setAttribute('content', previous);
}
