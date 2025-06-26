import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

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

  return (
    <div className={`input-group ${fullWidth ? "full-width" : ""}`}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        className={`${error ? "error" : ""} ${className}`}
        {...props}
      />
      {error && <div className="input-error">{error}</div>}
    </div>
  );
};

export default Input;
