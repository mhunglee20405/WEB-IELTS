import { isMockApiMode } from "../../env";
import { apiRequest } from "../client";
import type {
  AudioPlaybackResponse,
  AudioUploadCompleteRequest,
  AudioUploadInitRequest,
  AudioUploadInitResponse,
} from "../types";

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
    if (isMockApiMode()) {
      return apiRequest<{ ok?: boolean }, AudioUploadCompleteRequest>({
        method: "POST",
        path: "/media/audio/upload-complete",
        body: payload,
      });
    }

    // Backend handles asset existence directly via S3/signed URL without explicit complete endpoint
    return Promise.resolve({ ok: true });
  },

  getAudioPlayback(assetId: string): Promise<AudioPlaybackResponse> {
    return apiRequest<AudioPlaybackResponse>({
      method: "GET",
      path: `/media/audio/${encodeURIComponent(assetId)}/playback`,
    });
  },
};

