import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "medium",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}) => {
  const classes = `${variant} ${size} ${loading ? "loading" : ""} ${className}`;

  return (
    <button className={classes} disabled={disabled ?? loading} {...props}>
      {loading && <span className="loading-spinner" />}
      {children}
    </button>
  );
};

export default Button;
