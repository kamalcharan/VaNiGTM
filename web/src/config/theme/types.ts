// src/config/theme/types.ts

export interface PaletteColor {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
}

export interface Typography {
  fontFamily: string;
  fontSize: number;
  fontWeightLight: number;
  fontWeightRegular: number;
  fontWeightMedium: number;
  fontWeightBold: number;
  h1: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  h2: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  h3: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  h4: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  h5: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  h6: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  body1: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  body2: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
  };
  button: {
    fontSize: string;
    fontWeight: number;
    lineHeight: number;
    textTransform: string;
  };
}

export interface Theme {
  name: string;
  colors: {
    primary: PaletteColor;
    secondary: PaletteColor;
    background: {
      default: string;
      paper: string;
      dark: string;
    };
    text: {
      primary: string;
      secondary: string;
      disabled: string;
      hint: string;
    };
    common: {
      black: string;
      white: string;
    };
    error: PaletteColor;
    warning: PaletteColor;
    info: PaletteColor;
    success: PaletteColor;
  };
  typography: Typography;
  spacing: (factor: number) => string;
  borderRadius: {
    small: string;
    medium: string;
    large: string;
    round: string;
  };
  shadows: {
    none: string;
    small: string;
    medium: string;
    large: string;
  };
  transitions: {
    easing: {
      easeInOut: string;
      easeOut: string;
      easeIn: string;
      sharp: string;
    };
    duration: {
      shortest: number;
      shorter: number;
      short: number;
      standard: number;
      complex: number;
      enteringScreen: number;
      leavingScreen: number;
    };
  };
}