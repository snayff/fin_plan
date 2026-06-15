import { apiClient } from "../lib/api";

export interface Household {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  householdId: string;
  userId: string | null;
  name: string;
  role: "owner" | "admin" | "member";
  dateOfBirth: string | null;
  retirementYear: number | null;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface HouseholdInvite {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreateInviteResponse {
  token: string;
  invitedEmail: string;
}

export interface HouseholdDetails extends Household {
  memberProfiles: Member[];
  invites: HouseholdInvite[];
}

export interface Membership {
  id: string;
  householdId: string;
  userId: string | null;
  name: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  household: Household & {
    _count: { memberProfiles: number };
  };
}

export interface InviteInfo {
  householdId: string;
  householdName: string;
  emailRequired: boolean;
  maskedInvitedEmail: string | null;
}

export const householdService = {
  async getHouseholds(): Promise<{ households: Membership[] }> {
    return apiClient.get<{ households: Membership[] }>("/api/households");
  },

  async createHousehold(name: string): Promise<{ household: Household }> {
    return apiClient.post<{ household: Household }>("/api/households", { name });
  },

  async switchHousehold(id: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/api/households/${id}/switch`);
  },

  async getHouseholdDetails(id: string): Promise<{ household: HouseholdDetails }> {
    return apiClient.get<{ household: HouseholdDetails }>(`/api/households/${id}`);
  },

  async renameHousehold(id: string, name: string): Promise<{ household: Household }> {
    return apiClient.patch<{ household: Household }>(`/api/households/${id}`, { name });
  },

  async inviteMember(
    householdId: string,
    email: string,
    name: string,
    role?: "member" | "admin"
  ): Promise<CreateInviteResponse> {
    return apiClient.post<CreateInviteResponse>(`/api/households/${householdId}/invite`, {
      email,
      name,
      ...(role !== undefined ? { role } : {}),
    });
  },

  async regenerateInvite(
    householdId: string,
    inviteId: string,
    email: string,
    name: string
  ): Promise<CreateInviteResponse> {
    await this.cancelInvite(householdId, inviteId);
    return this.inviteMember(householdId, email, name);
  },

  async removeMember(householdId: string, memberId: string): Promise<{ success: boolean }> {
    return apiClient.delete<{ success: boolean }>(
      `/api/households/${householdId}/members/${memberId}`
    );
  },

  async cancelInvite(householdId: string, inviteId: string): Promise<{ success: boolean }> {
    return apiClient.delete<{ success: boolean }>(
      `/api/households/${householdId}/invites/${inviteId}`
    );
  },

  async leaveHousehold(householdId: string): Promise<{ success: boolean }> {
    return apiClient.delete<{ success: boolean }>(`/api/households/${householdId}/leave`);
  },

  async deleteHousehold(householdId: string): Promise<void> {
    await apiClient.delete<void>(`/api/households/${householdId}`);
  },

  async validateInvite(token: string): Promise<InviteInfo> {
    return apiClient.get<InviteInfo>(`/api/auth/invite/${token}`);
  },

  async acceptInvite(token: string, data: { name: string; email: string; password: string }) {
    return apiClient.post<{ user: any; accessToken: string }>(
      `/api/auth/invite/${token}/accept`,
      data
    );
  },

  async joinViaInvite(token: string): Promise<{ household: Household }> {
    return apiClient.post<{ household: Household }>(`/api/auth/invite/${token}/join`);
  },

  async listMembers(householdId: string): Promise<{ members: Member[] }> {
    return apiClient.get<{ members: Member[] }>(`/api/households/${householdId}/member-profiles`);
  },

  async createMember(
    householdId: string,
    data: { name: string; dateOfBirth?: string | null; retirementYear?: number | null }
  ): Promise<{ member: Member }> {
    return apiClient.post<{ member: Member }>(
      `/api/households/${householdId}/member-profiles`,
      data
    );
  },

  async updateMember(
    householdId: string,
    memberId: string,
    data: { name?: string; dateOfBirth?: string | null; retirementYear?: number | null }
  ): Promise<{ member: Member }> {
    return apiClient.patch<{ member: Member }>(
      `/api/households/${householdId}/member-profiles/${memberId}`,
      data
    );
  },

  async deleteMember(
    householdId: string,
    memberId: string,
    reassignToMemberId?: string
  ): Promise<{ success: boolean }> {
    return apiClient.delete<{ success: boolean }>(
      `/api/households/${householdId}/member-profiles/${memberId}`,
      reassignToMemberId ? { reassignToMemberId } : undefined
    );
  },

  async exportHousehold(): Promise<unknown> {
    return apiClient.get<unknown>("/api/households/export");
  },

  async validateImport(data: unknown): Promise<{ valid: boolean; errors?: string[] }> {
    return apiClient.post<{ valid: boolean; errors?: string[] }>(
      "/api/households/validate-import",
      data
    );
  },

  async importHousehold(
    data: unknown,
    mode: "overwrite" | "create_new"
  ): Promise<{ success: boolean; householdId: string; backupId?: string }> {
    return apiClient.post<{ success: boolean; householdId: string; backupId?: string }>(
      `/api/households/import?mode=${mode}`,
      data
    );
  },
};
