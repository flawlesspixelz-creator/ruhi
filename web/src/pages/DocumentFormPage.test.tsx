import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { api, seedReadHandlers, server } from "../test/server";
import { APPROVER, CREATOR, READ_ONLY, makeDocument } from "../test/fixtures";
import { renderApp } from "../test/utils";
import type { ApprovalDocument } from "../types/document";
import { ApiError } from "../api/client";
import { uploadPdf } from "../api/documents";

// The real uploadPdf() sends a multipart XHR body, which MSW's node
// interceptor (as of @mswjs/interceptors 0.41.9) never resolves under
// jsdom: the request hangs and neither `load` nor `error` fires. Mocking
// this one function lets the upload-failure test exercise the form's
// reaction without depending on that interception gap.
vi.mock("../api/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/documents")>();
  return { ...actual, uploadPdf: vi.fn(actual.uploadPdf) };
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.mocked(uploadPdf).mockClear();
});
afterAll(() => server.close());

async function fillRequiredFields(
  user: ReturnType<typeof userEvent.setup>,
  approverName = "Bob Martinez",
) {
  await user.type(await screen.findByLabelText(/Title/), "New agreement");
  await user.type(screen.getByLabelText(/Customer/), "Northwind");
  await user.selectOptions(screen.getByLabelText(/Document type/), "Contract");
  await user.selectOptions(screen.getByLabelText(/^Priority/), "High");
  await user.click(screen.getByRole("checkbox", { name: approverName }));
}

describe("create document form", () => {
  it("redirects read-only users away from the create page", async () => {
    seedReadHandlers([]);

    const { router } = renderApp({ path: "/documents/new", user: READ_ONLY });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/documents"),
    );
    expect(
      screen.queryByRole("button", { name: "Create document" }),
    ).toBeNull();
  });

  it("allows an approver to create a document", async () => {
    seedReadHandlers([]);
    server.use(
      http.post(api("/documents"), () =>
        HttpResponse.json(makeDocument({ id: "created-by-approver" }), { status: 201 }),
      ),
      http.get(api("/documents/created-by-approver"), () =>
        HttpResponse.json(makeDocument({ id: "created-by-approver" })),
      ),
    );

    const user = userEvent.setup();
    const { router } = renderApp({ path: "/documents/new", user: APPROVER });

    // The acting user (Bob Martinez) is the document's owner here, so he
    // cannot also be an approver on it; pick a different approver.
    await fillRequiredFields(user, "Chen Wei");
    await user.click(await screen.findByRole("button", { name: "Create document" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/documents/created-by-approver"),
    );
  });

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
      // The mock API requires `actor` (the creating user's id) and derives
      // the owner from it server-side; a request missing it is rejected
      // with 400 regardless of what `owner` the client sends.
      actor: CREATOR.id,
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
      http.post(api("/documents"), () => {
        documentCreated = true;
        return HttpResponse.json(makeDocument({}), { status: 201 });
      }),
    );
    vi.mocked(uploadPdf).mockRejectedValueOnce(new ApiError("Storage unavailable", 500));

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
