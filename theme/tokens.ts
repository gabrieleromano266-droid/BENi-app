/**
 * Design tokens — shared sizing, spacing, and component presets.
 *
 * Import these instead of hardcoding values so changes propagate app-wide.
 * Colors still live in theme/colors.ts (they vary by light/dark mode).
 */

/** Standard height for single-line inputs; buttons use this with matchInputHeight */
export const INPUT_HEIGHT = 40;

/** Fixed height of the app header bar */
export const HEADER_HEIGHT = 68;

/** Standard width for modal dialogs */
export const MODAL_WIDTH = 320;

/**
 * Button size presets — consumed by components/Button.tsx.
 * Adjust here to change all button sizing in one place.
 */
export const buttonSizes = {
  sm: { paddingVertical: 6,  paddingHorizontal: 12, fontSize: 13, borderRadius: 8  },
  md: { paddingVertical: 11, paddingHorizontal: 16, fontSize: 14, borderRadius: 10 },
  lg: { paddingVertical: 14, paddingHorizontal: 20, fontSize: 16, borderRadius: 12 },
} as const;

/**
 * Dropdown size presets — consumed by components/Dropdown.tsx.
 */
export const dropdownSizes = {
  sm: { height: 34, fontSize: 13, borderRadius: 8,  labelSize: 12 },
  md: { height: INPUT_HEIGHT, fontSize: 14, borderRadius: 10, labelSize: 12 },
  lg: { height: 48, fontSize: 15, borderRadius: 12, labelSize: 13 },
} as const;

/** Border-radius scale */
export const radius = {
  xs:   5,   // checkboxes and other tiny controls
  sm:   8,   // inputs, small buttons, chips
  md:   10,  // task/file cards, tabs, button-md
  lg:   12,  // file cards, menus, button-lg
  xl:   16,  // modals, property cards
  pill: 20,  // filter chips
} as const;

/** Font-size scale */
export const fontSize = {
  xs:  11,   // metadata, timestamps, tiny labels
  sm:  13,   // chips, helper labels, small buttons
  md:  14,   // body text, inputs, default button
  lg:  15,   // dropdown items, secondary headings
  xl:  17,   // modal titles
  xxl: 18,   // section headings, popup titles
  h3:  20,   // property/screen sub-headings
  h2:  26,   // main screen headings
  h1:  28,   // auth headings
} as const;

/** Spacing scale (padding, margin, gap) */
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
} as const;

/** Reusable shadow presets */
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;
