import { useState } from "react";

/**
 * Button — variant: primary | secondary | ghost | danger
 *          size:    sm | md | lg
 *          loading, success, disabled states
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  success = false,
  disabled = false,
  className = "",
  children,
  onClick,
  type = "button",
  style,
  ...props
}) {
  const cls = [
    "btn",
    `btn-${variant}`,
    `btn-${size}`,
    loading && "btn-loading",
    success && "btn-success-state",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      onClick={onClick}
      style={style}
      {...props}
    >
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      <span className="btn-content" style={{ opacity: loading ? 0 : 1 }}>
        {success ? <span className="btn-check" aria-hidden="true">✓</span> : children}
      </span>
    </button>
  );
}

/**
 * IconButton — runder oder quadratischer Icon-Button
 */
export function IconButton({
  children,
  className = "",
  label,
  badge,
  ...props
}) {
  return (
    <button
      className={`btn-icon ${className}`}
      aria-label={label}
      {...props}
    >
      {children}
      {badge != null && <span className="notif-count">{badge}</span>}
    </button>
  );
}

export default Button;
