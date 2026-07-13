import { describe, expect, it } from "vitest";
import { getAvailableActions } from "./permissions";
import { APPROVER, CREATOR, OTHER_APPROVER, READ_ONLY, makeDocument } from "../test/fixtures";

/**
 * The permission matrix is the core business rule of the portal: it decides
 * every button the UI renders. Test it exhaustively per status and role.
 */
describe("getAvailableActions", () => {
  describe("draft", () => {
    const doc = makeDocument({ status: "draft" });

    it("offers edit and submit to a creator", () => {
      expect(getAvailableActions(doc, CREATOR)).toEqual(
        expect.arrayContaining(["edit", "submit", "comment"]),
      );
    });

    it("never offers approve or reject on a draft, even to an assigned approver", () => {
      const actions = getAvailableActions(doc, APPROVER);
      expect(actions).not.toContain("approve");
      expect(actions).not.toContain("reject");
    });
  });

  describe("pending approval", () => {
    const doc = makeDocument({
      status: "pending_approval",
      approvers: [{ id: APPROVER.id, name: APPROVER.name }],
    });

    it("offers approve and reject to an assigned approver", () => {
      expect(getAvailableActions(doc, APPROVER)).toEqual(
        expect.arrayContaining(["approve", "reject"]),
      );
    });

    it("does not offer approve/reject to an approver who is not assigned", () => {
      const actions = getAvailableActions(doc, OTHER_APPROVER);
      expect(actions).not.toContain("approve");
      expect(actions).not.toContain("reject");
    });

    it("does not offer approve/reject to a creator, even if listed as approver", () => {
      const docWithCreator = makeDocument({
        status: "pending_approval",
        approvers: [{ id: CREATOR.id, name: CREATOR.name }],
      });
      const actions = getAvailableActions(docWithCreator, CREATOR);
      expect(actions).not.toContain("approve");
      expect(actions).not.toContain("reject");
    });

    it("does not offer edit while pending", () => {
      expect(getAvailableActions(doc, CREATOR)).not.toContain("edit");
    });
  });

  describe("approved", () => {
    const doc = makeDocument({ status: "approved" });

    it("is terminal: no workflow actions for anyone", () => {
      for (const user of [CREATOR, APPROVER]) {
        const actions = getAvailableActions(doc, user);
        expect(actions).toEqual(["comment"]);
      }
    });
  });

  describe("rejected", () => {
    const doc = makeDocument({ status: "rejected" });

    it("offers edit and return to draft, per the brief's workflow table", () => {
      const actions = getAvailableActions(doc, CREATOR);
      expect(actions).toContain("edit");
      expect(actions).toContain("returnToDraft");
    });

    it("does not offer submit until returned to draft (API accepts submit only from draft)", () => {
      const actions = getAvailableActions(doc, CREATOR);
      expect(actions).not.toContain("submit");
      expect(actions).not.toContain("approve");
    });
  });

  describe("read-only users", () => {
    it.each(["draft", "pending_approval", "approved", "rejected"] as const)(
      "get no actions at all when the document is %s",
      (status) => {
        const doc = makeDocument({
          status,
          approvers: [{ id: READ_ONLY.id, name: READ_ONLY.name }],
        });
        expect(getAvailableActions(doc, READ_ONLY)).toEqual([]);
      },
    );
  });
});
