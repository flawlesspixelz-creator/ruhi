import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { api, seedReadHandlers, server } from "../test/server";
import { CREATOR, makeDocument } from "../test/fixtures";
import { renderApp } from "../test/utils";
import type { ApprovalDocument } from "../types/document";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/Title/), "New agreement");
  await user.type(screen.getByLabelText(/Customer/), "Northwind");
  await user.selectOptions(screen.getByLabelText(/Document type/), "Contract");
  await user.selectOptions(screen.getByLabelText(/^Priority/), "High");
  await user.click(screen.getByRole("checkbox", { name: "Bob Martinez" }));
}

describe("create document form", () => {
  it("blocks submission and highlights every missing required field", async () => {
    seedReadHandlers([]);
    let created = false;
    server.use(
      http.post(api("/documents"), () => {
        created = true;
        return HttpResponse.json(makeDocument({}), { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderApp({ path: "/documents/new", user: CREATOR });

    await user.click(await screen.findByRole("button", { name: "Create document" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Customer is required.")).toBeInTheDocument();
    expect(screen.getByText("Document type is required.")).toBeInTheDocument();
    expect(screen.getByText("Priority is required.")).toBeInTheDocument();
    // Both the hint and the error use this copy; the error adds a second node.
    expect(screen.getAllByText("Select at least one approver.").length).toBeGreaterThan(1);
    expect(created).toBe(false);
  });

  it("creates a draft owned by the current user and navigates to it", async () => {
    let requestBody: Record<string, unknown> | null = null;
    let createdDoc: ApprovalDocument | null = null;
    seedReadHandlers([]);
    server.use(
      http.post(api("/documents"), async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        createdDoc = makeDocument({
          id: "created-1",
          title: requestBody.title as string,
          status: "draft",
        });
        return HttpResponse.json(createdDoc, { status: 201 });
      }),
      http.get(api("/documents/created-1"), () => HttpResponse.json(createdDoc)),
    );

    const user = userEvent.setup();
    const { router } = renderApp({ path: "/documents/new", user: CREATOR });

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Create document" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/documents/created-1"),
    );
    expect(requestBody).toMatchObject({
      title: "New agreement",
      customer: "Northwind",
      documentType: "Contract",
      priority: "High",
      owner: { id: CREATOR.id, name: CREATOR.name },
      approvers: [{ id: "u2", name: "Bob Martinez" }],
    });
  });

  it("rejects a non-PDF file at selection time", async () => {
    seedReadHandlers([]);

    // applyAccept off: simulate a file that bypasses the accept filter,
    // e.g. drag-and-drop or a browser that ignores the attribute.
    const user = userEvent.setup({ applyAccept: false });
    renderApp({ path: "/documents/new", user: CREATOR });

    const file = new File(["not a pdf"], "image.png", { type: "image/png" });
    await user.upload(await screen.findByLabelText("PDF attachment"), file);

    expect(await screen.findByText("Only PDF files are supported.")).toBeInTheDocument();
  });

  it("does not create a document when the PDF upload fails", async () => {
    seedReadHandlers([]);
    let documentCreated = false;
    server.use(
      http.post(api("/uploads"), () =>
        HttpResponse.json({ error: "Storage unavailable" }, { status: 500 }),
      ),
      http.post(api("/documents"), () => {
        documentCreated = true;
        return HttpResponse.json(makeDocument({}), { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderApp({ path: "/documents/new", user: CREATOR });

    await fillRequiredFields(user);
    const pdf = new File(["%PDF-1.4 fake"], "contract.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("PDF attachment"), pdf);
    await user.click(screen.getByRole("button", { name: "Create document" }));

    expect(
      await screen.findByText(/The PDF upload failed, so the document was not saved/),
    ).toBeInTheDocument();
    expect(documentCreated).toBe(false);
    // The user's work is intact.
    expect(screen.getByLabelText(/Title/)).toHaveValue("New agreement");
  });

  it("shows the server error and preserves input when saving fails", async () => {
    seedReadHandlers([]);
    server.use(
      http.post(api("/documents"), () =>
        HttpResponse.json({ error: "Simulated server error. Please try again." }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderApp({ path: "/documents/new", user: CREATOR });

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Create document" }));

    expect(
      await screen.findByText(/Simulated server error/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toHaveValue("New agreement");
  });

  it("warns before navigating away with unsaved changes and stays on cancel", async () => {
    seedReadHandlers([]);

    const user = userEvent.setup();
    const { router } = renderApp({ path: "/documents/new", user: CREATOR });

    await user.type(await screen.findByLabelText(/Title/), "Unsaved work");
    await user.click(screen.getByRole("link", { name: /Document Approval Portal/ }));

    expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/documents/new");

    // Leaving is also possible.
    await user.click(screen.getByRole("link", { name: /Document Approval Portal/ }));
    await user.click(await screen.findByRole("button", { name: "Discard and leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/documents"));
  });
});

describe("edit document form", () => {
  it("prefills existing values and saves changes", async () => {
    const doc = makeDocument({
      id: "edit-1",
      title: "Original title",
      status: "draft",
      description: "Original description",
    });
    seedReadHandlers([doc]);
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.put(api("/documents/edit-1"), async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...doc, ...requestBody });
      }),
    );

    const user = userEvent.setup();
    renderApp({ path: "/documents/edit-1/edit", user: CREATOR });

    const title = await screen.findByLabelText(/Title/);
    expect(title).toHaveValue("Original title");

    await user.clear(title);
    await user.type(title, "Updated title");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ title: "Updated title" });
  });

  it("redirects to the detail view when the document is not editable", async () => {
    const doc = makeDocument({ id: "locked-1", status: "approved" });
    seedReadHandlers([doc]);

    const { router } = renderApp({ path: "/documents/locked-1/edit", user: CREATOR });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/documents/locked-1"),
    );
  });
});
