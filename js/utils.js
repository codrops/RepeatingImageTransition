/**
 * Preloads images specified by the CSS selector.
 * @function
 * @param {string} [selector='img'] - CSS selector for target images.
 * @returns {Promise} - Resolves when all specified images are loaded.
 */
const preloadImages = (selector = 'img') => {
  // Background images are read from the computed style, so they're fully loaded and decoded too.
  const urls = [...document.querySelectorAll(selector)].map(
    (el) => getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1] ?? el.src
  );
  return Promise.all(
    [...new Set(urls)].filter(Boolean).map((url) => {
      const img = new Image();
      img.src = url;
      // A broken image shouldn't hold up the page.
      return img.decode().catch(() => {});
    })
  );
};

/**
 * Preloads the web fonts the page uses.
 * @function
 * @param {string[]} fonts - CSS font shorthands to load, e.g. '500 1em halyard-display'.
 * @returns {Promise} - Resolves when all specified fonts are loaded.
 */
const preloadFonts = (fonts) => {
  // A font that fails to load shouldn't hold up the page.
  return Promise.all(fonts.map((font) => document.fonts.load(font))).catch(() => {});
};

// Exporting utility functions for use in other modules.
export {
  preloadImages,
  preloadFonts
};