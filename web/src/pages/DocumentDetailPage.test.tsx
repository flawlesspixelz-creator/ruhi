import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { api, seedReadHandlers, server } from "../test/server";
import {
  APPROVER,
  CREATOR,
  OTHER_APPROVER,
  READ_ONLY,
  makeDocument,
  makeSteps,
} from "../test/fixtures";
import { renderApp } from "../test/utils";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("document detail: role- and status-aware actions", () => {
  it("shows approve/reject to an assigned approver on a pending document", async () => {
    const doc = makeDocument({
      status: "pending_approval",
      approvers: [{ id: APPROVER.id, name: APPROVER.name }],
    });
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: APPROVER });

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit for approval" })).toBeNull();
  });

  it("offers a read-only user no mutating actions, not even commenting", async () => {
    const doc = makeDocument({
      status: "pending_approval",
      approvers: [{ id: READ_ONLY.id, name: READ_ONLY.name }],
    });
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: READ_ONLY });

    await screen.findByRole("heading", { name: doc.title });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add comment" })).toBeNull();
  });

  it("shows edit/submit to a creator on a draft", async () => {
    const doc = makeDocument({ status: "draft" });
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: CREATOR });

    expect(
      await screen.findByRole("button", { name: "Submit for approval" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("shows a not-found state for a missing document", async () => {
    seedReadHandlers([]);
    renderApp({ path: "/documents/does-not-exist", user: CREATOR });
    expect(await screen.findByText("Document not found")).toBeInTheDocument();
  });
});

describe("rejecting a document", () => {
  function setupPendingDoc() {
    const doc = makeDocument({
      status: "pending_approval",
      approvers: [{ id: APPROVER.id, name: APPROVER.name }],
    });
    seedReadHandlers([doc]);
    return doc;
  }

  it("requires a reason before sending anything to the API", async () => {
    const doc = setupPendingDoc();
    let rejectCalled = false;
    server.use(
      http.post(api(`/documents/${doc.id}/reject`), () => {
        rejectCalled = true;
        return HttpResponse.json(doc);
      }),
    );

    const user = userEvent.setup();
    renderApp({ path: `/documents/${doc.id}`, user: APPROVER });

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A rejection reason is required.",
    );
    expect(rejectCalled).toBe(false);
  });

  it("sends actor and reason, then shows the updated status", async () => {
    const doc = setupPendingDoc();
    let requestBody: unknown = null;
    server.use(
      http.post(api(`/documents/${doc.id}/reject`), async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ ...doc, status: "rejected" });
      }),
    );

    const user = userEvent.setup();
    renderApp({ path: `/documents/${doc.id}`, user: APPROVER });

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox"),
      "Terms conflict with the framework agreement",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    // The server identifies the acting user by id (it resolves the display
    // name itself and validates approval turn order against step user ids).
    expect(requestBody).toEqual({
      actor: APPROVER.id,
      reason: "Terms conflict with the framework agreement",
    });
  });

  it("keeps the dialog and the typed reason when the server fails", async () => {
    const doc = setupPendingDoc();
    server.use(
      http.post(api(`/documents/${doc.id}/reject`), () =>
        HttpResponse.json({ error: "Simulated server error." }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderApp({ path: `/documents/${doc.id}`, user: APPROVER });

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "My reason");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    // The failure is announced, the dialog stays open, and the reason is kept.
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Simulated server error.",
    );
    expect(within(dialog).getByRole("textbox")).toHaveValue("My reason");
  });
});

describe("identity switch closes a pending action dialog", () => {
  it("dismisses an open approve dialog when the current user changes", async () => {
    // A dialog opened as the current approver must not survive a switch to a
    // different user, or confirming would fire the action under the new
    // identity (e.g. a read-only user issuing an approval).
    const doc = makeDocument({
      status: "pending_approval",
      approvers: [{ id: APPROVER.id, name: APPROVER.name }],
      approvalSteps: makeSteps([APPROVER]),
    });
    seedReadHandlers([doc]);

    const user = userEvent.setup();
    renderApp({ path: `/documents/${doc.id}`, user: APPROVER });

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Switch identity via the real header selector.
    await user.selectOptions(
      screen.getByLabelText(/current user/i),
      READ_ONLY.id,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("sequential approvals", () => {
  function twoApproverDoc(overrides: Parameters<typeof makeDocument>[0] = {}) {
    return makeDocument({
      status: "pending_approval",
      approvers: [
        { id: APPROVER.id, name: APPROVER.name },
        { id: OTHER_APPROVER.id, name: OTHER_APPROVER.name },
      ],
      approvalSteps: makeSteps([APPROVER, OTHER_APPROVER]),
      ...overrides,
    });
  }

  it("offers approve/reject to the current approver in line", async () => {
    const doc = twoApproverDoc();
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: APPROVER });

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("hides approve/reject from an assigned approver whose turn has not come", async () => {
    const doc = twoApproverDoc();
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: OTHER_APPROVER });

    await screen.findByRole("heading", { name: doc.title });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("shows the approval progress with the current step marked", async () => {
    const doc = twoApproverDoc({
      approvalSteps: makeSteps([APPROVER, OTHER_APPROVER], {
        [APPROVER.id]: {
          status: "approved",
          decidedAt: "2026-06-02T10:00:00.000Z",
          comment: "Numbers check out",
        },
      }),
    });
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: CREATOR });

    await screen.findByRole("heading", { name: "Approval progress" });

    // The decided step shows the decision and its comment ("Name · Approved"
    // renders as one paragraph, so match on the trailing status).
    expect(screen.getByText(/· Approved/)).toBeInTheDocument();
    expect(screen.getByText("Numbers check out")).toBeInTheDocument();

    // The current step is highlighted for assistive tech and shows whose
    // turn it is.
    const current = screen.getByText(/Awaiting decision/).closest("li");
    expect(current).not.toBeNull();
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveTextContent(OTHER_APPROVER.name);
  });

  it("shows no approval progress for a draft", async () => {
    const doc = makeDocument({ status: "draft" });
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: CREATOR });

    await screen.findByRole("heading", { name: doc.title });
    expect(screen.queryByRole("heading", { name: "Approval progress" })).toBeNull();
  });
});

describe("approval history", () => {
  it("renders the audit trail including rejection reasons", async () => {
    const doc = makeDocument({
      status: "rejected",
      approvalHistory: [
        {
          id: "h1",
          action: "created",
          actor: "Alice Johnson",
          comment: null,
          timestamp: "2026-06-01T09:00:00.000Z",
        },
        {
          id: "h2",
          action: "rejected",
          actor: "Bob Martinez",
          comment: "Pricing is out of date",
          timestamp: "2026-06-02T10:00:00.000Z",
        },
      ],
    });
    seedReadHandlers([doc]);

    renderApp({ path: `/documents/${doc.id}`, user: CREATOR });

    await screen.findByRole("heading", { name: doc.title });
    expect(screen.getByText("Pricing is out of date")).toBeInTheDocument();
    expect(screen.getAllByText(/Bob Martinez/)).not.toHaveLength(0);
  });
});
