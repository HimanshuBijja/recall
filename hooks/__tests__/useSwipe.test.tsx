import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useSwipe } from "../useSwipe";

function TestComponent({ onLeft, onRight }: { onLeft?: () => void; onRight?: () => void }) {
  const { dx, active, handlers } = useSwipe({ onLeft, onRight, threshold: 50 });
  return (
    <div data-testid="swipe-zone" {...handlers}>
      dx: {dx}, active: {active ? "yes" : "no"}
    </div>
  );
}

test("fires onRight when pointerdrag is above threshold", () => {
  const onLeft = vi.fn();
  const onRight = vi.fn();
  render(<TestComponent onLeft={onLeft} onRight={onRight} />);
  const zone = screen.getByTestId("swipe-zone");

  zone.setPointerCapture = vi.fn();
  zone.releasePointerCapture = vi.fn();

  // Pointer Down
  fireEvent.pointerDown(zone, { clientX: 100, button: 0, pointerId: 1 });
  expect(screen.getByText(/active: yes/)).toBeInTheDocument();

  // Pointer Move
  fireEvent.pointerMove(zone, { clientX: 160, pointerId: 1 });
  expect(screen.getByText(/dx: 60/)).toBeInTheDocument();

  // Pointer Up
  fireEvent.pointerUp(zone, { clientX: 160, pointerId: 1 });
  expect(screen.getByText(/active: no/)).toBeInTheDocument();
  expect(screen.getByText(/dx: 0/)).toBeInTheDocument();

  expect(onRight).toHaveBeenCalledTimes(1);
  expect(onLeft).not.toHaveBeenCalled();
});

test("fires onLeft when pointerdrag is below negative threshold", () => {
  const onLeft = vi.fn();
  const onRight = vi.fn();
  render(<TestComponent onLeft={onLeft} onRight={onRight} />);
  const zone = screen.getByTestId("swipe-zone");

  zone.setPointerCapture = vi.fn();
  zone.releasePointerCapture = vi.fn();

  fireEvent.pointerDown(zone, { clientX: 100, button: 0, pointerId: 1 });
  fireEvent.pointerMove(zone, { clientX: 40, pointerId: 1 });
  fireEvent.pointerUp(zone, { clientX: 40, pointerId: 1 });

  expect(onLeft).toHaveBeenCalledTimes(1);
  expect(onRight).not.toHaveBeenCalled();
});

test("does not fire when below threshold", () => {
  const onLeft = vi.fn();
  const onRight = vi.fn();
  render(<TestComponent onLeft={onLeft} onRight={onRight} />);
  const zone = screen.getByTestId("swipe-zone");

  zone.setPointerCapture = vi.fn();
  zone.releasePointerCapture = vi.fn();

  fireEvent.pointerDown(zone, { clientX: 100, button: 0, pointerId: 1 });
  fireEvent.pointerMove(zone, { clientX: 120, pointerId: 1 });
  fireEvent.pointerUp(zone, { clientX: 120, pointerId: 1 });

  expect(onLeft).not.toHaveBeenCalled();
  expect(onRight).not.toHaveBeenCalled();
});
