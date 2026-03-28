/**
 * TabBar — variant: "underline" | "pill" | "segment"
 *
 * tabs: [{ id: string, label: string }]
 * activeTab: string (id)
 * onChange: (id) => void
 */
export function TabBar({
  tabs = [],
  activeTab,
  onChange,
  variant = "underline",
  className = "",
}) {
  return (
    <div className={`tab-bar tab-bar-${variant} ${className}`} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab-item${activeTab === tab.id ? " active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
          {tab.label}
          {tab.badge != null && (
            <span style={{
              marginLeft: "6px",
              background: "var(--c-surface-3)",
              color: "var(--c-text-3)",
              borderRadius: "var(--r-full)",
              fontSize: "10px",
              fontWeight: 600,
              padding: "1px 6px",
            }}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default TabBar;
