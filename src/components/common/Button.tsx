import React from "react";
import { makeStyles } from "../../styles/makeStyles";
import { tokens } from "../../styles/tokens";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  children: React.ReactNode;
}

const useButtonStyles = makeStyles({
  root: {
    fontFamily: "var(--vscode-font-family)",
    fontSize: "var(--vscode-font-size)",
    border: "none",
    borderRadius: tokens.borderRadius.sm,
    cursor: "pointer",
    backgroundColor: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    lineHeight: "1.2",
    transition: "all 0.2s ease",
  },
  primary: {
    backgroundColor: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
  },
  secondary: {
    backgroundColor: "var(--vscode-button-secondaryBackground)",
    color: "var(--vscode-button-secondaryForeground)",
  },
  small: {
    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
    fontSize: tokens.fontSize.sm,
  },
  medium: {
    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
    fontSize: "var(--vscode-font-size)",
  },
  large: {
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    fontSize: tokens.fontSize.lg,
  },
  loading: {
    opacity: "0.7",
    position: "relative",
  },
  loadingSpinner: {
    width: "12px",
    height: "12px",
    border: "2px solid transparent",
    borderTopColor: "currentColor",
    borderLeftColor: "currentColor",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    marginRight: tokens.spacing.sm,
    display: "inline-block",
    verticalAlign: "middle",
  },
});

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "medium",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}) => {
  const styles = useButtonStyles();

  const buttonStyle = {
    ...styles.root,
    ...styles[variant],
    ...styles[size],
    ...(loading ? styles.loading : {}),
  };

  const classNames = [variant, size, loading ? "loading" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classNames}
      style={buttonStyle}
      disabled={disabled ?? loading}
      {...props}
    >
      {loading && (
        <span className="loading-spinner" style={styles.loadingSpinner} />
      )}
      {children}
    </button>
  );
};

export default Button;
