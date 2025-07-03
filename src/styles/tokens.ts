export const tokens = {
  spacing: {
    xs: "4px", // Replace scattered 4px values
    sm: "8px", // Replace scattered 6px, 8px values
    md: "12px", // Replace scattered 10px, 12px values
    lg: "16px", // Replace scattered 16px, 20px values
    xl: "24px", // For larger gaps
  },
  fontSize: {
    xs: "calc(var(--vscode-font-size) - 2px)",
    sm: "calc(var(--vscode-font-size) - 1px)",
    base: "var(--vscode-font-size)",
    lg: "calc(var(--vscode-font-size) + 1px)",
  },
  borderRadius: {
    sm: "2px", // Current standard
    md: "4px", // For cards/larger elements
  },
} as const;
