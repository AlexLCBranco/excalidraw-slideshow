/** A token from tokens.css, for values used in JS. */
export const cssToken = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A length token, in px, for layout maths done in JS. */
export const tokenPx = (name: string) => parseFloat(cssToken(name)) || 0;
