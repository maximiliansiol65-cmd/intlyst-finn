/**
 * Badge — variant: success | warning | danger | info | primary | purple | teal | neutral
 *         size:    sm | md
 */
export function Badge({
  variant = "neutral",
  size,
  children,
  className = "",
  ...props
}) {
  const cls = [
    "badge",
    `badge-${variant}`,
    size === "sm" && "badge-sm",
    size === "md" && "badge-md",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={cls} {...props}>
      {children}
    </span>
  );
}

export default Badge;
