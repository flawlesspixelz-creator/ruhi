import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { api, seedReadHandlers, server } from "../test/server";
import { ALL_USERS, APPROVER, CREATOR, READ_ONLY, makeDocument } from "../test/fixtures";
import { renderApp } from "../test/utils";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("document list", () => {
  it("renders documents and paginates past the page size", async () => {
    const docs = Array.from({ length: 7 }, (_, i) =>
      makeDocument({ id: `list-${i}`, title: `Listed doc ${i}` }),
    );
    seedReadHandlers(docs);

    const user = userEvent.setup();
    renderApp({ path: "/documents" });

    expect(await screen.findByText("7 documents")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 5); // header + page 1

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(1 + 2));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("applies filters directly from a shared URL, including the status alias", async () => {
    seedReadHandlers([
      makeDocument({ id: "p1", title: "Pending thing", status: "pending_approval" }),
      makeDocument({ id: "d1", title: "Drafted thing", status: "draft" }),
    ]);

    renderApp({ path: "/documents?status=pending" });

    expect(await screen.findByText("Pending thing")).toBeInTheDocument();
    expect(screen.queryByText("Drafted thing")).toBeNull();
  });

  it("narrows results when searching and shows the filtered empty state", async () => {
    seedReadHandlers([
      makeDocument({ id: "s1", title: "Renewal agreement" }),
      makeDocument({ id: "s2", title: "Quarterly report" }),
    ]);

    const user = userEvent.setup();
    renderApp({ path: "/documents" });

    await screen.findByText("Renewal agreement");
    const search = screen.getByRole("searchbox");
    await user.type(search, "renewal");

    await waitFor(() => expect(screen.queryByText("Quarterly report")).toBeNull());
    expect(screen.getByText("Renewal agreement")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz-no-match");
    expect(await screen.findByText("No matching documents")).toBeInTheDocument();
  });

  it("keeps the list state in the URL so the view is shareable", async () => {
    seedReadHandlers([makeDocument({ id: "u1doc", title: "URL doc" })]);

    const user = userEvent.setup();
    const { router } = renderApp({ path: "/documents" });

    await screen.findByText("URL doc");
    await user.selectOptions(screen.getByLabelText("Status"), "draft");

    await waitFor(() =>
      expect(router.state.location.search).toContain("status=draft"),
    );
  });

  it("shows an error state with retry when loading fails, then recovers", async () => {
    let failures = 0;
    server.use(
      http.get(api("/users"), () => HttpResponse.json(ALL_USERS)),
      http.get(api("/documents"), () => {
        failures += 1;
        if (failures === 1) {
          return HttpResponse.json({ error: "Boom" }, { status: 500 });
        }
        return HttpResponse.json([makeDocument({ id: "r1", title: "Recovered doc" })]);
      }),
    );

    const user = userEvent.setup();
    renderApp({ path: "/documents" });

    expect(await screen.findByText("Could not load documents")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered doc")).toBeInTheDocument();
  });

  it("hides the new-document action from read-only users", async () => {
    seedReadHandlers([makeDocument({})]);
    renderApp({ path: "/documents", user: READ_ONLY });

    await screen.findByRole("heading", { name: "Documents" });
    expect(screen.queryByRole("link", { name: "New document" })).toBeNull();
  });

  it("hides the new-document action from approvers", async () => {
    seedReadHandlers([makeDocument({})]);
    renderApp({ path: "/documents", user: APPROVER });

    await screen.findByRole("heading", { name: "Documents" });
    expect(screen.queryByRole("link", { name: "New document" })).toBeNull();
  });

  it("offers the new-document action to creators", async () => {
    seedReadHandlers([makeDocument({})]);
    renderApp({ path: "/documents", user: CREATOR });

    expect(await screen.findByRole("link", { name: "New document" })).toBeInTheDocument();
  });
});
