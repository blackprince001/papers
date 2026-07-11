// Shared screenshot sizing so every section (About, How it works, Features)
// renders product shots at the same big, mobile-friendly scale.

const SHADOW =
  'rounded-2xl shadow-[0_30px_90px_-20px_rgba(35,41,39,0.55)] ring-1 ring-forest/5';

// Wide (landscape) shots: full width on mobile, bleeding past the right edge on desktop.
export const IMG_WIDE = `block h-auto w-full ${SHADOW} lg:w-[150%] lg:max-w-none`;

// Same, but bleeds past the LEFT edge — used when the image sits in the left column.
export const IMG_WIDE_LEFT = `block h-auto w-full ${SHADOW} lg:ml-[-50%] lg:w-[150%] lg:max-w-none`;

// Desktop height caps for the bleeding workflow mockups. Crop anchors to the
// corner nearest the copy so the cut edge bleeds off-screen, not into the text.
export const IMG_CROP = 'lg:h-[520px] lg:object-cover lg:object-left-top';
export const IMG_CROP_RIGHT = 'lg:h-[520px] lg:object-cover lg:object-right-top';

// Tall (portrait tab panel) shots: big and full width on mobile, height-capped on desktop.
export const IMG_TALL = `mx-auto block h-auto w-full max-w-[460px] ${SHADOW} lg:max-h-[680px] lg:w-auto lg:max-w-none`;
