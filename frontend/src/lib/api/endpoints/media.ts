import { isMockApiMode } from "../../env";
import { apiRequest, resolveBackendMediaUrl } from "../client";
import type {
  AudioPlaybackResponse,
  AudioUploadCompleteRequest,
  AudioUploadInitRequest,
  AudioUploadInitResponse,
  ImageUploadBinaryResponse,
  ImageUploadInitRequest,
  ImageUploadInitResponse,
} from "../types";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

function resolveImageMimeType(file: File): string {
  const rawType = (file.type || "").toLowerCase().trim();
  if (rawType === "image/jpg") return "image/jpeg";
  if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(rawType)) {
    return rawType;
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".gif")) return "image/gif";
  return rawType;
}

export const mediaApi = {
  initAudioUpload(payload: AudioUploadInitRequest): Promise<AudioUploadInitResponse> {
    if (isMockApiMode()) {
      return apiRequest<AudioUploadInitResponse, AudioUploadInitRequest>({
        method: "POST",
        path: "/media/audio/upload-init",
        body: payload,
      });
    }

    return apiRequest<AudioUploadInitResponse, Record<string, unknown>>({
      method: "POST",
      path: "/media/audio/upload-intent",
      body: {
        filename: payload.filename,
        mimeType: payload.mimeType,
        fileSize: payload.sizeBytes,
      },
    });
  },

  completeAudioUpload(payload: AudioUploadCompleteRequest): Promise<{ ok?: boolean }> {
    return apiRequest<{ ok?: boolean }, AudioUploadCompleteRequest>({
      method: "POST",
      path: "/media/audio/upload-complete",
      body: payload,
    });
  },

  getAudioPlayback(assetId: string): Promise<AudioPlaybackResponse> {
    return apiRequest<AudioPlaybackResponse>({
      method: "GET",
      path: `/media/audio/${encodeURIComponent(assetId)}/playback`,
    });
  },

  initImageUpload(payload: ImageUploadInitRequest): Promise<ImageUploadInitResponse> {
    return apiRequest<ImageUploadInitResponse, ImageUploadInitRequest>({
      method: "POST",
      path: "/media/images/upload-intent",
      body: payload,
    });
  },

  async uploadImage(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const mimeType = resolveImageMimeType(file);
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new Error("Chỉ hỗ trợ ảnh định dạng PNG, JPG, JPEG, WebP hoặc GIF.");
    }
    if (file.size <= 0) {
      throw new Error("Tệp hình ảnh trống hoặc không hợp lệ.");
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("Dung lượng hình ảnh vượt quá giới hạn tối đa 10MB.");
    }

    onProgress?.(5);
    const intent = await this.initImageUpload({
      filename: file.name || `diagram.${mimeType.split("/")[1] || "png"}`,
      mimeType,
      fileSize: file.size,
    });

    if (isMockApiMode()) {
      onProgress?.(100);
      return intent.streamUrl;
    }

    const uploadTarget = resolveBackendMediaUrl(intent.uploadUrl);
    const result = await new Promise<ImageUploadBinaryResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadTarget, true);
      xhr.setRequestHeader("Content-Type", mimeType);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          const pct = Math.min(98, Math.max(10, Math.round((evt.loaded / evt.total) * 100)));
          onProgress?.(pct);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText || "{}");
            const payload =
              parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed;
            resolve(payload as ImageUploadBinaryResponse);
          } catch {
            resolve({
              ok: true,
              assetId: intent.assetId,
              objectKey: intent.objectKey,
              sizeBytes: file.size,
              url: intent.streamUrl,
              streamUrl: intent.streamUrl,
            });
          }
        } else {
          reject(new Error(`Tải ảnh lên thất bại (HTTP ${xhr.status}).`));
        }
      };

      xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải hình ảnh lên máy chủ."));
      xhr.onabort = () => reject(new Error("Đã hủy tải hình ảnh."));
      xhr.send(file);
    });

    onProgress?.(100);
    return resolveBackendMediaUrl(result.streamUrl || result.url || intent.streamUrl);
  },
};

