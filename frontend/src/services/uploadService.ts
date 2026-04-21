import { apiClient } from "./apiClient";
import type { UploadResult } from "@/src/types/platform";

export const uploadService = {
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.postForm<UploadResult>("/upload", formData);
  },
};
