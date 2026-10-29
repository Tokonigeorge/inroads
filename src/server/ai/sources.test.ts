import { describe, expect, it } from "vitest";
import { isSearchPage } from "./sources";

describe("isSearchPage", () => {
  it("spots search, browse and category pages", () => {
    expect(isSearchPage("https://www.eventbrite.com/d/nigeria/music-industry-networking/#search")).toBe(true);
    expect(isSearchPage("https://www.eventbrite.co.uk/b/nigeria--lagos/business/")).toBe(true);
    expect(isSearchPage("https://www.meetup.com/find/?location=ng--lagos")).toBe(true);
    expect(isSearchPage("https://lu.ma/discover")).toBe(true);
    expect(isSearchPage("https://example.com/events?q=founders")).toBe(true);
    expect(isSearchPage("not a url")).toBe(true);
  });

  it("keeps an event's own page", () => {
    expect(isSearchPage("https://www.eventbrite.com/e/lagos-tech-mixer-and-social-tickets-123456789")).toBe(false);
    expect(isSearchPage("https://lu.ma/founders-lagos-nov")).toBe(false);
    expect(isSearchPage("https://www.meetup.com/lagos-founders/events/301234567/")).toBe(false);
  });
});
