import { apiClient } from "@/lib/api";
import type {
  CreateSnapshotInput,
  RenameSnapshotInput,
  SnapshotListItemResponse,
  SnapshotDetailResponse,
} from "@finplan/shared";

export const snapshotService = {
  listSnapshots: () => apiClient.get<SnapshotListItemResponse[]>("/api/snapshots"),
  getSnapshot: (id: string) => apiClient.get<SnapshotDetailResponse>(`/api/snapshots/${id}`),
  createSnapshot: (data: CreateSnapshotInput) =>
    apiClient.post<SnapshotDetailResponse>("/api/snapshots", data),
  renameSnapshot: (id: string, data: RenameSnapshotInput) =>
    apiClient.patch<SnapshotDetailResponse>(`/api/snapshots/${id}`, data),
  deleteSnapshot: (id: string) => apiClient.delete<void>(`/api/snapshots/${id}`),
};
