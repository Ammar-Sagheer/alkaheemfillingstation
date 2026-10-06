'use client';

import { createTheme, ThemeProvider } from '@mui/material/styles';

/**
 * The Material UI theme, so MUI's components speak the app's palette rather
 * than Material's stock one.
 *
 * WHY NOT MUI'S DEFAULTS. Its primary is a blue (#1976d2) and its warning an
 * orange (#ed6c02), and this app cannot have either. Petrol is dark blue and
 * diesel is orange - deliberately, because the owner's father reads those two
 * colours to know which nozzle he is entering (see fuel-colors.js). A blue
 * button beside a blue Petrol badge on the Readings screen spends the one cue
 * that had to stay unmistakable. So the fuels keep blue and orange, and the
 * chrome takes green, red and slate; two vocabularies that never overlap.
 *
 * It also fixed a split the app already had. Buttons were MUI blue while
 * links, success messages, "Entered" chips and every positive figure were
 * brand green - two primaries, and the blue one belonged to neither the app
 * nor the fuels.
 *
 * PRIMARY IS BRAND-700, NOT BRAND-600. MUI puts white text on a contained
 * button, and white on brand-600 (#059669) is 3.77:1 - under AA, which the
 * old `.btn-primary` had been shipping unnoticed since it used the same fill.
 * brand-700 is 5.48:1 and passes. `dark` is brand-800 for the hover, so the
 * button still darkens on press.
 *
 * The palette, and ONE piece of shape: a 12px corner on every button, the
 * radius of every other control in the new look (the date box, the inputs,
 * the segmented controls). The Dashboard first laid it over its own date
 * arrows through `sx`, and UI_CONVENTIONS.md said then that if the rollout
 * wanted it everywhere it belonged here rather than in more `sx` - the rollout
 * came, so it is here. The sizing, the uppercase labels and the elevation are
 * still MUI's own, which is what the owner asked for.
 */
const theme = createTheme({
  palette: {
    primary: {
      main: '#047857', // brand-700, 5.48:1 behind white
      dark: '#065f46', // brand-800
      light: '#059669', // brand-600
      contrastText: '#ffffff',
    },
    error: {
      main: '#b91c1c', // red-700, the same red as destructive text elsewhere
      dark: '#991b1b',
      light: '#dc2626',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#b45309', // amber-700, kept well clear of diesel's #FDBA74
      contrastText: '#ffffff',
    },
    success: {
      main: '#047857', // the same green as primary: "done" and "go" are one idea here
      contrastText: '#ffffff',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        /*
         * The secondary button (outlined, inherit) takes the new look's edge:
         * white-filled, with a slate hairline where MUI draws a near-black
         * 1px outline. Beside the new look's softened inputs and panels that
         * outline read as a different kit - DayHeader had already laid this
         * treatment over its own date arrows, and now every secondary button
         * wears it. Primary and danger keep MUI's own: the green fill and the
         * red outline are the point of them.
         */
        root: ({ ownerState }) => ({
          borderRadius: 12,
          ...(ownerState.variant === 'outlined' && ownerState.color === 'inherit'
            ? {
                backgroundColor: '#ffffff',
                borderColor: 'rgb(15 23 42 / 0.18)',
                boxShadow: '0 1px 2px rgb(15 23 42 / 0.06)',
                '&:hover': { backgroundColor: '#f8fafc', borderColor: 'rgb(15 23 42 / 0.34)' },
              }
            : {}),
        }),
      },
    },
  },
});

export default function AppTheme({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
