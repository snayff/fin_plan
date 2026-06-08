import { describe, it, expect, beforeEach, mock } from "bun:test";

// Thin wrappers over apiClient — assert each method targets the right URL with
// the right payload, including the conditional-payload branches. Mocking
// apiClient keeps this isolated from MSW (see household.service.test.ts, which
// covers the HTTP-integration happy paths).
const apiClientMock = {
  get: mock(() => Promise.resolve({} as any)),
  post: mock(() => Promise.resolve({} as any)),
  put: mock(() => Promise.resolve({} as any)),
  patch: mock(() => Promise.resolve({} as any)),
  delete: mock(() => Promise.resolve({} as any)),
};
mock.module("@/lib/api", () => ({ apiClient: apiClientMock }));

const { householdService } = await import("./household.service");

beforeEach(() => {
  apiClientMock.get.mockClear();
  apiClientMock.post.mockClear();
  apiClientMock.put.mockClear();
  apiClientMock.patch.mockClear();
  apiClientMock.delete.mockClear();
});

describe("householdService — household CRUD", () => {
  it("getHouseholdDetails GETs the household by id", () => {
    householdService.getHouseholdDetails("h1");
    expect(apiClientMock.get).toHaveBeenCalledWith("/api/households/h1");
  });

  it("renameHousehold PATCHes the new name", () => {
    householdService.renameHousehold("h1", "New Name");
    expect(apiClientMock.patch).toHaveBeenCalledWith("/api/households/h1", { name: "New Name" });
  });

  it("deleteHousehold DELETEs the household", () => {
    householdService.deleteHousehold("h1");
    expect(apiClientMock.delete).toHaveBeenCalledWith("/api/households/h1");
  });

  it("leaveHousehold DELETEs the leave endpoint", () => {
    householdService.leaveHousehold("h1");
    expect(apiClientMock.delete).toHaveBeenCalledWith("/api/households/h1/leave");
  });
});

describe("householdService.inviteMember — optional role branch", () => {
  it("omits role from the payload when not provided", () => {
    householdService.inviteMember("h1", "a@example.com");
    expect(apiClientMock.post).toHaveBeenCalledWith("/api/households/h1/invite", {
      email: "a@example.com",
    });
  });

  it("includes role in the payload when provided", () => {
    householdService.inviteMember("h1", "a@example.com", "admin");
    expect(apiClientMock.post).toHaveBeenCalledWith("/api/households/h1/invite", {
      email: "a@example.com",
      role: "admin",
    });
  });
});

describe("householdService.regenerateInvite", () => {
  it("cancels the old invite then issues a fresh one for the same email", async () => {
    const order: string[] = [];
    apiClientMock.delete.mockImplementationOnce(() => {
      order.push("delete");
      return Promise.resolve({ success: true } as any);
    });
    apiClientMock.post.mockImplementationOnce(() => {
      order.push("post");
      return Promise.resolve({ token: "t", invitedEmail: "a@example.com" } as any);
    });

    const result = await householdService.regenerateInvite("h1", "inv1", "a@example.com");

    expect(order).toEqual(["delete", "post"]);
    expect(apiClientMock.delete).toHaveBeenCalledWith("/api/households/h1/invites/inv1");
    expect(apiClientMock.post).toHaveBeenCalledWith("/api/households/h1/invite", {
      email: "a@example.com",
    });
    expect(result.token).toBe("t");
  });

  it("does not issue a new invite if cancelling the old one fails", async () => {
    apiClientMock.delete.mockImplementationOnce(() => Promise.reject(new Error("cancel failed")));
    await expect(householdService.regenerateInvite("h1", "inv1", "a@example.com")).rejects.toThrow(
      "cancel failed"
    );
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });
});

describe("householdService — member profiles", () => {
  it("listMembers GETs member-profiles", () => {
    householdService.listMembers("h1");
    expect(apiClientMock.get).toHaveBeenCalledWith("/api/households/h1/member-profiles");
  });

  it("createMember POSTs the member data", () => {
    householdService.createMember("h1", { name: "Alex", retirementYear: 2050 });
    expect(apiClientMock.post).toHaveBeenCalledWith("/api/households/h1/member-profiles", {
      name: "Alex",
      retirementYear: 2050,
    });
  });

  it("updateMember PATCHes the targeted member", () => {
    householdService.updateMember("h1", "m1", { name: "Alexis" });
    expect(apiClientMock.patch).toHaveBeenCalledWith("/api/households/h1/member-profiles/m1", {
      name: "Alexis",
    });
  });

  it("deleteMember without reassignment passes no body", () => {
    householdService.deleteMember("h1", "m1");
    expect(apiClientMock.delete).toHaveBeenCalledWith(
      "/api/households/h1/member-profiles/m1",
      undefined
    );
  });

  it("deleteMember with reassignment forwards the target member id", () => {
    householdService.deleteMember("h1", "m1", "m2");
    expect(apiClientMock.delete).toHaveBeenCalledWith("/api/households/h1/member-profiles/m1", {
      reassignToMemberId: "m2",
    });
  });

  it("removeMember DELETEs the legacy members endpoint", () => {
    householdService.removeMember("h1", "m1");
    expect(apiClientMock.delete).toHaveBeenCalledWith("/api/households/h1/members/m1");
  });
});

describe("householdService — invites & joining", () => {
  it("cancelInvite DELETEs the invite", () => {
    householdService.cancelInvite("h1", "inv1");
    expect(apiClientMock.delete).toHaveBeenCalledWith("/api/households/h1/invites/inv1");
  });

  it("acceptInvite POSTs the registration data to the token endpoint", () => {
    householdService.acceptInvite("tok", {
      name: "A",
      email: "a@example.com",
      password: "pw",
    });
    expect(apiClientMock.post).toHaveBeenCalledWith("/api/auth/invite/tok/accept", {
      name: "A",
      email: "a@example.com",
      password: "pw",
    });
  });

  it("joinViaInvite POSTs to the token join endpoint", () => {
    householdService.joinViaInvite("tok");
    expect(apiClientMock.post).toHaveBeenCalledWith("/api/auth/invite/tok/join");
  });

  it("propagates an error when joining an invalid invite", async () => {
    apiClientMock.post.mockImplementationOnce(() => Promise.reject(new Error("invalid token")));
    await expect(householdService.joinViaInvite("bad")).rejects.toThrow("invalid token");
  });
});

describe("householdService — import/export", () => {
  it("exportHousehold GETs the export endpoint", () => {
    householdService.exportHousehold();
    expect(apiClientMock.get).toHaveBeenCalledWith("/api/households/export");
  });

  it("validateImport POSTs the candidate payload", () => {
    const payload = { foo: "bar" };
    householdService.validateImport(payload);
    expect(apiClientMock.post).toHaveBeenCalledWith("/api/households/validate-import", payload);
  });

  it("importHousehold encodes the mode in the query string", () => {
    const payload = { foo: "bar" };
    householdService.importHousehold(payload, "overwrite");
    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/api/households/import?mode=overwrite",
      payload
    );
    householdService.importHousehold(payload, "create_new");
    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/api/households/import?mode=create_new",
      payload
    );
  });
});
