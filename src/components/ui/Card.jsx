/**
 * Card — variant: default | flat | elevated
 *        hover:   adds translateY(-2px) lift on hover
 *        clickable: cursor pointer + hover lift
 *        accent:  "primary" | "success" | "warning" | "danger" | "purple" | "teal"
 *        padding: override default "var(--s-5) var(--s-6)"
 */
export function Card({
  variant = "default",
  hover = false,
  clickable = false,
  accent,
  padding,
  className = "",
  style,
  children,
  onClick,
  ...props
}) {
  const baseClass = variant === "elevated" ? "card card-elevated"
    : variant === "flat" ? "card card-flat"
    : "card";

  const cls = [
    baseClass,
    hover && "card-hover",
    clickable && "card-clickable",
    accent && `card-accent-${accent}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cls}
      onClick={onClick}
      style={{ ...(padding ? { padding } : {}), ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
