import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "error";
  loading?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}) => {
  const classes = `${variant} ${className}`;

  return (
    <button className={classes} disabled={disabled ?? loading} {...props}>
      {loading && (
        <span
          className="loading-spinner"
          style={{ width: "12px", height: "12px", marginRight: "6px" }}
        />
      )}
      {children}
    </button>
  );
};

export default Button;
