export const studentKeys = {
  dashboard: ["student", "dashboard"] as const,
  lessons: (from: string, to: string) => ["student", "lessons", from, to] as const,
  courses: (status?: string, page = 1) =>
    ["student", "courses", status ?? "all", page] as const,
  assignments: (status?: string, assignedDate?: string, page = 1) =>
    ["student", "assignments", status ?? "all", assignedDate ?? "all", page] as const,
  notificationsRoot: ["student", "notifications"] as const,
  notificationsUnreadCount: ["student", "notifications", "unread-count"] as const,
  notificationsList: (readFilter: "all" | "unread" | "read", page = 1) =>
    ["student", "notifications", "list", readFilter, page] as const,
  profile: ["student", "profile"] as const,
  assignmentDetail: (studentAssignmentId: string) =>
    ["student", "assignment-detail", studentAssignmentId] as const,
  assignmentSubmissions: (studentAssignmentId: string) =>
    ["student", "assignment-submissions", studentAssignmentId] as const,
  assignmentReview: (studentAssignmentId: string) =>
    ["student", "assignment-review", studentAssignmentId] as const,
  assignmentTranslation: (studentAssignmentId: string) =>
    ["student", "assignment-translation", studentAssignmentId] as const,
  audioPlayback: (assetId: string) => ["student", "audio-playback", assetId] as const,
  extensionsMine: (page = 1) => ["student", "extensions", page] as const,
  penaltiesMine: ["student", "penalties"] as const,
};

export const teacherKeys = {
  dashboard: ["teacher", "dashboard"] as const,
  lessons: (from: string, to: string, courseId?: string) =>
    ["teacher", "lessons", from, to, courseId ?? "all"] as const,
  coursesRoot: ["teacher", "courses"] as const,
  courses: (status?: string, search?: string, page = 1) =>
    ["teacher", "courses", status ?? "all", search ?? "", page] as const,
  courseDetail: (id: string) => ["teacher", "course", id] as const,
  courseStudents: (courseId: string, page = 1) =>
    ["teacher", "course", courseId, "students", page] as const,
  studentsDirectory: ["teacher", "students-directory"] as const,
  studentDetail: (studentId: string) => ["teacher", "student", studentId] as const,
  exercisesRoot: ["teacher", "exercises"] as const,
  exercises: (type?: string, status?: string, search?: string, page = 1) =>
    ["teacher", "exercises", type ?? "all", status ?? "all", search ?? "", page] as const,
  exerciseDetail: (id: string) => ["teacher", "exercise", id] as const,
  assignmentsRoot: ["teacher", "assignments"] as const,
  assignmentsByCourse: (courseId: string) =>
    ["teacher", "assignments", "course", courseId] as const,
  assignmentResults: (assignmentId: string, page = 1) =>
    ["teacher", "assignment", assignmentId, "students", page] as const,
  extensionsPending: (page = 1) => ["teacher", "extensions", "pending", page] as const,
  translationsQueue: ["teacher", "translations", "queue"] as const,
  translationWorkspace: (studentAssignmentId: string) =>
    ["teacher", "translation", studentAssignmentId] as const,
};

export const adminKeys = {
  usersRoot: ["admin", "users"] as const,
  users: (role?: string, status?: string, search?: string, page = 1) =>
    ["admin", "users", role ?? "all", status ?? "all", search ?? "", page] as const,
  coursesRoot: ["admin", "courses"] as const,
  courses: (status?: string, search?: string, page = 1) =>
    ["admin", "courses", status ?? "all", search ?? "", page] as const,
  auditPenalties: ["admin", "audit", "penalties"] as const,
  health: ["admin", "health"] as const,
};

export const examKeys = {
  catalog: (skill?: string, mode?: string, search?: string, difficulty?: string) =>
    ["exam", "catalog", skill ?? "ALL", mode ?? "ALL", search ?? "", difficulty ?? "ALL"] as const,
  testDetail: (testId: string) => ["exam", "test", testId] as const,
  testPartDetail: (testId: string, partId: string) =>
    ["exam", "test", testId, "part", partId] as const,
  attemptsRoot: ["exam", "attempts"] as const,
  attemptList: (testId?: string, status?: string) =>
    ["exam", "attempts", "list", testId ?? "all", status ?? "all"] as const,
  attemptDetail: (attemptId: string) => ["exam", "attempt", attemptId] as const,
  attemptResult: (attemptId: string) => ["exam", "attempt", attemptId, "result"] as const,
  attemptReview: (attemptId: string) => ["exam", "attempt", attemptId, "review"] as const,
  translationEligibility: (testId: string) =>
    ["exam", "translation-eligibility", testId] as const,
  translationPassage: (passageId: string) =>
    ["exam", "translation-passage", passageId] as const,
  teacherBankRoot: ["teacher", "exam-tests"] as const,
  teacherBankList: (skill?: string, status?: string, search?: string) =>
    ["teacher", "exam-tests", skill ?? "ALL", status ?? "ALL", search ?? ""] as const,
  teacherTestDetail: (testId: string) => ["teacher", "exam-test", testId] as const,
  teacherTestPreview: (testId: string) => ["teacher", "exam-test", testId, "preview"] as const,
  teacherTranslationsRoot: ["teacher", "reading-translations"] as const,
  teacherTranslationsList: (status?: string, testId?: string) =>
    ["teacher", "reading-translations", status ?? "ALL", testId ?? "ALL"] as const,
};

