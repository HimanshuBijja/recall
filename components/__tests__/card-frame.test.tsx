import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test } from "vitest";
import { CardFrame } from "@/components/CardFrame";

test("renders nothing without a url", () => {
  const { container } = render(<CardFrame url={undefined} />);
  expect(container).toBeEmptyDOMElement();
});

test("image is absent until the button is pressed", () => {
  render(<CardFrame url="https://r2/x.png" />);
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /show frame/i }));
  const img = screen.getByRole("img") as HTMLImageElement;
  expect(img.getAttribute("src")).toBe("https://r2/x.png");
  fireEvent.click(screen.getByRole("button", { name: /hide frame/i }));
  expect(screen.queryByRole("img")).toBeNull();
});

test("renders YouTube deep-link button with formatted timestamp when video source is provided", () => {
  render(
    <CardFrame
      source={{
        type: "video",
        videoId: "8dUh3oOhtqs",
        url: "https://www.youtube.com/watch?v=8dUh3oOhtqs",
        timestamp: 145,
      }}
    />
  );
  const link = screen.getByRole("link", { name: /youtube \(2:25\)/i }) as HTMLAnchorElement;
  expect(link).not.toBeNull();
  expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=8dUh3oOhtqs&t=145s");
  expect(link.getAttribute("target")).toBe("_blank");
});

