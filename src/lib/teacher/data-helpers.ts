import {
  assignmentsApi,
  coursesApi,
  mediaApi,
  penaltiesApi,
  studentAssignmentsApi,
  usersApi,
} from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/error";
import type {
  Assignment,
  Course,
  CourseStudent,
  PenaltyRecord,
  StudentAssignmentSummary,
  TranslationWorkspace,
} from "@/lib/api/types";
import { isMockApiMode } from "@/lib/env";

export interface TeacherStudentEntry extends CourseStudent {
  courses: Array<{
    id: string;
    code: string;
    title: string;
    courseType?: "1:1" | "group";
  }>;
}

export interface TranslationQueueItem {
  summary: StudentAssignmentSummary;
  workspace: TranslationWorkspace;
}

export async function fetchAllCourses(): Promise<Course[]> {
  const res = await coursesApi.list({ limit: 100 });
  return res.items;
}

export async function fetchTeacherStudentDirectory(
  coursesInput?: Course[],
): Promise<TeacherStudentEntry[]> {
  const courses = coursesInput ?? (await fetchAllCourses());
  if (courses.length === 0) {
    return [];
  }

  const rosters = await Promise.all(
    courses.map(async (course) => {
      try {
        const res = await coursesApi.listStudents(course.id, { limit: 100 });
        return { course, students: res.items };
      } catch {
        return { course, students: [] as CourseStudent[] };
      }
    }),
  );

  const map = new Map<string, TeacherStudentEntry>();
  for (const { course, students } of rosters) {
    for (const student of students) {
      const existing = map.get(student.studentId);
      const courseMeta = {
        id: course.id,
        code: course.code,
        title: course.title,
        courseType: course.courseType,
      };
      if (existing) {
        if (!existing.courses.some((c) => c.id === course.id)) {
          existing.courses.push(courseMeta);
        }
      } else {
        map.set(student.studentId, {
          ...student,
          courses: [courseMeta],
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "vi"),
  );
}

export async function fetchAllTeacherAssignments(
  coursesInput?: Course[],
): Promise<Assignment[]> {
  const courses = coursesInput ?? (await fetchAllCourses());
  if (courses.length === 0) {
    return [];
  }

  const lists = await Promise.all(
    courses.map(async (course) => {
      try {
        const res = await assignmentsApi.listByCourse(course.id, { limit: 100 });
        return res.items;
      } catch {
        return [] as Assignment[];
      }
    }),
  );

  const unique = new Map<string, Assignment>();
  for (const list of lists) {
    for (const item of list) {
      unique.set(item.id, item);
    }
  }

  return Array.from(unique.values()).sort((a, b) =>
    b.assignedDate.localeCompare(a.assignedDate),
  );
}

export async function fetchTeacherTranslationQueue(): Promise<TranslationQueueItem[]> {
  const assignments = await fetchAllTeacherAssignments();
  const readingAssignments = assignments.filter(
    (item) => item.exerciseType === "reading" || !item.exerciseType,
  );
  if (readingAssignments.length === 0) {
    return [];
  }

  const studentRowsByAssignment = await Promise.all(
    readingAssignments.map(async (assignment) => {
      try {
        const res = await assignmentsApi.listStudents(assignment.id, { limit: 100 });
        return res.items;
      } catch {
        return [] as StudentAssignmentSummary[];
      }
    }),
  );

  const candidates = studentRowsByAssignment
    .flat()
    .filter(
      (sa) =>
        sa.exerciseType === "reading" &&
        (sa.translationAvailable || sa.translationStatus !== "not_started"),
    );

  const hydrated = await Promise.all(
    candidates.map(async (summary) => {
      try {
        const workspace = await studentAssignmentsApi.getTranslation(
          summary.studentAssignmentId,
        );
        return { summary, workspace };
      } catch {
        return null;
      }
    }),
  );

  const priorityOrder: Record<TranslationWorkspace["status"], number> = {
    submitted: 0,
    needs_revision: 1,
    draft: 2,
    approved: 3,
    not_started: 4,
  };

  return hydrated
    .filter((entry): entry is TranslationQueueItem => entry !== null)
    .sort((a, b) => priorityOrder[a.workspace.status] - priorityOrder[b.workspace.status]);
}

export async function fetchAllPenaltiesForAudit(): Promise<PenaltyRecord[]> {
  const studentIds = new Set<string>();

  try {
    const usersRes = await usersApi.list({ role: "student", limit: 100 });
    for (const u of usersRes.items) {
      studentIds.add(u.id);
    }
  } catch {
    const directory = await fetchTeacherStudentDirectory();
    for (const st of directory) {
      studentIds.add(st.studentId);
    }
  }

  const summaries = await Promise.all(
    Array.from(studentIds).map(async (studentId) => {
      try {
        return await penaltiesApi.getByStudent(studentId);
      } catch {
        return null;
      }
    }),
  );

  const records = new Map<string, PenaltyRecord>();
  for (const summary of summaries) {
    if (!summary) continue;
    for (const rec of summary.records) {
      records.set(rec.id, rec);
    }
  }

  return Array.from(records.values()).sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
]);

export const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export function validateAudioFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const validExt = ["mp3", "wav", "m4a", "aac", "ogg", "webm"].includes(ext);
  const validMime = file.type ? ALLOWED_AUDIO_MIME_TYPES.has(file.type.toLowerCase()) : false;

  if (!validMime && !validExt) {
    return "Định dạng âm thanh chưa được hỗ trợ. Vui lòng dùng tệp MP3, WAV, M4A, OGG hoặc AAC.";
  }
  if (file.size <= 0) {
    return "Tệp âm thanh trống. Vui lòng chọn tệp hợp lệ.";
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    return "Dung lượng tệp vượt quá giới hạn tối đa 100 MB.";
  }
  return null;
}

function uploadFileWithXhr(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    if (file.type) {
      xhr.setRequestHeader("Content-Type", file.type);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(95, Math.round((event.loaded / event.total) * 95)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new ApiError({
            statusCode: xhr.status || 500,
            code: "AUDIO_UPLOAD_FAILED",
            message: "Tải tệp âm thanh lên kho lưu trữ thất bại.",
          }),
        );
      }
    };
    xhr.onerror = () => {
      reject(
        new ApiError({
          statusCode: 0,
          code: "AUDIO_UPLOAD_FAILED",
          message: "Mất kết nối trong khi tải tệp âm thanh.",
        }),
      );
    };
    xhr.send(file);
  });
}

export async function uploadPrivateListeningAudio(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ assetId: string }> {
  const mimeType = file.type || "audio/mpeg";
  onProgress(10);

  const init = await mediaApi.initAudioUpload({
    filename: file.name,
    mimeType,
    sizeBytes: file.size,
  });
  onProgress(35);

  if (isMockApiMode() || init.uploadUrl.startsWith("https://mock-upload.local/")) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    onProgress(85);
  } else {
    await uploadFileWithXhr(init.uploadUrl, file, onProgress);
  }

  await mediaApi.completeAudioUpload({
    assetId: init.assetId,
  });
  onProgress(100);
  return { assetId: init.assetId };
}

