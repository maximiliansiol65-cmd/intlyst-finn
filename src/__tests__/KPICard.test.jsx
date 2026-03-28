import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KPICard } from "../components/ui/KPICard";

describe("KPICard", () => {
  const baseProps = {
    value: 12500,
    label: "Umsatz",
    unit: "€",
    trend: 8.5,
    compare: "vs. letzter Monat",
    animate: false,
  };

  it("renders label and value", () => {
    render(<KPICard {...baseProps} />);
    expect(screen.getByText("Umsatz")).toBeInTheDocument();
  });

  it("shows positive trend indicator", () => {
    render(<KPICard {...baseProps} trend={8.5} />);
    const trendEl = screen.getByText(/8\.5/);
    expect(trendEl).toBeInTheDocument();
    expect(trendEl.className).toMatch(/up/i);
  });

  it("shows negative trend indicator", () => {
    render(<KPICard {...baseProps} trend={-4.2} />);
    const trendEl = screen.getByText(/4\.2/);
    expect(trendEl.className).toMatch(/down/i);
  });

  it("shows compare text", () => {
    render(<KPICard {...baseProps} />);
    expect(screen.getByText("vs. letzter Monat")).toBeInTheDocument();
  });

  it("renders expand icon when details provided", () => {
    render(
      <KPICard
        {...baseProps}
        details={{ previous: 11500, absolute_change: 1000, forecast: 13000 }}
      />
    );
    expect(screen.getByText("⤢")).toBeInTheDocument();
  });

  it("opens details modal on click when details provided", () => {
    render(
      <KPICard
        {...baseProps}
        details={{ previous: 11500, absolute_change: 1000, forecast: 13000 }}
      />
    );
    const card = screen.getByRole("button");
    fireEvent.click(card);
    expect(screen.getByText("Aktueller Wert")).toBeInTheDocument();
  });

  it("closes modal when backdrop clicked", () => {
    render(
      <KPICard
        {...baseProps}
        details={{ previous: 11500, absolute_change: 1000 }}
      />
    );
    fireEvent.click(screen.getByRole("button"));
    // Close button
    const closeBtn = screen.getByText("✕");
    fireEvent.click(closeBtn);
    expect(screen.queryByText("Aktueller Wert")).not.toBeInTheDocument();
  });

  it("calls onClick handler", () => {
    const onClick = vi.fn();
    render(<KPICard {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders without trend gracefully", () => {
    render(<KPICard value={999} label="Sessions" animate={false} />);
    expect(screen.getByText("Sessions")).toBeInTheDocument();
  });
});
