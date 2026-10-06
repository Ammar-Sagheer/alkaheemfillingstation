/**
 * The five company-asset categories: value, label, icon.
 *
 * A plain data module, not exported from CompanyAssetForm.js, for the same
 * reason guide-content.js stands apart from GuideFlow.js: a 'use client' file
 * cannot hand a server component a plain array. Every export of a client
 * module becomes a client reference at the boundary, so a server component
 * importing `CATEGORIES` from a 'use client' file gets a reference object
 * instead of the array itself, and `.map` fails at build time. Both the
 * client-side picker and the server-rendered card grid need this list, so it
 * lives somewhere free of a client boundary.
 */
export const ASSET_CATEGORIES = [
  { value: 'vehicle', label: 'Vehicle', icon: 'vehicle' },
  { value: 'machinery', label: 'Machinery', icon: 'machinery' },
  { value: 'property', label: 'Property', icon: 'property' },
  { value: 'electronics', label: 'Electronics', icon: 'electronics' },
  { value: 'other', label: 'Other', icon: 'other' },
];
