import {
  addDaysToDateKey,
  getVnDailyWindowSync,
  getZonedDateParts,
} from "@/lib/time/vn-time";
import {
  PASS_SCORE_THRESHOLD,
  type Assignment,
  type AuthUser,
  type Course,
  type CourseStudent,
  type ExerciseAuthoringDetail,
  type ExercisePublic,
  type ExtensionRequestItem,
  type Lesson,
  type NotificationItem,
  type PenaltyRecord,
  type StudentAssignmentDetail,
  type StudentAssignmentSummary,
  type SubmissionHistoryItem,
  type SubmissionResult,
  type TranslationWorkspace,
} from "../types";
import {
  createInitialExamV2MockState,
  type ExamV2MockState,
} from "./exam-v2";

export interface MockStoreState {
  currentUserId: string;
  users: AuthUser[];
  courses: Course[];
  courseStudents: Record<string, CourseStudent[]>;
  lessons: Lesson[];
  exercises: ExerciseAuthoringDetail[];
  assignments: Assignment[];
  studentAssignments: StudentAssignmentSummary[];
  submissions: Record<string, SubmissionHistoryItem[]>;
  idempotencyCache: Record<string, SubmissionResult>;
  lastSubmittedAnswers: Record<string, Record<string, string>>;
  translations: Record<string, TranslationWorkspace>;
  extensions: ExtensionRequestItem[];
  penalties: PenaltyRecord[];
  notifications: NotificationItem[];
  examV2: ExamV2MockState;
}

export function stripAnswerKeysFromExercise(
  exercise: ExerciseAuthoringDetail,
): ExercisePublic {
  return {
    id: exercise.id,
    title: exercise.title,
    type: exercise.type,
    status: exercise.status,
    version: exercise.version,
    instructions: exercise.instructions,
    passageHtml: exercise.passageHtml,
    audioAssetId: exercise.audioAssetId,
    durationMinutes: exercise.durationMinutes,
    passThreshold: exercise.passThreshold,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
    questions: exercise.questions.map((q) => ({
      id: q.id,
      orderIndex: q.orderIndex,
      prompt: q.prompt,
      type: q.type,
      options: q.options,
      points: q.points,
    })),
  };
}

export function buildStudentAssignmentDetail(
  state: MockStoreState,
  summary: StudentAssignmentSummary,
): StudentAssignmentDetail | null {
  const assignment = state.assignments.find((a) => a.id === summary.assignmentId);
  if (!assignment) return null;
  const exercise = state.exercises.find((e) => e.id === assignment.exerciseId);
  if (!exercise) {
    const v2Test = assignment.examTestId
      ? state.examV2.tests.find((t) => t.id === assignment.examTestId)
      : undefined;
    if (!v2Test) return null;
    return {
      ...summary,
      exercise: {
        id: v2Test.id,
        title: v2Test.title,
        type: v2Test.skill === "LISTENING" ? "listening" : "reading",
        status: "published",
        version: v2Test.version,
        instructions: v2Test.instructions,
        durationMinutes: Math.max(1, Math.round(v2Test.totalDurationSeconds / 60)),
        passThreshold: PASS_SCORE_THRESHOLD,
        createdAt: v2Test.updatedAt,
        updatedAt: v2Test.updatedAt,
        questions: [],
      },
    };
  }

  return {
    ...summary,
    exercise: stripAnswerKeysFromExercise(exercise),
  };
}

function vnLocalDateTimeToIso(dateKey: string, hourDecimal: number): string {
  const startMs = Date.parse(getVnDailyWindowSync(dateKey).startUtcIso);
  return new Date(startMs + hourDecimal * 3_600_000).toISOString();
}

export function createInitialMockState(): MockStoreState {
  const todayKey = getZonedDateParts(new Date()).dateKey;
  const yesterdayKey = addDaysToDateKey(todayKey, -1);
  const twoDaysAgoKey = addDaysToDateKey(todayKey, -2);
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const inThreeDaysKey = addDaysToDateKey(todayKey, 3);

  const todayWindow = getVnDailyWindowSync(todayKey);
  const yesterdayWindow = getVnDailyWindowSync(yesterdayKey);
  const twoDaysAgoWindow = getVnDailyWindowSync(twoDaysAgoKey);
  const tomorrowWindow = getVnDailyWindowSync(tomorrowKey);

  const users: AuthUser[] = [
    {
      id: "stu-01",
      email: "student@ielts.vn",
      fullName: "Khổng Phú Cường",
      roles: ["student"],
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    },
    {
      id: "stu-02",
      email: "minhtran@ielts.vn",
      fullName: "Trần Đức Minh",
      roles: ["student"],
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    },
    {
      id: "stu-03",
      email: "ngocpham@ielts.vn",
      fullName: "Phạm Bảo Ngọc",
      roles: ["student"],
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    },
    {
      id: "tch-01",
      email: "teacher@ielts.vn",
      fullName: "Lê Mạnh Hùng",
      roles: ["teacher"],
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    },
    {
      id: "adm-01",
      email: "admin@ielts.vn",
      fullName: "Huỳnh Khôi",
      roles: ["admin", "teacher"],
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    },
  ];

  const courses: Course[] = [
    {
      id: "crs-01",
      code: "IELTS-FOUND-K12",
      title: "IELTS Academic 6.5 — Khóa K12",
      description: "Luyện tập Reading & Listening hằng ngày kết hợp dịch thuật học thuật.",
      courseType: "group",
      startBand: 5.0,
      targetBand: 6.5,
      enrollmentStatus: "active",
      teacherId: "tch-01",
      teacherName: "Lê Mạnh Hùng",
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
      studentCount: 2,
      startDate: "2026-10-01",
      endDate: "2027-01-15",
    },
    {
      id: "crs-02",
      code: "IELTS-1ON1-75",
      title: "Coaching 1:1 Reading & Listening — Band 7.5",
      description: "Kèm 1:1 chuyên sâu chiến lược xử lý đề khó Cambridge & học thuật.",
      courseType: "1:1",
      startBand: 6.0,
      targetBand: 7.5,
      enrollmentStatus: "active",
      teacherId: "adm-01",
      teacherName: "Huỳnh Khôi",
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
      studentCount: 1,
      startDate: "2026-10-15",
      endDate: "2027-02-01",
    },
  ];

  const courseStudents: Record<string, CourseStudent[]> = {
    "crs-01": [
      {
        studentId: "stu-01",
        fullName: "Khổng Phú Cường",
        email: "student@ielts.vn",
        enrolledAt: "2026-10-01T08:00:00.000Z",
        status: "active",
      },
      {
        studentId: "stu-02",
        fullName: "Trần Đức Minh",
        email: "minhtran@ielts.vn",
        enrolledAt: "2026-10-02T08:00:00.000Z",
        status: "active",
      },
    ],
    "crs-02": [
      {
        studentId: "stu-01",
        fullName: "Khổng Phú Cường",
        email: "student@ielts.vn",
        enrolledAt: "2026-10-15T08:00:00.000Z",
        status: "active",
      },
    ],
  };

  const lessons: Lesson[] = [
    {
      id: "les-01",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      teacherName: "Lê Mạnh Hùng",
      title: "Chiến lược True / False / Not Given nâng cao",
      description: "Phân tích bẫy paraphrase thường gặp trong Cambridge Reading.",
      type: "live_meet",
      status: "scheduled",
      startTime: vnLocalDateTimeToIso(todayKey, 19.5),
      endTime: vnLocalDateTimeToIso(todayKey, 21.0),
      timezone: "Asia/Ho_Chi_Minh",
      meetUrl: "https://meet.google.com/abc-defg-hij",
    },
    {
      id: "les-02",
      courseId: "crs-02",
      courseTitle: "Coaching 1:1 Reading & Listening — Band 7.5",
      teacherName: "Huỳnh Khôi",
      title: "Chữa chi tiết Listening Section 3 & 4 (Coaching 1:1)",
      description: "Luyện bắt từ khóa đồng nghĩa trong bài giảng học thuật.",
      type: "review",
      status: "scheduled",
      startTime: vnLocalDateTimeToIso(tomorrowKey, 20.0),
      endTime: vnLocalDateTimeToIso(tomorrowKey, 21.0),
      timezone: "Asia/Ho_Chi_Minh",
      meetUrl: "https://meet.google.com/xyz-uvwx-rst",
    },
    {
      id: "les-03",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      title: "Workshop Kỹ thuật Scanning & Matching Headings",
      description: "Thực hành nhóm trực tuyến qua Google Meet.",
      type: "workshop",
      status: "scheduled",
      startTime: vnLocalDateTimeToIso(inThreeDaysKey, 19.0),
      endTime: vnLocalDateTimeToIso(inThreeDaysKey, 20.5),
      timezone: "Asia/Ho_Chi_Minh",
      meetUrl: "https://meet.google.com/klm-nopq-stu",
    },
    {
      id: "les-04",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      title: "Tổng ôn Reading Passage 1 tuần trước",
      description: "Đã hoàn tất tổng kết và gửi tài liệu ghi chú.",
      type: "live_meet",
      status: "completed",
      startTime: vnLocalDateTimeToIso(twoDaysAgoKey, 19.5),
      endTime: vnLocalDateTimeToIso(twoDaysAgoKey, 21.0),
      timezone: "Asia/Ho_Chi_Minh",
      meetUrl: "https://meet.google.com/old-meet-001",
    },
  ];

  const exercises: ExerciseAuthoringDetail[] = [
    {
      id: "ex-read-01",
      title: "Urban Microclimates & Green Roofs",
      type: "reading",
      status: "published",
      version: 1,
      instructions: "Đọc kỹ đoạn văn và trả lời các câu hỏi bên dưới. Cần đạt tối thiểu 70% để mở khóa đáp án và bài dịch.",
      passageHtml:
        "<p><strong>Green roofs</strong> are engineered vegetative layers installed on urban buildings to reduce stormwater runoff and mitigate the urban heat island effect.</p><p>Field studies conducted across humid subtropical cities demonstrated that multi-layered sedum substrates lowered roof surface temperatures by up to 14°C compared with conventional bitumen membranes.</p>",
      durationMinutes: 20,
      passThreshold: PASS_SCORE_THRESHOLD,
      questions: [
        {
          id: "q-r1-1",
          orderIndex: 1,
          prompt: "Green roofs help lessen the urban heat island phenomenon.",
          type: "tfng",
          options: [
            { id: "TRUE", label: "TRUE", text: "TRUE" },
            { id: "FALSE", label: "FALSE", text: "FALSE" },
            { id: "NOT GIVEN", label: "NOT GIVEN", text: "NOT GIVEN" },
          ],
          points: 1,
          correctAnswer: "TRUE",
          explanation: "Đoạn 1 nêu rõ green roofs giúp giảm hiệu ứng đảo nhiệt đô thị (mitigate the urban heat island effect).",
        },
        {
          id: "q-r1-2",
          orderIndex: 2,
          prompt: "Conventional bitumen roofs stayed cooler than sedum substrates.",
          type: "tfng",
          options: [
            { id: "TRUE", label: "TRUE", text: "TRUE" },
            { id: "FALSE", label: "FALSE", text: "FALSE" },
            { id: "NOT GIVEN", label: "NOT GIVEN", text: "NOT GIVEN" },
          ],
          points: 1,
          correctAnswer: "FALSE",
          explanation: "Đoạn 2 khẳng định sedum substrates giảm nhiệt độ bề mặt mái tới 14°C so với mái bitumen thông thường.",
        },
      ],
    },
    {
      id: "ex-list-01",
      title: "University Library Orientation (Section 1)",
      type: "listening",
      status: "published",
      version: 1,
      instructions: "Nghe đoạn hội thoại và chọn đáp án chính xác nhất.",
      audioAssetId: "audio-demo-01",
      durationMinutes: 15,
      passThreshold: PASS_SCORE_THRESHOLD,
      questions: [
        {
          id: "q-l1-1",
          orderIndex: 1,
          prompt: "Where should new students collect their library access cards?",
          type: "mcq",
          options: [
            { id: "A", label: "A", text: "Ground Floor Reception" },
            { id: "B", label: "B", text: "Rare Books Room" },
            { id: "C", label: "C", text: "Digital Media Lab" },
          ],
          points: 1,
          correctAnswer: "A",
          explanation: "Thủ thư hướng dẫn sinh viên mới nhận thẻ tại quầy lễ tân tầng trệt.",
        },
      ],
    },
  ];

  const assignments: Assignment[] = [
    {
      id: "asg-01",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      exerciseId: "ex-read-01",
      exerciseTitle: "Urban Microclimates & Green Roofs",
      exerciseType: "reading",
      title: "Reading Hôm nay — Urban Microclimates",
      assignedDate: todayWindow.dateKey,
      openAt: todayWindow.startUtcIso,
      dueAt: todayWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "active",
      passThreshold: PASS_SCORE_THRESHOLD,
    },
    {
      id: "asg-02",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      exerciseId: "ex-list-01",
      exerciseTitle: "University Library Orientation (Section 1)",
      exerciseType: "listening",
      title: "Listening Tuần 1 — Library Orientation",
      assignedDate: twoDaysAgoKey,
      openAt: twoDaysAgoWindow.startUtcIso,
      dueAt: twoDaysAgoWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "active",
      passThreshold: PASS_SCORE_THRESHOLD,
    },
    {
      id: "asg-03",
      courseId: "crs-02",
      courseTitle: "Coaching 1:1 Reading & Listening — Band 7.5",
      exerciseId: "ex-read-01",
      exerciseTitle: "Urban Microclimates & Green Roofs",
      exerciseType: "reading",
      title: "Reading Luyện lại — Heat Island Mitigation",
      assignedDate: todayWindow.dateKey,
      openAt: todayWindow.startUtcIso,
      dueAt: todayWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "active",
      passThreshold: PASS_SCORE_THRESHOLD,
    },
    {
      id: "asg-04",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      exerciseId: "ex-list-01",
      exerciseTitle: "University Library Orientation (Section 1)",
      exerciseType: "listening",
      title: "Listening Hôm qua — Academic Campus Tour",
      assignedDate: yesterdayKey,
      openAt: yesterdayWindow.startUtcIso,
      dueAt: yesterdayWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "active",
      passThreshold: PASS_SCORE_THRESHOLD,
    },
    {
      id: "asg-05",
      courseId: "crs-02",
      courseTitle: "Coaching 1:1 Reading & Listening — Band 7.5",
      exerciseId: "ex-read-01",
      exerciseTitle: "Urban Microclimates & Green Roofs",
      exerciseType: "reading",
      title: "Reading Ngày mai — Geothermal Architecture",
      assignedDate: tomorrowKey,
      openAt: tomorrowWindow.startUtcIso,
      dueAt: tomorrowWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "scheduled",
      passThreshold: PASS_SCORE_THRESHOLD,
    },
  ];

  const studentAssignments: StudentAssignmentSummary[] = [
    {
      studentAssignmentId: "sa-01",
      assignmentId: "asg-01",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      studentId: "stu-01",
      studentName: "Khổng Phú Cường",
      title: "Reading Hôm nay — Urban Microclimates",
      exerciseType: "reading",
      assignedDate: todayWindow.dateKey,
      openAt: todayWindow.startUtcIso,
      dueAt: todayWindow.endExclusiveUtcIso,
      effectiveDueAt: todayWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "not_started",
      attemptsCount: 0,
      bestScore: null,
      passed: false,
      answerReviewUnlocked: false,
      translationAvailable: false,
      translationStatus: "not_started",
      penaltyApplied: false,
    },
    {
      studentAssignmentId: "sa-02",
      assignmentId: "asg-02",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      studentId: "stu-01",
      studentName: "Khổng Phú Cường",
      title: "Listening Tuần 1 — Library Orientation",
      exerciseType: "listening",
      assignedDate: twoDaysAgoKey,
      openAt: twoDaysAgoWindow.startUtcIso,
      dueAt: twoDaysAgoWindow.endExclusiveUtcIso,
      effectiveDueAt: twoDaysAgoWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "passed",
      attemptsCount: 1,
      bestScore: 100,
      passed: true,
      answerReviewUnlocked: true,
      translationAvailable: false,
      translationStatus: "not_started",
      penaltyApplied: false,
    },
    {
      studentAssignmentId: "sa-03",
      assignmentId: "asg-03",
      courseId: "crs-02",
      courseTitle: "Coaching 1:1 Reading & Listening — Band 7.5",
      studentId: "stu-01",
      studentName: "Khổng Phú Cường",
      title: "Reading Luyện lại — Heat Island Mitigation",
      exerciseType: "reading",
      assignedDate: todayWindow.dateKey,
      openAt: todayWindow.startUtcIso,
      dueAt: todayWindow.endExclusiveUtcIso,
      effectiveDueAt: todayWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "submitted",
      attemptsCount: 1,
      bestScore: 50,
      passed: false,
      answerReviewUnlocked: false,
      translationAvailable: false,
      translationStatus: "not_started",
      penaltyApplied: false,
    },
    {
      studentAssignmentId: "sa-04",
      assignmentId: "asg-04",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      studentId: "stu-01",
      studentName: "Khổng Phú Cường",
      title: "Listening Hôm qua — Academic Campus Tour",
      exerciseType: "listening",
      assignedDate: yesterdayKey,
      openAt: yesterdayWindow.startUtcIso,
      dueAt: yesterdayWindow.endExclusiveUtcIso,
      effectiveDueAt: yesterdayWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "overdue",
      attemptsCount: 0,
      bestScore: null,
      passed: false,
      answerReviewUnlocked: false,
      translationAvailable: false,
      translationStatus: "not_started",
      penaltyApplied: true,
    },
    {
      studentAssignmentId: "sa-05",
      assignmentId: "asg-05",
      courseId: "crs-02",
      courseTitle: "Coaching 1:1 Reading & Listening — Band 7.5",
      studentId: "stu-01",
      studentName: "Khổng Phú Cường",
      title: "Reading Ngày mai — Geothermal Architecture",
      exerciseType: "reading",
      assignedDate: tomorrowKey,
      openAt: tomorrowWindow.startUtcIso,
      dueAt: tomorrowWindow.endExclusiveUtcIso,
      effectiveDueAt: tomorrowWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "not_started",
      attemptsCount: 0,
      bestScore: null,
      passed: false,
      answerReviewUnlocked: false,
      translationAvailable: false,
      translationStatus: "not_started",
      penaltyApplied: false,
    },
    {
      studentAssignmentId: "sa-06",
      assignmentId: "asg-01",
      courseId: "crs-01",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      studentId: "stu-02",
      studentName: "Trần Đức Minh",
      title: "Reading Hôm nay — Urban Microclimates",
      exerciseType: "reading",
      assignedDate: todayWindow.dateKey,
      openAt: todayWindow.startUtcIso,
      dueAt: todayWindow.endExclusiveUtcIso,
      effectiveDueAt: todayWindow.endExclusiveUtcIso,
      timezone: "Asia/Ho_Chi_Minh",
      status: "passed",
      attemptsCount: 1,
      bestScore: 100,
      passed: true,
      answerReviewUnlocked: true,
      translationAvailable: true,
      translationStatus: "submitted",
      penaltyApplied: false,
    },
  ];

  const translations: Record<string, TranslationWorkspace> = {
    "sa-01": {
      translationId: "tr-01",
      studentAssignmentId: "sa-01",
      passageTitle: "Urban Microclimates & Green Roofs",
      passageHtml: exercises[0]!.passageHtml!,
      draftText: "",
      status: "not_started",
    },
    "sa-06": {
      translationId: "tr-06",
      studentAssignmentId: "sa-06",
      passageTitle: "Urban Microclimates & Green Roofs",
      passageHtml: exercises[0]!.passageHtml!,
      draftText:
        "Các thành phố trên khắp châu Á và châu Âu đang áp dụng mái nhà xanh để giảm hiệu ứng đảo nhiệt đô thị. Thực vật hấp thụ bức xạ mặt trời thông qua quá trình thoát hơi nước, giúp hạ nhiệt bề mặt mái tới 30 độ C vào cao điểm mùa hè.",
      status: "submitted",
      submittedAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
  };

  const extensions: ExtensionRequestItem[] = [
    {
      id: "ext-01",
      studentAssignmentId: "sa-01",
      assignmentTitle: "Reading Ngày 12/11 — Urban Microclimates",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      studentId: "stu-01",
      studentName: "Khổng Phú Cường",
      reason: "Em bị ốm sốt và cần thêm 24 giờ để hoàn thành bài Reading và bản dịch.",
      currentDueAt: todayWindow.endExclusiveUtcIso,
      requestedDueAt: getVnDailyWindowSync("2026-11-13").endExclusiveUtcIso,
      status: "pending",
      createdAt: "2026-11-12T04:00:00.000Z",
    },
  ];

  const penalties: PenaltyRecord[] = [
    {
      id: "pen-01",
      studentId: "stu-01",
      studentName: "Khổng Phú Cường",
      studentAssignmentId: "sa-old-01",
      assignmentTitle: "Reading Ngày 04/11 — Coastal Wetlands",
      courseTitle: "IELTS Academic 6.5 — Khóa K12",
      points: 1,
      reason: "Nộp quá hạn khung giờ 23:59 ngày 04/11/2026.",
      occurredAt: "2026-11-04T17:01:00.000Z",
      reversed: false,
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: "notif-01",
      type: "assignment_new",
      title: "Bài tập mới hôm nay",
      message: "Bạn có bài Reading Hôm nay — Urban Microclimates cần hoàn thành trước 23:59.",
      read: false,
      targetUrl: "/student/assignments/sa-01",
      createdAt: vnLocalDateTimeToIso(todayKey, 0.1),
    },
    {
      id: "notif-02",
      type: "overdue",
      title: "Cảnh báo quá hạn (+1 điểm phạt)",
      message: "Bài Listening Hôm qua — Academic Campus Tour đã quá hạn nộp và được ghi nhận +1 điểm phạt.",
      read: false,
      targetUrl: "/student/penalties",
      createdAt: vnLocalDateTimeToIso(todayKey, 0.2),
    },
    {
      id: "notif-03",
      type: "extension_decided",
      title: "Cập nhật yêu cầu gia hạn",
      message: "Yêu cầu gia hạn trước đó đã được giảng viên ghi nhận trong hệ thống.",
      read: true,
      targetUrl: "/student/extensions",
      createdAt: vnLocalDateTimeToIso(yesterdayKey, 15.0),
    },
    {
      id: "notif-04",
      type: "course_added",
      title: "Bạn được thêm vào lớp Coaching 1:1",
      message: "Khóa học Coaching 1:1 Reading & Listening — Band 7.5 đã được kích hoạt.",
      read: true,
      targetUrl: "/student/courses",
      createdAt: vnLocalDateTimeToIso(twoDaysAgoKey, 9.0),
    },
  ];

  return {
    currentUserId: "stu-01",
    users,
    courses,
    courseStudents,
    lessons,
    exercises,
    assignments,
    studentAssignments,
    submissions: {
      "sa-02": [
        {
          submissionId: "sub-02-1",
          attemptNo: 1,
          score: 100,
          passed: true,
          submittedAt: vnLocalDateTimeToIso(twoDaysAgoKey, 21.0),
        },
      ],
      "sa-03": [
        {
          submissionId: "sub-03-1",
          attemptNo: 1,
          score: 50,
          passed: false,
          submittedAt: vnLocalDateTimeToIso(todayKey, 8.5),
        },
      ],
    },
    idempotencyCache: {},
    lastSubmittedAnswers: {
      "sa-02": { "q-l1-1": "A" },
    },
    translations,
    extensions,
    penalties,
    notifications,
    examV2: createInitialExamV2MockState(),
  };
}

