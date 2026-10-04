import { preloadImages, preloadFonts } from './utils.js';
import { Sheets } from './webgl/Sheets.js';

// Configuration object for animation settings
const config = {
  clipPathDirection: 'top-bottom', // Direction of clip-path animation ('top-bottom', 'bottom-top', 'left-right', 'right-left')
  autoAdjustHorizontalClipPath: true, // Automatically flip horizontal clip-path direction based on panel side
  steps: 6, // Number of mover elements generated between grid item and panel
  stepDuration: 0.35, // Duration (in seconds) for each animation step
  stepInterval: 0.05, // Delay between each mover's animation start
  moverPauseBeforeExit: 0.14, // Pause before mover elements exit after entering
  rotationRange: 0, // Maximum random rotation applied to each mover's Z-axis (tilt left/right)
  wobbleStrength: 0, // Maximum random positional wobble (in pixels) applied horizontally/vertically to each mover path
  panelRevealEase: 'sine.inOut', // Easing function for panel reveal animation
  gridItemEase: 'sine', // Easing function for grid item exit animation
  moverEnterEase: 'sine.in', // Easing function for mover entering animation
  moverExitEase: 'sine', // Easing function for mover exit animation
  panelRevealDurationFactor: 2, // Multiplier to adjust panel reveal animation duration
  clickedItemDurationFactor: 2, // Multiplier to adjust clicked grid item animation duration
  gridItemStaggerFactor: 0.3, // Max delay factor when staggering grid item animations
  moverBlendMode: false, // Optional CSS blend mode for mover elements (false = no blend mode)
  pathMotion: 'linear', // Type of path movement ('linear' or 'sine')
  sineAmplitude: 50, // Amplitude of sine wave for pathMotion 'sine'
  sineFrequency: Math.PI, // Frequency of sine wave for pathMotion 'sine'
  moverSurface: 'flat', // How movers are drawn ('flat' clip-path copies, or WebGL sheets: 'silk' ripples and unrolls with a soft edge, 'ink' blooms and dissolves like ink in water)
  surfaceStrength: 0.2, // How deep 'silk' folds (as a fraction of each mover's width) or how much 'ink' swirls
  edgeNoise: 0.9, // Irregularity of the edges on 'silk' and 'ink' movers (0 = straight or round)
  moverRevealAmount: 1, // How much of each 'silk' or 'ink' mover shows before it leaves (below 1, 'ink' copies stay irregular blots)
};

// Create a deep copy of the initial global config.
// Used to temporarily modify config per item and then reset back after animations.
const originalConfig = { ...config };

// Linear interpolation helper
const lerp = (a, b, t) => a + (b - a) * t;

// Checks whether the user prefers reduced motion
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Cached DOM elements
const grid = document.querySelector('.grid'); // Main grid container
const frame = document.querySelectorAll(['.frame', '.heading']); // Frame overlays
const panel = document.querySelector('.panel'); // Panel container
const panelContent = panel.querySelector('.panel__content'); // Panel content

let isAnimating = false; // Prevents overlapping animations
let isPanelOpen = false; // Tracks if the panel is currently open
let currentItem = null; // Reference to the clicked item
let sheets; // WebGL renderer for 'silk' and 'ink' movers, created on first use (null without WebGL)

// Get the WebGL renderer, creating it the first time
const getSheets = () => {
  if (sheets === undefined) {
    try {
      sheets = new Sheets();
    } catch (e) {
      sheets = null;
    }
  }
  return sheets;
};

// Whether this transition draws WebGL movers (they fall back to flat ones without WebGL)
const usesSheets = () => config.moverSurface !== 'flat' && !!getSheets()?.has(config.moverSurface);

// Initialize event listeners
const init = () => {
  // Attach click handlers to all grid items
  document.querySelectorAll('.grid__item').forEach((item) => {
    item.addEventListener('click', () => onGridItemClick(item));
    // Open with Enter or Space when focused via keyboard
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onGridItemClick(item);
      }
    });
  });

  // Attach click handler to the panel close link
  panelContent.querySelector('.panel__close')?.addEventListener('click', (e) => {
    e.preventDefault();
    resetView();
  });

  // Handle Escape key to close the panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPanelOpen && !isAnimating) {
      resetView();
    }
  });
};

// Extracts per-item configuration overrides from HTML data attributes.
// Reads available data-* attributes from a clicked grid item and returns an object
// with values to temporarily override the global config for the animation.
const extractItemConfigOverrides = (item) => {
  const overrides = {};

  if (item.dataset.clipPathDirection) overrides.clipPathDirection = item.dataset.clipPathDirection;
  if (item.dataset.steps) overrides.steps = parseInt(item.dataset.steps);
  if (item.dataset.stepDuration) overrides.stepDuration = parseFloat(item.dataset.stepDuration);
  if (item.dataset.stepInterval) overrides.stepInterval = parseFloat(item.dataset.stepInterval);
  if (item.dataset.rotationRange) overrides.rotationRange = parseFloat(item.dataset.rotationRange);
  if (item.dataset.wobbleStrength)
    overrides.wobbleStrength = parseFloat(item.dataset.wobbleStrength);
  if (item.dataset.moverPauseBeforeExit)
    overrides.moverPauseBeforeExit = parseFloat(item.dataset.moverPauseBeforeExit);
  if (item.dataset.panelRevealEase) overrides.panelRevealEase = item.dataset.panelRevealEase;
  if (item.dataset.gridItemEase) overrides.gridItemEase = item.dataset.gridItemEase;
  if (item.dataset.moverEnterEase) overrides.moverEnterEase = item.dataset.moverEnterEase;
  if (item.dataset.moverExitEase) overrides.moverExitEase = item.dataset.moverExitEase;
  if (item.dataset.panelRevealDurationFactor)
    overrides.panelRevealDurationFactor = parseFloat(item.dataset.panelRevealDurationFactor);
  if (item.dataset.clickedItemDurationFactor)
    overrides.clickedItemDurationFactor = parseFloat(item.dataset.clickedItemDurationFactor);
  if (item.dataset.gridItemStaggerFactor)
    overrides.gridItemStaggerFactor = parseFloat(item.dataset.gridItemStaggerFactor);
  if (item.dataset.moverBlendMode) overrides.moverBlendMode = item.dataset.moverBlendMode;
  if (item.dataset.pathMotion) overrides.pathMotion = item.dataset.pathMotion;
  if (item.dataset.sineAmplitude) overrides.sineAmplitude = parseFloat(item.dataset.sineAmplitude);
  if (item.dataset.sineFrequency) overrides.sineFrequency = parseFloat(item.dataset.sineFrequency);
  if (item.dataset.moverSurface) overrides.moverSurface = item.dataset.moverSurface;
  if (item.dataset.surfaceStrength)
    overrides.surfaceStrength = parseFloat(item.dataset.surfaceStrength);
  if (item.dataset.edgeNoise) overrides.edgeNoise = parseFloat(item.dataset.edgeNoise);
  if (item.dataset.moverRevealAmount)
    overrides.moverRevealAmount = parseFloat(item.dataset.moverRevealAmount);

  return overrides;
};

// Animate hiding the frame overlay
const hideFrame = () => {
  gsap.to(frame, {
    opacity: 0,
    duration: 0.5,
    ease: 'sine.inOut',
    pointerEvents: 'none',
  });
};

// Animate showing the frame overlay
const showFrame = () => {
  gsap.to(frame, {
    opacity: 1,
    duration: 0.5,
    ease: 'sine.inOut',
    pointerEvents: 'auto',
  });
};

// Pause page scrolling while the panel is open (Lenis when active, native scroll otherwise)
const setScrollLock = (locked) => {
  document.documentElement.classList.toggle('scroll-locked', locked);
  if (window.lenis) locked ? window.lenis.stop() : window.lenis.start();
};

// Keep keyboard focus inside the panel while it's open, and on the page while it's closed
const setPanelInteractive = (isOpen) => {
  panel.inert = !isOpen;
  document.querySelectorAll('.frame, .heading, .grid').forEach((el) => (el.inert = isOpen));
};

// Position the panel based on which side the item was clicked
const positionPanelBasedOnClick = (clickedItem) => {
  const centerX = getElementCenter(clickedItem).x;
  const windowHalf = window.innerWidth / 2;

  const isLeftSide = centerX < windowHalf;

  if (isLeftSide) {
    panel.classList.add('panel--right');
  } else {
    panel.classList.remove('panel--right');
  }

  // ✨ New logic to flip clipPathDirection if enabled
  if (config.autoAdjustHorizontalClipPath) {
    if (config.clipPathDirection === 'left-right' || config.clipPathDirection === 'right-left') {
      config.clipPathDirection = isLeftSide ? 'left-right' : 'right-left';
    }
  }
};

// Get appropriate clip-paths depending on animation direction
const getClipPathsForDirection = (direction) => {
  switch (direction) {
    case 'bottom-top':
      return {
        from: 'inset(0% 0% 100% 0%)',
        reveal: 'inset(0% 0% 0% 0%)',
        hide: 'inset(100% 0% 0% 0%)',
      };
    case 'left-right':
      return {
        from: 'inset(0% 100% 0% 0%)',
        reveal: 'inset(0% 0% 0% 0%)',
        hide: 'inset(0% 0% 0% 100%)',
      };
    case 'right-left':
      return {
        from: 'inset(0% 0% 0% 100%)',
        reveal: 'inset(0% 0% 0% 0%)',
        hide: 'inset(0% 100% 0% 0%)',
      };
    case 'top-bottom':
    default:
      return {
        from: 'inset(100% 0% 0% 0%)',
        reveal: 'inset(0% 0% 0% 0%)',
        hide: 'inset(0% 0% 100% 0%)',
      };
  }
};

// Handle click on a grid item and trigger the full transition
const onGridItemClick = (item) => {
  if (isAnimating) return;
  isAnimating = true;
  currentItem = item;

  // Freeze the page before measuring anything, so it can't move under the transition
  setScrollLock(true);

  // ✨ Merge overrides into global config temporarily
  const overrides = extractItemConfigOverrides(item);
  Object.assign(config, overrides);

  // Position the panel, with updated config
  positionPanelBasedOnClick(item);

  const { imgURL, title, desc } = extractItemData(item);
  setPanelContent({ imgURL, title, desc });
  setPanelInteractive(true);

  const allItems = document.querySelectorAll('.grid__item');

  // Reduced motion: crossfade to the panel instead of moving the image
  if (prefersReducedMotion()) {
    crossfadeToPanel(allItems);
    return;
  }

  const delays = computeStaggerDelays(item, allItems);
  animateGridItems(allItems, item, delays);
  animateTransition(
    item.querySelector('.grid__item-image'),
    panel.querySelector('.panel__img'),
    imgURL,
  );
};

// Extract image URL and caption text from a grid item
const extractItemData = (item) => {
  const imgDiv = item.querySelector('.grid__item-image');
  const caption = item.querySelector('figcaption');
  return {
    imgURL: imgDiv.style.backgroundImage,
    title: caption.querySelector('h3').textContent,
    desc: caption.querySelector('p').textContent,
  };
};

// Set the panel's background and text based on clicked item
const setPanelContent = ({ imgURL, title, desc }) => {
  panel.querySelector('.panel__img').style.backgroundImage = imgURL;
  panel.querySelector('.panel__img').setAttribute('aria-label', title);
  panel.querySelector('h3').textContent = title;
  panel.querySelector('p').textContent = desc;
};

// Calculate the center position of an element
const getElementCenter = (el) => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

// Compute stagger delays for grid item exit animations
const computeStaggerDelays = (clickedItem, items) => {
  const baseCenter = getElementCenter(clickedItem);
  const distances = Array.from(items).map((el) => {
    const center = getElementCenter(el);
    return Math.hypot(center.x - baseCenter.x, center.y - baseCenter.y);
  });
  const max = Math.max(...distances);
  return distances.map((d) => (d / max) * config.gridItemStaggerFactor);
};

// Animate all grid items fading/scaling out, except clicked one
const animateGridItems = (items, clickedItem, delays) => {
  const clipPaths = getClipPathsForDirection(config.clipPathDirection);

  gsap.to(items, {
    opacity: 0,
    scale: (i, el) => (el === clickedItem ? 1 : 0.8),
    duration: (i, el) =>
      el === clickedItem ? config.stepDuration * config.clickedItemDurationFactor : 0.3,
    ease: config.gridItemEase,
    // With WebGL movers the clicked image leaves as a sheet instead of being clipped
    clipPath: (i, el) => (el === clickedItem && !usesSheets() ? clipPaths.from : 'none'),
    delay: (i) => delays[i],
  });
};

// Animate the full transition (movers + panel reveal)
const animateTransition = (startEl, endEl, imgURL) => {
  hideFrame();

  // Generate path between start and end
  const path = generateMotionPath(
    startEl.getBoundingClientRect(),
    endEl.getBoundingClientRect(),
    config.steps,
  );

  // ✨ 'silk' and 'ink' movers are drawn with WebGL
  if (usesSheets()) {
    animateSheetTransition(startEl, endEl, imgURL, path);
    return;
  }

  const fragment = document.createDocumentFragment();
  const clipPaths = getClipPathsForDirection(config.clipPathDirection);

  // Create and animate movers
  path.forEach((step, index) => {
    const mover = document.createElement('div');
    mover.className = 'mover';
    gsap.set(mover, createMoverStyle(step, index, imgURL));
    fragment.appendChild(mover);

    const delay = index * config.stepInterval;
    gsap
      .timeline({ delay })
      .fromTo(
        mover,
        { opacity: 0.4, clipPath: clipPaths.hide },
        {
          opacity: 1,
          clipPath: clipPaths.reveal,
          duration: config.stepDuration,
          ease: config.moverEnterEase,
        },
      )
      .to(
        mover,
        {
          clipPath: clipPaths.from,
          duration: config.stepDuration,
          ease: config.moverExitEase,
        },
        `+=${config.moverPauseBeforeExit}`,
      );
  });

  // Insert all movers at once
  grid.parentNode.insertBefore(fragment, grid.nextSibling);

  // Schedule mover cleanup and panel reveal
  scheduleCleanup(document.querySelectorAll('.mover'));
  revealPanel(endEl);
};

// Create style for each mover element
const createMoverStyle = (step, index, imgURL) => {
  const style = {
    backgroundImage: imgURL,
    position: 'fixed',
    left: step.left,
    top: step.top,
    width: step.width,
    height: step.height,
    clipPath: getClipPathsForDirection(config.clipPathDirection).from,
    zIndex: 1000 + index,
    backgroundPosition: '50% 50%',
    rotationZ: gsap.utils.random(-config.rotationRange, config.rotationRange),
  };
  if (config.moverBlendMode) style.mixBlendMode = config.moverBlendMode;
  return style;
};

// Remove movers after their animation ends
const scheduleCleanup = (movers) => {
  const cleanupDelay =
    config.steps * config.stepInterval + config.stepDuration * 2 + config.moverPauseBeforeExit;
  gsap.delayedCall(cleanupDelay, () => movers.forEach((m) => m.remove()));
};

// Mark the panel as open once it's fully revealed, and move focus to its close button
const onPanelRevealed = () => {
  isAnimating = false;
  isPanelOpen = true;
  panelContent.querySelector('.panel__close').focus({ preventScroll: true });
};

// Reveal the final panel with animated clip-path
const revealPanel = (endImg) => {
  const clipPaths = getClipPathsForDirection(config.clipPathDirection);

  gsap.set(panelContent, { opacity: 0 });
  gsap.set(panel, { opacity: 1, pointerEvents: 'auto' });

  gsap
    .timeline({
      defaults: {
        duration: config.stepDuration * config.panelRevealDurationFactor,
        ease: config.panelRevealEase,
      },
    })
    .fromTo(
      endImg,
      { clipPath: clipPaths.hide },
      {
        clipPath: clipPaths.reveal,
        pointerEvents: 'auto',
        delay: config.steps * config.stepInterval,
      },
    )
    .fromTo(
      panelContent,
      { y: 25 },
      {
        duration: 1,
        ease: 'expo',
        opacity: 1,
        y: 0,
        delay: config.steps * config.stepInterval,
        onComplete: onPanelRevealed,
      },
      '<-=.2',
    );
};

// Animate the transition with WebGL movers (see js/webgl/). The clicked image, each copy
// along the path and the panel image are sheets drawn with the surface's shaders: 'silk'
// ripples and unrolls, 'ink' blooms and dissolves. The last one settles and hands over to the panel.
const animateSheetTransition = (startEl, endEl, imgURL, path) => {
  const startRect = startEl.getBoundingClientRect();
  const endRect = endEl.getBoundingClientRect();
  const travel = {
    x: endRect.left + endRect.width / 2 - (startRect.left + startRect.width / 2),
    y: endRect.top + endRect.height / 2 - (startRect.top + startRect.height / 2),
  };
  const travelLength = Math.hypot(travel.x, travel.y) || 1;
  const addSheet = (rect, props) =>
    sheets.add({
      rect,
      travel,
      wipe: config.clipPathDirection,
      edgeNoise: config.edgeNoise,
      ...props,
    });

  // The panel image stays hidden until the last sheet hands over to it
  gsap.set(endEl, { clipPath: 'inset(0% 0% 100% 0%)' });
  gsap.set(panelContent, { opacity: 0 });
  gsap.set(panel, { opacity: 1, pointerEvents: 'auto' });

  sheets.use(config.moverSurface);
  sheets.load(imgURL).then(() => {
    const tl = gsap.timeline({
      onComplete: () => {
        sheets.stop();
        gsap.set(startEl, { clearProps: 'opacity,transition' });
        onPanelRevealed();
      },
    });

    // The clicked image leaves its place: a sheet replaces it on the same frame
    // (at its current opacity, which is lower while hovered) and rolls away or dissolves.
    // Its hover transition is turned off meanwhile, so it doesn't fade out under the sheet.
    const source = addSheet(startRect, {
      reveal: 1,
      opacity: parseFloat(getComputedStyle(startEl).opacity),
    });
    gsap.set(startEl, { opacity: 0, transition: 'none' });
    tl.to(
      source,
      {
        hide: 1,
        strength: config.surfaceStrength,
        duration: config.stepDuration * config.clickedItemDurationFactor,
        ease: config.gridItemEase,
      },
      0,
    );

    // Copies along the path, calmer the closer they get to the panel
    // ('ink' copies bloom from a point near their center)
    path.forEach((step, index) => {
      const copy = addSheet(step, {
        strength: config.surfaceStrength * (1 - index / path.length),
        rotation: gsap.utils.random(-config.rotationRange, config.rotationRange),
        origin: { x: gsap.utils.random(0.42, 0.58), y: gsap.utils.random(0.42, 0.58) },
      });
      const start = index * config.stepInterval;
      tl.fromTo(
        copy,
        { reveal: 0, opacity: 0.4 },
        {
          reveal: config.moverRevealAmount,
          opacity: 1,
          duration: config.stepDuration,
          ease: config.moverEnterEase,
        },
        start,
      ).to(
        copy,
        {
          hide: 1,
          duration: config.stepDuration,
          ease: config.moverExitEase,
        },
        start + config.stepDuration + config.moverPauseBeforeExit,
      );
    });

    // The panel image comes in last and settles still ('ink' soaks in from the side the copies
    // arrive from), then the DOM image fades in over it (so the small filtering differences
    // between WebGL and the browser never show) and takes its place
    const landing = addSheet(endRect, {
      strength: config.surfaceStrength * 0.5,
      origin: {
        x: 0.5 - (travel.x / travelLength) * 0.35,
        y: 0.5 - (travel.y / travelLength) * 0.35,
      },
    });
    const landingStart = config.steps * config.stepInterval;
    tl.to(
      landing,
      {
        reveal: 1,
        strength: 0,
        duration: config.stepDuration * config.panelRevealDurationFactor,
        ease: config.panelRevealEase,
      },
      landingStart,
    )
      .fromTo(
        endEl,
        { opacity: 0, clipPath: 'inset(0% 0% 0% 0%)', pointerEvents: 'auto' },
        { opacity: 1, duration: 0.3, ease: 'none' },
        '>',
      )
      .call(() => sheets.remove(landing), null, '>')
      .fromTo(
        panelContent,
        { y: 25 },
        { duration: 1, ease: 'expo', opacity: 1, y: 0 },
        landingStart * 2 - 0.2,
      );

    sheets.start();
  });
};

// Crossfade from the grid to the panel (used when reduced motion is preferred)
const crossfadeToPanel = (items) => {
  hideFrame();
  gsap.to(items, { opacity: 0, duration: 0.5, ease: 'sine.inOut' });

  gsap.set(panel.querySelector('.panel__img'), {
    clipPath: 'inset(0% 0% 0% 0%)',
  });
  gsap.set(panelContent, { opacity: 1, y: 0 });
  gsap.set(panel, { pointerEvents: 'auto' });
  gsap.fromTo(
    panel,
    { opacity: 0 },
    {
      opacity: 1,
      duration: 0.5,
      delay: 0.3,
      ease: 'sine.inOut',
      onComplete: onPanelRevealed,
    },
  );
};

// Generate motion path between start and end elements
const generateMotionPath = (startRect, endRect, steps) => {
  const path = [];
  const fullSteps = steps + 2;
  const startCenter = {
    x: startRect.left + startRect.width / 2,
    y: startRect.top + startRect.height / 2,
  };
  const endCenter = {
    x: endRect.left + endRect.width / 2,
    y: endRect.top + endRect.height / 2,
  };

  for (let i = 0; i < fullSteps; i++) {
    const t = i / (fullSteps - 1);
    const width = lerp(startRect.width, endRect.width, t);
    const height = lerp(startRect.height, endRect.height, t);
    const centerX = lerp(startCenter.x, endCenter.x, t);
    const centerY = lerp(startCenter.y, endCenter.y, t);

    // Apply top offset (for sine motion)
    const sineOffset =
      config.pathMotion === 'sine' ? Math.sin(t * config.sineFrequency) * config.sineAmplitude : 0;

    // ✨ Add random wobble
    const wobbleX = (Math.random() - 0.5) * config.wobbleStrength;
    const wobbleY = (Math.random() - 0.5) * config.wobbleStrength;

    path.push({
      left: centerX - width / 2 + wobbleX,
      top: centerY - height / 2 + sineOffset + wobbleY,
      width,
      height,
    });
  }

  return path.slice(1, -1);
};

// Reset everything and return to the initial grid view
const resetView = () => {
  if (isAnimating) return;
  isAnimating = true;

  // Hand keyboard focus back to the page, on the item that was opened
  setPanelInteractive(false);
  currentItem.focus({ preventScroll: true });

  const allItems = document.querySelectorAll('.grid__item');
  const delays = computeStaggerDelays(currentItem, allItems);

  gsap
    .timeline({
      defaults: { duration: config.stepDuration, ease: 'expo' },
      onComplete: () => {
        panel.classList.remove('panel--right');
        isAnimating = false;
        isPanelOpen = false;
        setScrollLock(false);
      },
    })
    .to(panel, { opacity: 0 })
    .add(showFrame, 0)
    .set(panel, { opacity: 0, pointerEvents: 'none' })
    .set(panel.querySelector('.panel__img'), {
      clipPath: 'inset(0% 0% 100% 0%)',
    })
    // With reduced motion the items only fade back in, without scaling
    .set(allItems, { clipPath: 'none', opacity: 0, scale: prefersReducedMotion() ? 1 : 0.8 }, 0)
    .to(
      allItems,
      {
        opacity: 1,
        scale: 1,
        delay: (i) => delays[i],
      },
      '>',
    );

  Object.assign(config, originalConfig);
};

// Preload images and fonts then initialize everything
Promise.all([
  preloadImages('.grid__item-image, .panel__img'),
  preloadFonts(['400 1em halyard-display', '500 1em halyard-display', '700 1em owners-xnarrow']),
]).then(() => {
  document.body.classList.remove('loading');
  init();
});
