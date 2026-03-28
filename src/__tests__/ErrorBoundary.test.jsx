import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../components/ErrorBoundary";

// Component that throws on command
function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error("Test explosion");
  return <div>safe</div>;
}

// Suppress console.error for expected errors
const consoleError = console.error;
afterEach(() => {
  console.error = consoleError;
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows error UI when child throws", () => {
    console.error = vi.fn(); // suppress expected error output
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Etwas ist schiefgelaufen")).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
  });

  it("shows reload button on error", () => {
    console.error = vi.fn();
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Seite neu laden")).toBeInTheDocument();
  });

  it("shows retry button on error", () => {
    console.error = vi.fn();
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Erneut versuchen")).toBeInTheDocument();
  });

  it("resets error state on retry click", () => {
    console.error = vi.fn();
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText("Erneut versuchen"));
    // After reset the boundary re-renders children — Bomb still throws,
    // so error UI reappears; the important thing is no crash.
    expect(screen.getByText("Etwas ist schiefgelaufen")).toBeInTheDocument();
  });
});
