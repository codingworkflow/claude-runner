import React from "react";
import { makeStyles } from "../../styles/makeStyles";
import { tokens } from "../../styles/tokens";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

const useInputStyles = makeStyles({
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacing.xs,
  },
  fullWidth: {
    width: "100%",
    flex: "1",
  },
  label: {
    fontSize: "var(--vscode-font-size)",
    color: "var(--vscode-foreground)",
    fontWeight: "500",
  },
  input: {
    fontFamily: "var(--vscode-font-family)",
    fontSize: "var(--vscode-font-size)",
    padding: tokens.spacing.xs + " " + tokens.spacing.sm,
    backgroundColor: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border)",
    borderRadius: tokens.borderRadius.sm,
    lineHeight: "1.2",
    width: "100%",
  },
  inputFocus: {
    outline: "1px solid var(--vscode-focusBorder)",
    outlineOffset: "-1px",
  },
  inputError: {
    borderColor: "var(--vscode-errorForeground)",
  },
  error: {
    fontSize: "var(--vscode-font-size)",
    color: "var(--vscode-errorForeground)",
    marginTop: tokens.spacing.xs,
  },
});

const Input: React.FC<InputProps> = ({
  label,
  error,
  fullWidth = false,
  className = "",
  id,
  ...props
}) => {
  // NOSONAR S2245 - Math.random() is safe for non-cryptographic HTML element IDs in VSCode extension
  const inputId = id ?? `input-${Math.random().toString(36).substring(2, 11)}`;
  const styles = useInputStyles();

  const inputGroupStyle = {
    ...styles.inputGroup,
    ...(fullWidth ? styles.fullWidth : {}),
  };

  const inputStyle = {
    ...styles.input,
    ...(error ? styles.inputError : {}),
  };

  const containerClasses = ["input-group", fullWidth ? "full-width" : ""]
    .filter(Boolean)
    .join(" ");

  const inputClasses = [className, error ? "error" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses} style={inputGroupStyle}>
      {label && (
        <label htmlFor={inputId} style={styles.label}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={inputClasses}
        style={inputStyle}
        onFocus={(e) => {
          Object.assign(e.target.style, styles.inputFocus);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.target.style.outline = "";
          e.target.style.outlineOffset = "";
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && (
        <div className="input-error" style={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
};

export default Input;
