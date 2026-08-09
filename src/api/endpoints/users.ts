// Users directory — real user lookup for the connection flow.
import type { ApiResponse } from "@/types";
import type { DirectoryEntry } from "@/mock/directory";
import { apiClient } from "@/api/client";

export const usersApi = {
  /**
   * GET /users/directory — discoverable users (public-safe fields).
   * Pass a `publicId` to look up a single user by their public ID (the connect-by-ID
   * flow); without it the server returns only users the caller is already related to
   * (privacy: no full directory of names to any account).
   */
  async getDirectory(publicId?: string): Promise<DirectoryEntry[]> {
    const query = publicId ? `?publicId=${encodeURIComponent(publicId)}` : "";
    const res = await apiClient.get<ApiResponse<DirectoryEntry[]>>(`/users/directory${query}`);
    return res.data;
  },
};
