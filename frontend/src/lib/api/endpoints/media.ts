import { apiRequest } from "../client";
import type {
  AudioPlaybackResponse,
  AudioUploadCompleteRequest,
  AudioUploadInitRequest,
  AudioUploadInitResponse,
} from "../types";

export const mediaApi = {
  initAudioUpload(payload: AudioUploadInitRequest): Promise<AudioUploadInitResponse> {
    return apiRequest<AudioUploadInitResponse, AudioUploadInitRequest>({
      method: "POST",
      path: "/media/audio/upload-init",
      body: payload,
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
};

