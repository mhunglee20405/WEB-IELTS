import { ApiError } from "../error";
import {
  PASS_SCORE_THRESHOLD,
  type CreateTeacherExamTestRequest,
  type ExamAnswerValue,
  type ExamAttemptDetail,
  type ExamAttemptStatus,
  type ExamAttemptSummaryItem,
  type ExamMode,
  type ExamPartAuthoring,
  type ExamPartPublic,
  type ExamQuestionAuthoring,
  type ExamQuestionGroupAuthoring,
  type ExamQuestionGroupPublic,
  type ExamQuestionPublic,
  type ExamQuestionReviewItem,
  type ExamResultResponse,
  type ExamSkill,
  type ExamTestDetailAuthoring,
  type ExamTestDetailStudent,
  type ExamTestSummary,
  type PaginatedResponse,
  type ReadingTranslationDetail,
  type ReadingTranslationEligibilityResponse,
  type ReadingTranslationPassageEligibility,
  type ReviewReadingTranslationRequest,
  type SaveExamAnswersRequest,
  type SaveExamAnswersResponse,
  type SaveReadingTranslationDraftRequest,
  type StartExamAttemptRequest,
  type SubmitExamAttemptRequest,
  type SubmitReadingTranslationRequest,
  type TeacherReadingTranslationItem,
  type UpdateTeacherExamTestRequest,
  type UpsertExamPartInput,
  type UpsertExamQuestionGroupInput,
  type ValidateExamTestIssue,
  type ValidateExamTestResponse,
} from "../types";

export interface StoredMockExamAttempt {
  attemptId: string;
  studentId: string;
  testId: string;
  testTitle: string;
  skill: ExamSkill;
  mode: ExamMode;
  status: ExamAttemptStatus;
  partId: string | null;
  studentAssignmentId: string | null;
  revision: number;
  startedAt: string;
  expiresAt: string;
  durationSeconds: number;
  partsAuthoring: ExamPartAuthoring[];
  answers: Record<string, ExamAnswerValue>;
  flaggedQuestionIds: string[];
  submittedAt: string | null;
  result?: ExamResultResponse;
  reviewItems?: ExamQuestionReviewItem[];
  submitIdempotencyKeys: Record<string, ExamResultResponse>;
}

export interface StoredMockPassageTranslation {
  translationId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  testId: string;
  testTitle: string;
  passageId: string;
  partNumber: number;
  passageTitle: string;
  passageHtml: string;
  paragraphs?: ExamPartAuthoring["paragraphs"];
  status: "DRAFT" | "SUBMITTED" | "REVIEWED";
  revision: number;
  textVi: string;
  teacherFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
  unlockedByAttemptId: string | null;
  studentAssignmentId: string | null;
  assignmentTitle: string | null;
  courseTitle: string | null;
}

export interface ExamV2MockState {
  tests: ExamTestDetailAuthoring[];
  attempts: Record<string, StoredMockExamAttempt>;
  unlockedPassagesByStudent: Record<string, Record<string, string>>;
  passageTranslations: Record<string, StoredMockPassageTranslation>;
}

export function stripQuestionForStudent(q: ExamQuestionAuthoring): ExamQuestionPublic {
  return {
    id: q.id,
    groupId: q.groupId,
    questionNumber: q.questionNumber,
    prompt: q.prompt,
    questionType: q.questionType,
    options: q.options,
    maxSelections: q.maxSelections,
    maxWords: q.maxWords,
    blankLabel: q.blankLabel,
    assetUrl: q.assetUrl,
    note: q.note,
  };
}

export function stripGroupForStudent(
  group: ExamQuestionGroupAuthoring,
): ExamQuestionGroupPublic {
  return {
    id: group.id,
    partId: group.partId,
    groupNumber: group.groupNumber,
    title: group.title,
    instructionHtml: group.instructionHtml,
    questionType: group.questionType,
    questionNumberStart: group.questionNumberStart,
    questionNumberEnd: group.questionNumberEnd,
    sharedOptions: group.sharedOptions,
    summaryTemplateHtml: group.summaryTemplateHtml,
    diagramImageUrl: group.diagramImageUrl,
    maxWords: group.maxWords,
    maxSelections: group.maxSelections,
    questions: group.questions.map(stripQuestionForStudent),
  };
}

export function stripPartForStudent(part: ExamPartAuthoring): ExamPartPublic {
  return {
    id: part.id,
    partNumber: part.partNumber,
    partType: part.partType,
    title: part.title,
    instructions: part.instructions,
    passageTitle: part.passageTitle,
    passageHtml: part.passageHtml,
    paragraphs: part.paragraphs,
    audioAsset: part.audioAsset,
    durationSeconds: part.durationSeconds,
    questionCount: part.questionCount,
    questionNumberRange: part.questionNumberRange,
    questionGroups: part.questionGroups.map(stripGroupForStudent),
  };
}

function summarizeTest(test: ExamTestDetailAuthoring): ExamTestSummary {
  const { instructions: _instructions, ...rest } = test;
  void _instructions;
  return {
    ...rest,
    parts: test.parts.map((p) => ({
      id: p.id,
      partNumber: p.partNumber,
      partType: p.partType,
      title: p.title,
      questionCount: p.questionCount,
      questionNumberRange: p.questionNumberRange,
      durationSeconds: p.durationSeconds,
      available: true,
    })),
  };
}

function recomputeTestMetrics(test: ExamTestDetailAuthoring): void {
  let runningNum = 1;
  let totalQuestions = 0;
  test.parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .forEach((part, pIdx) => {
      part.partNumber = pIdx + 1;
      const partStart = runningNum;
      let partCount = 0;
      part.questionGroups
        .sort((a, b) => a.groupNumber - b.groupNumber)
        .forEach((group, gIdx) => {
          group.groupNumber = gIdx + 1;
          group.partId = part.id;
          const groupStart = runningNum;
          group.questions
            .sort((a, b) => a.questionNumber - b.questionNumber)
            .forEach((q) => {
              q.groupId = group.id;
              q.questionNumber = runningNum;
              runningNum += 1;
              partCount += 1;
            });
          group.questionNumberStart =
            group.questions.length > 0 ? groupStart : Math.max(1, runningNum - 1);
          group.questionNumberEnd =
            group.questions.length > 0 ? runningNum - 1 : group.questionNumberStart;
        });
      part.questionCount = partCount;
      part.questionNumberRange = {
        start: partCount > 0 ? partStart : 0,
        end: partCount > 0 ? runningNum - 1 : 0,
      };
      totalQuestions += partCount;
    });
  test.partCount = test.parts.length;
  test.totalQuestions = totalQuestions;
  test.updatedAt = new Date().toISOString();
}

function normalizeToken(value: string, caseSensitive = false, ignorePunctuation = true): string {
  let v = value.trim().replace(/\s+/g, " ");
  if (ignorePunctuation) {
    v = v.replace(/[.,!?;:'"()[\]]/g, "");
  }
  return caseSensitive ? v : v.toLowerCase();
}

function gradeQuestion(
  q: ExamQuestionAuthoring,
  studentValue: ExamAnswerValue | undefined,
): boolean {
  if (studentValue === undefined) return false;
  if (q.questionType === "MULTIPLE_CHOICE_MULTIPLE") {
    const expectedList = Array.isArray(q.correctAnswer)
      ? q.correctAnswer
      : typeof q.correctAnswer === "string"
        ? q.correctAnswer.split(",").map((s) => s.trim())
        : [];
    const actualList = Array.isArray(studentValue)
      ? studentValue
      : [studentValue];
    const normExpected = [...new Set(expectedList.map((v) => v.trim().toUpperCase()))].sort();
    const normActual = [...new Set(actualList.map((v) => v.trim().toUpperCase()))].sort();
    return (
      normExpected.length > 0 &&
      normExpected.length === normActual.length &&
      normExpected.every((val, idx) => val === normActual[idx])
    );
  }

  const rawStudent = Array.isArray(studentValue)
    ? studentValue.join(",")
    : studentValue;
  const studentNorm = normalizeToken(rawStudent, q.caseSensitive, q.ignorePunctuation ?? true);
  if (!studentNorm) return false;

  const accepted = [
    ...(typeof q.correctAnswer === "string" ? [q.correctAnswer] : q.correctAnswer ?? []),
    ...(q.acceptedAnswers ?? []),
  ];
  return accepted.some(
    (ans) =>
      normalizeToken(ans, q.caseSensitive, q.ignorePunctuation ?? true) === studentNorm,
  );
}

function estimateBand(scorePercent: number): number {
  if (scorePercent >= 90) return 8.5;
  if (scorePercent >= 80) return 7.5;
  if (scorePercent >= 70) return 6.5;
  if (scorePercent >= 55) return 5.5;
  if (scorePercent >= 40) return 5.0;
  return 4.5;
}

export function createInitialExamV2MockState(): ExamV2MockState {
  const nowIso = new Date().toISOString();

  const readingFullTest: ExamTestDetailAuthoring = {
    id: "exam-read-full-01",
    title: "IELTS Academic Reading Full Test 01 — Science & Urban Society",
    subtitle: "3 Passages • Đầy đủ các dạng True/False/NG, Matching Headings, Completion & MCQ",
    skill: "READING",
    status: "PUBLISHED",
    version: 1,
    partCount: 3,
    totalQuestions: 15,
    totalDurationSeconds: 3600,
    difficulty: "TARGET_65",
    tags: ["Environment", "Economics", "Marine Biology", "Full Test"],
    allowedModes: ["PART", "FULL"],
    createdBy: { id: "tch-01", fullName: "Giảng viên Trần Lan Hương" },
    publishedAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-01T08:00:00.000Z",
    instructions:
      "Hoàn thành các câu hỏi dựa trên thông tin trong từng bài đọc. Bạn cần đạt tối thiểu 70% để mở khóa đáp án chi tiết và phần luyện dịch.",
    parts: [
      {
        id: "part-r1-p1",
        partNumber: 1,
        partType: "PASSAGE",
        title: "Passage 1: Vertical Farming & Urban Microclimates",
        passageTitle: "Vertical Farming and the Architecture of Urban Microclimates",
        durationSeconds: 1200,
        questionCount: 5,
        questionNumberRange: { start: 1, end: 5 },
        paragraphs: [
          {
            label: "A",
            text: "Modern cities absorb solar radiation far more intensely than surrounding rural landscapes, generating urban heat islands that drive up summer cooling demand. Architects and agronomists increasingly view controlled-environment vertical farms not merely as food factories, but as climate-buffering skins wrapped around high-density buildings.",
          },
          {
            label: "B",
            text: "Unlike conventional open-field agriculture, closed-loop aeroponic towers mist plant roots with nutrient droplets in recycled air. Field trials in Singapore and Rotterdam recorded water savings exceeding 92 percent compared with lettuce grown on irrigated farmland, though LED lighting arrays still demand stable low-carbon electricity.",
          },
          {
            label: "C",
            text: "Municipal planners emphasize that crop selection remains constrained by calorie economics: leafy greens, culinary herbs, and fruiting strawberries thrive economically indoors, whereas staple cereal grains such as wheat and rice remain impractical in stacked trays.",
          },
        ],
        passageHtml:
          "<p><strong>Paragraph A.</strong> Modern cities absorb solar radiation far more intensely than surrounding rural landscapes, generating <strong>urban heat islands</strong> that drive up summer cooling demand. Architects and agronomists increasingly view controlled-environment vertical farms not merely as food factories, but as climate-buffering skins wrapped around high-density buildings.</p><p><strong>Paragraph B.</strong> Unlike conventional open-field agriculture, closed-loop aeroponic towers mist plant roots with nutrient droplets in recycled air. Field trials in Singapore and Rotterdam recorded water savings exceeding <strong>92 percent</strong> compared with lettuce grown on irrigated farmland, though LED lighting arrays still demand stable low-carbon electricity.</p><p><strong>Paragraph C.</strong> Municipal planners emphasize that crop selection remains constrained by calorie economics: leafy greens, culinary herbs, and fruiting strawberries thrive economically indoors, whereas staple cereal grains such as wheat and rice remain impractical in stacked trays.</p>",
        questionGroups: [
          {
            id: "grp-r1-p1-1",
            partId: "part-r1-p1",
            groupNumber: 1,
            title: "Questions 1–3",
            instructionHtml:
              "<p>Do the following statements agree with the information given in Passage 1? Choose <strong>TRUE</strong>, <strong>FALSE</strong>, or <strong>NOT GIVEN</strong>.</p>",
            questionType: "TRUE_FALSE_NOT_GIVEN",
            questionNumberStart: 1,
            questionNumberEnd: 3,
            questions: [
              {
                id: "q-r1-1",
                groupId: "grp-r1-p1-1",
                questionNumber: 1,
                prompt:
                  "Urban buildings tend to retain more solar heat than nearby countryside areas.",
                questionType: "TRUE_FALSE_NOT_GIVEN",
                correctAnswer: "TRUE",
                explanation:
                  "Đoạn A khẳng định các thành phố hấp thụ bức xạ mặt trời mạnh hơn nhiều so với vùng nông thôn.",
                referenceParagraph: "A",
              },
              {
                id: "q-r1-2",
                groupId: "grp-r1-p1-1",
                questionNumber: 2,
                prompt:
                  "Aeroponic towers consume slightly more water than conventional open-field lettuce farms.",
                questionType: "TRUE_FALSE_NOT_GIVEN",
                correctAnswer: "FALSE",
                explanation:
                  "Đoạn B nêu rõ hệ thống này tiết kiệm hơn 92% lượng nước so với canh tác ngoài trời.",
                referenceParagraph: "B",
              },
              {
                id: "q-r1-3",
                groupId: "grp-r1-p1-1",
                questionNumber: 3,
                prompt:
                  "Wheat grown in vertical trays will become cheaper than imported grain by 2035.",
                questionType: "TRUE_FALSE_NOT_GIVEN",
                correctAnswer: "NOT_GIVEN",
                explanation:
                  "Bài đọc không dự đoán mốc năm 2035 hay giá lúa mì nhập khẩu.",
                referenceParagraph: "C",
              },
            ],
          },
          {
            id: "grp-r1-p1-2",
            partId: "part-r1-p1",
            groupNumber: 2,
            title: "Questions 4–5",
            instructionHtml:
              "<p>Answer Question 4 (choose ONE letter) and Question 5 (choose TWO letters).</p>",
            questionType: "MULTIPLE_CHOICE_SINGLE",
            questionNumberStart: 4,
            questionNumberEnd: 5,
            questions: [
              {
                id: "q-r1-4",
                groupId: "grp-r1-p1-2",
                questionNumber: 4,
                prompt: "What main operational challenge of vertical farms is noted in Paragraph B?",
                questionType: "MULTIPLE_CHOICE_SINGLE",
                options: [
                  { key: "A", label: "A", text: "Unpredictable rainfall indoors" },
                  { key: "B", label: "B", text: "High electricity demand from LED arrays" },
                  { key: "C", label: "C", text: "Lack of fertilizer availability" },
                  { key: "D", label: "D", text: "Insect pollination shortages" },
                ],
                correctAnswer: "B",
                explanation: "Đoạn B chỉ ra hệ thống đèn LED đòi hỏi nguồn điện ổn định ít phát thải carbon.",
                referenceParagraph: "B",
              },
              {
                id: "q-r1-5",
                groupId: "grp-r1-p1-2",
                questionNumber: 5,
                prompt: "Which TWO crops are described in Paragraph C as practical indoors?",
                questionType: "MULTIPLE_CHOICE_MULTIPLE",
                maxSelections: 2,
                options: [
                  { key: "A", label: "A", text: "Leafy greens" },
                  { key: "B", label: "B", text: "Wheat" },
                  { key: "C", label: "C", text: "Rice" },
                  { key: "D", label: "D", text: "Strawberries" },
                ],
                correctAnswer: ["A", "D"],
                explanation: "Đoạn C liệt kê leafy greens, culinary herbs và fruiting strawberries.",
                referenceParagraph: "C",
              },
            ],
          },
        ],
      },
      {
        id: "part-r1-p2",
        partNumber: 2,
        partType: "PASSAGE",
        title: "Passage 2: Pollination Networks & Food Resilience",
        passageTitle: "Wild Pollinator Corridors in Agricultural Landscapes",
        durationSeconds: 1200,
        questionCount: 5,
        questionNumberRange: { start: 6, end: 10 },
        paragraphs: [
          {
            label: "A",
            text: "For decades, orchard growers relied almost exclusively on managed honeybee hives trucked seasonally across continents. Recent ecological surveys demonstrate that wild solitary bees, hoverflies, and moths pollinate blossoms more effectively during cool windy mornings when honeybees remain grounded.",
          },
          {
            label: "B",
            text: "Restoring narrow wildflower strips along field margins boosts insect diversity without displacing productive cropland. In British cider orchards, planting native clover borders increased fruit set by 18 percent within three harvests, largely by offering uninterrupted nesting banks.",
          },
        ],
        passageHtml:
          "<p><strong>Paragraph A.</strong> For decades, orchard growers relied almost exclusively on managed honeybee hives trucked seasonally across continents. Recent ecological surveys demonstrate that wild solitary bees, hoverflies, and moths pollinate blossoms more effectively during cool windy mornings when honeybees remain grounded.</p><p><strong>Paragraph B.</strong> Restoring narrow wildflower strips along field margins boosts insect diversity without displacing productive cropland. In British cider orchards, planting native <strong>clover</strong> borders increased fruit set by <strong>18 percent</strong> within three harvests, largely by offering uninterrupted nesting banks.</p>",
        questionGroups: [
          {
            id: "grp-r1-p2-1",
            partId: "part-r1-p2",
            groupNumber: 1,
            title: "Questions 6–7",
            instructionHtml:
              "<p>Choose the correct heading for Paragraphs A and B from the list below.</p>",
            questionType: "MATCHING_HEADINGS",
            questionNumberStart: 6,
            questionNumberEnd: 7,
            sharedOptions: [
              { key: "i", text: "Beyond commercial honeybees in cooler weather" },
              { key: "ii", text: "Replacing orchards with automated greenhouses" },
              { key: "iii", text: "Measurable yield gains from border wildflowers" },
              { key: "iv", text: "Banning pesticide exports across Europe" },
            ],
            questions: [
              {
                id: "q-r1-6",
                groupId: "grp-r1-p2-1",
                questionNumber: 6,
                prompt: "Paragraph A",
                questionType: "MATCHING_HEADINGS",
                correctAnswer: "i",
                explanation: "Đoạn A so sánh ong bản địa và ruồi hoa hoạt động tốt hơn ong mật nuôi khi trời mát có gió.",
                referenceParagraph: "A",
              },
              {
                id: "q-r1-7",
                groupId: "grp-r1-p2-1",
                questionNumber: 7,
                prompt: "Paragraph B",
                questionType: "MATCHING_HEADINGS",
                correctAnswer: "iii",
                explanation: "Đoạn B trình bày kết quả tăng tỷ lệ đậu quả thêm 18% nhờ dải hoa dại.",
                referenceParagraph: "B",
              },
            ],
          },
          {
            id: "grp-r1-p2-2",
            partId: "part-r1-p2",
            groupNumber: 2,
            title: "Questions 8–10",
            instructionHtml:
              "<p>Complete the summary below using <strong>ONE WORD OR A NUMBER</strong> for Questions 8–9, and answer YES/NO/NOT GIVEN for Question 10.</p>",
            questionType: "SUMMARY_COMPLETION",
            questionNumberStart: 8,
            questionNumberEnd: 10,
            maxWords: 2,
            questions: [
              {
                id: "q-r1-8",
                groupId: "grp-r1-p2-2",
                questionNumber: 8,
                prompt: "Field margins planted with native ________ increased insect diversity.",
                questionType: "SUMMARY_COMPLETION",
                maxWords: 1,
                correctAnswer: "clover",
                acceptedAnswers: ["clover", "wildflower", "wildflowers"],
                explanation: "Đoạn B đề cập 'planting native clover borders'.",
                referenceParagraph: "B",
              },
              {
                id: "q-r1-9",
                groupId: "grp-r1-p2-2",
                questionNumber: 9,
                prompt: "British orchard fruit set rose by ________ percent within three seasons.",
                questionType: "SENTENCE_COMPLETION",
                maxWords: 1,
                correctAnswer: "18",
                acceptedAnswers: ["18", "eighteen"],
                explanation: "Số liệu trong bài là 18 percent.",
                referenceParagraph: "B",
              },
              {
                id: "q-r1-10",
                groupId: "grp-r1-p2-2",
                questionNumber: 10,
                prompt:
                  "Do growers have to sacrifice large areas of productive orchard land to plant flower strips?",
                questionType: "YES_NO_NOT_GIVEN",
                correctAnswer: "NO",
                explanation:
                  "Đoạn B nói rõ 'without displacing productive cropland'.",
                referenceParagraph: "B",
              },
            ],
          },
        ],
      },
      {
        id: "part-r1-p3",
        partNumber: 3,
        partType: "PASSAGE",
        title: "Passage 3: Marine Bioluminescence & Deep-Sea Sensing",
        passageTitle: "Living Light Below the Epipelagic Zone",
        durationSeconds: 1200,
        questionCount: 5,
        questionNumberRange: { start: 11, end: 15 },
        paragraphs: [
          {
            label: "A",
            text: "Below 200 meters in open ocean water, sunlight fades into twilight, yet more than three-quarters of pelagic organisms generate their own chemical light. Dr. Elena Vance notes that luciferin-luciferase reactions release photons with negligible thermal waste.",
          },
          {
            label: "B",
            text: "Low-light autonomous cameras equipped with red illumination have transformed deep-water observation because most abyssal fish cannot detect long red wavelengths. Consequently, marine biologists now record natural hunting behaviors without startling fauna.",
          },
        ],
        passageHtml:
          "<p><strong>Paragraph A.</strong> Below 200 meters in open ocean water, sunlight fades into twilight, yet more than three-quarters of pelagic organisms generate their own chemical light. Dr. Elena Vance notes that <strong>luciferin-luciferase</strong> reactions release photons with negligible thermal waste.</p><p><strong>Paragraph B.</strong> Low-light autonomous cameras equipped with <strong>red illumination</strong> have transformed deep-water observation because most abyssal fish cannot detect long red wavelengths. Consequently, marine biologists now record natural hunting behaviors without startling fauna.</p>",
        questionGroups: [
          {
            id: "grp-r1-p3-1",
            partId: "part-r1-p3",
            groupNumber: 1,
            title: "Questions 11–13",
            instructionHtml:
              "<p>Match each item with the correct paragraph, researcher, or ending.</p>",
            questionType: "MATCHING_INFORMATION",
            questionNumberStart: 11,
            questionNumberEnd: 13,
            sharedOptions: [
              { key: "A", text: "Paragraph A — Chemical efficiency of marine light" },
              { key: "B", text: "Paragraph B — Non-intrusive red-light observation" },
            ],
            questions: [
              {
                id: "q-r1-11",
                groupId: "grp-r1-p3-1",
                questionNumber: 11,
                prompt: "Which paragraph explains why marine organisms emit light with almost zero heat loss?",
                questionType: "MATCHING_INFORMATION",
                correctAnswer: "A",
                referenceParagraph: "A",
              },
              {
                id: "q-r1-12",
                groupId: "grp-r1-p3-1",
                questionNumber: 12,
                prompt: "Associate Dr. Elena Vance's key finding:",
                questionType: "MATCHING_FEATURES",
                options: [
                  { key: "X", text: "Bioluminescent chemistry releases photons efficiently" },
                  { key: "Y", text: "Deep-sea fish migrate to coral reefs nightly" },
                ],
                correctAnswer: "X",
                referenceParagraph: "A",
              },
              {
                id: "q-r1-13",
                groupId: "grp-r1-p3-1",
                questionNumber: 13,
                prompt: "Complete the sentence: Cameras using red wavelengths allow scientists to ...",
                questionType: "MATCHING_SENTENCE_ENDINGS",
                options: [
                  { key: "A", text: "film deep-sea hunting without frightening species" },
                  { key: "B", text: "heat water samples to extract luciferin" },
                ],
                correctAnswer: "A",
                referenceParagraph: "B",
              },
            ],
          },
          {
            id: "grp-r1-p3-2",
            partId: "part-r1-p3",
            groupNumber: 2,
            title: "Questions 14–15",
            instructionHtml:
              "<p>Answer using <strong>NO MORE THAN TWO WORDS AND/OR A NUMBER</strong>.</p>",
            questionType: "SHORT_ANSWER",
            questionNumberStart: 14,
            questionNumberEnd: 15,
            maxWords: 2,
            questions: [
              {
                id: "q-r1-14",
                groupId: "grp-r1-p3-2",
                questionNumber: 14,
                prompt: "Above what depth in meters does daylight start fading into the ocean twilight zone?",
                questionType: "SHORT_ANSWER",
                maxWords: 2,
                correctAnswer: "200 meters",
                acceptedAnswers: ["200 meters", "200m", "200"],
                referenceParagraph: "A",
              },
              {
                id: "q-r1-15",
                groupId: "grp-r1-p3-2",
                questionNumber: 15,
                prompt: "What color of camera illumination goes undetected by most abyssal fish?",
                questionType: "NOTE_COMPLETION",
                maxWords: 2,
                blankLabel: "Lighting wavelength color",
                correctAnswer: "red",
                acceptedAnswers: ["red", "red light", "red illumination"],
                referenceParagraph: "B",
              },
            ],
          },
        ],
      },
    ],
  };

  const listeningFullTest: ExamTestDetailAuthoring = {
    id: "exam-list-full-01",
    title: "IELTS Academic Listening Full Test 01 — Campus & Research Briefings",
    subtitle: "4 Sections • Note Completion, Flowchart, Table, Diagram & Multiple Choice",
    skill: "LISTENING",
    status: "PUBLISHED",
    version: 1,
    partCount: 4,
    totalQuestions: 8,
    totalDurationSeconds: 1800,
    difficulty: "INTERMEDIATE",
    tags: ["Listening", "Campus", "Academic", "Full Test"],
    allowedModes: ["PART", "FULL"],
    createdBy: { id: "tch-01", fullName: "Giảng viên Trần Lan Hương" },
    publishedAt: "2026-11-02T09:00:00.000Z",
    updatedAt: "2026-11-02T09:00:00.000Z",
    instructions:
      "Lắng nghe audio của từng Section trước khi chuyển phần. Đáp án và giải thích chỉ mở khóa khi đạt tối thiểu 70%.",
    parts: [
      {
        id: "part-l1-s1",
        partNumber: 1,
        partType: "SECTION",
        title: "Section 1: University Library Membership Desk",
        durationSeconds: 420,
        questionCount: 2,
        questionNumberRange: { start: 1, end: 2 },
        audioAsset: {
          assetId: "audio-list-s1",
          durationSeconds: 180,
          mimeType: "audio/mpeg",
          allowPause: true,
          allowSeek: true,
          maxPlayCount: null,
        },
        transcript:
          "[Teacher Only Transcript] Receptionist: Welcome to Northbridge Library. Our new evening desk stays open until 21:30. Member code word: HORIZON.",
        questionGroups: [
          {
            id: "grp-l1-s1-1",
            partId: "part-l1-s1",
            groupNumber: 1,
            title: "Questions 1–2",
            instructionHtml: "<p>Complete the registration notes below.</p>",
            questionType: "NOTE_COMPLETION",
            questionNumberStart: 1,
            questionNumberEnd: 2,
            maxWords: 2,
            questions: [
              {
                id: "q-l1-1",
                groupId: "grp-l1-s1-1",
                questionNumber: 1,
                prompt: "Library desk closing time on weekdays",
                questionType: "NOTE_COMPLETION",
                maxWords: 1,
                blankLabel: "Closing time",
                correctAnswer: "21:30",
                acceptedAnswers: ["21:30", "9:30 pm"],
                explanation: "Audio nêu giờ đóng cửa là 21:30.",
              },
              {
                id: "q-l1-2",
                groupId: "grp-l1-s1-1",
                questionNumber: 2,
                prompt: "Wifi temporary access code mentioned by receptionist",
                questionType: "SHORT_ANSWER",
                maxWords: 1,
                correctAnswer: "HORIZON",
                acceptedAnswers: ["horizon"],
                explanation: "Mã truy cập tạm thời là HORIZON.",
              },
            ],
          },
        ],
      },
      {
        id: "part-l1-s2",
        partNumber: 2,
        partType: "SECTION",
        title: "Section 2: Botanical Conservatory Guided Walk",
        durationSeconds: 450,
        questionCount: 2,
        questionNumberRange: { start: 3, end: 4 },
        audioAsset: {
          assetId: "audio-list-s2",
          durationSeconds: 210,
          mimeType: "audio/mpeg",
          allowPause: true,
          allowSeek: false,
          maxPlayCount: 2,
        },
        transcript:
          "[Teacher Only Transcript] Visitors begin in the glass atrium before stepping through the bamboo humidity chamber.",
        questionGroups: [
          {
            id: "grp-l1-s2-1",
            partId: "part-l1-s2",
            groupNumber: 1,
            title: "Questions 3–4",
            instructionHtml: "<p>Complete the visitor flow chart and select the correct option.</p>",
            questionType: "FLOW_CHART_COMPLETION",
            questionNumberStart: 3,
            questionNumberEnd: 4,
            maxWords: 2,
            questions: [
              {
                id: "q-l1-3",
                groupId: "grp-l1-s2-1",
                questionNumber: 3,
                prompt: "Step 1: Collect audio handset at the glass ________",
                questionType: "FLOW_CHART_COMPLETION",
                maxWords: 1,
                correctAnswer: "atrium",
                explanation: "Khách nhận thiết bị hướng dẫn tại glass atrium.",
              },
              {
                id: "q-l1-4",
                groupId: "grp-l1-s2-1",
                questionNumber: 4,
                prompt: "Which zone prohibits flash photography?",
                questionType: "MULTIPLE_CHOICE_SINGLE",
                options: [
                  { key: "A", text: "Fern courtyard" },
                  { key: "B", text: "Nocturnal orchid room" },
                  { key: "C", text: "Gift pavilion" },
                ],
                correctAnswer: "B",
                explanation: "Phòng hoa lan đêm cấm chụp đèn flash.",
              },
            ],
          },
        ],
      },
      {
        id: "part-l1-s3",
        partNumber: 3,
        partType: "SECTION",
        title: "Section 3: Climate Modeling Capstone Tutorial",
        durationSeconds: 450,
        questionCount: 2,
        questionNumberRange: { start: 5, end: 6 },
        audioAsset: {
          assetId: "audio-list-s3",
          durationSeconds: 200,
          mimeType: "audio/mpeg",
          allowPause: true,
          allowSeek: true,
          maxPlayCount: null,
        },
        transcript:
          "[Teacher Only Transcript] Maya focuses on rainfall datasets, while Liam audits satellite bias corrections.",
        questionGroups: [
          {
            id: "grp-l1-s3-1",
            partId: "part-l1-s3",
            groupNumber: 1,
            title: "Questions 5–6",
            instructionHtml: "<p>Answer questions about the students' research seminar.</p>",
            questionType: "TABLE_COMPLETION",
            questionNumberStart: 5,
            questionNumberEnd: 6,
            maxWords: 2,
            questions: [
              {
                id: "q-l1-5",
                groupId: "grp-l1-s3-1",
                questionNumber: 5,
                prompt: "Row: Maya | Dataset assigned: ________ series",
                questionType: "TABLE_COMPLETION",
                maxWords: 1,
                blankLabel: "Dataset column",
                correctAnswer: "rainfall",
                explanation: "Maya phụ trách chuỗi dữ liệu lượng mưa (rainfall).",
              },
              {
                id: "q-l1-6",
                groupId: "grp-l1-s3-1",
                questionNumber: 6,
                prompt: "Choose TWO elements Liam plans to verify before Friday:",
                questionType: "MULTIPLE_CHOICE_MULTIPLE",
                maxSelections: 2,
                options: [
                  { key: "A", text: "Satellite calibration log" },
                  { key: "B", text: "Coastal buoy timestamps" },
                  { key: "C", text: "Printing budget" },
                ],
                correctAnswer: ["A", "B"],
                explanation: "Liam rà soát nhật ký vệ tinh và dữ liệu thời gian phao biển.",
              },
            ],
          },
        ],
      },
      {
        id: "part-l1-s4",
        partNumber: 4,
        partType: "SECTION",
        title: "Section 4: Wind Turbine Blade Aerodynamics Lecture",
        durationSeconds: 480,
        questionCount: 2,
        questionNumberRange: { start: 7, end: 8 },
        audioAsset: {
          assetId: "audio-list-s4",
          durationSeconds: 240,
          mimeType: "audio/mpeg",
          allowPause: true,
          allowSeek: true,
          maxPlayCount: null,
        },
        transcript:
          "[Teacher Only Transcript] On the blade cross-section diagram, component B denotes the hollow spar beam built from carbon composite.",
        questionGroups: [
          {
            id: "grp-l1-s4-1",
            partId: "part-l1-s4",
            groupNumber: 1,
            title: "Questions 7–8",
            instructionHtml:
              "<p>Label the turbine diagram and complete the lecture summary below.</p>",
            questionType: "DIAGRAM_LABEL_COMPLETION",
            questionNumberStart: 7,
            questionNumberEnd: 8,
            maxWords: 2,
            questions: [
              {
                id: "q-l1-7",
                groupId: "grp-l1-s4-1",
                questionNumber: 7,
                prompt: "Diagram Label [B]: Structural core inside the blade",
                questionType: "DIAGRAM_LABEL_COMPLETION",
                maxWords: 2,
                blankLabel: "Label B",
                correctAnswer: "spar beam",
                acceptedAnswers: ["spar", "spar beam"],
                explanation: "Giảng viên chỉ rõ ký hiệu B là hollow spar beam.",
              },
              {
                id: "q-l1-8",
                groupId: "grp-l1-s4-1",
                questionNumber: 8,
                prompt: "Primary composite material used in modern offshore blades",
                questionType: "SUMMARY_COMPLETION",
                maxWords: 2,
                correctAnswer: "carbon",
                acceptedAnswers: ["carbon", "carbon composite"],
                explanation: "Vật liệu chính được nêu là carbon composite.",
              },
            ],
          },
        ],
      },
    ],
  };

  const singlePassagePractice: ExamTestDetailAuthoring = {
    id: "exam-read-part-02",
    title: "IELTS Reading Intensive Practice — Acoustic Architecture",
    subtitle: "Đề luyện đơn 1 Passage • Hỗ trợ chế độ PART",
    skill: "READING",
    status: "PUBLISHED",
    version: 1,
    partCount: 1,
    totalQuestions: 3,
    totalDurationSeconds: 1200,
    difficulty: "TARGET_75_PLUS",
    tags: ["Architecture", "Physics", "Single Passage"],
    allowedModes: ["PART"],
    createdBy: { id: "tch-01", fullName: "Giảng viên Trần Lan Hương" },
    publishedAt: "2026-11-05T10:00:00.000Z",
    updatedAt: "2026-11-05T10:00:00.000Z",
    parts: [
      {
        id: "part-r2-p1",
        partNumber: 1,
        partType: "PASSAGE",
        title: "Passage 1: Concert Hall Reverberation",
        passageTitle: "Designing Clarity in Timber Concert Halls",
        durationSeconds: 1200,
        questionCount: 3,
        questionNumberRange: { start: 1, end: 3 },
        paragraphs: [
          {
            label: "A",
            text: "Early twentieth-century acoustician Wallace Sabine established that room reverberation time depends primarily on volume and sound absorption rather than decorative plaster alone.",
          },
          {
            label: "B",
            text: "Modern timber panels milled with variable Helmholtz slots scatter high-frequency glare cleanly across rear balcony seats while keeping bass warmth intact.",
          },
        ],
        passageHtml:
          "<p><strong>Paragraph A.</strong> Early twentieth-century acoustician <strong>Wallace Sabine</strong> established that room reverberation time depends primarily on volume and sound absorption rather than decorative plaster alone.</p><p><strong>Paragraph B.</strong> Modern timber panels milled with variable <strong>Helmholtz</strong> slots scatter high-frequency glare cleanly across rear balcony seats while keeping bass warmth intact.</p>",
        questionGroups: [
          {
            id: "grp-r2-p1-1",
            partId: "part-r2-p1",
            groupNumber: 1,
            title: "Questions 1–3",
            instructionHtml: "<p>Answer Questions 1–3 based on Passage 1.</p>",
            questionType: "TRUE_FALSE_NOT_GIVEN",
            questionNumberStart: 1,
            questionNumberEnd: 3,
            questions: [
              {
                id: "q-r2-1",
                groupId: "grp-r2-p1-1",
                questionNumber: 1,
                prompt: "Sabine linked reverberation time mainly to decorative plaster shapes.",
                questionType: "TRUE_FALSE_NOT_GIVEN",
                correctAnswer: "FALSE",
                referenceParagraph: "A",
              },
              {
                id: "q-r2-2",
                groupId: "grp-r2-p1-1",
                questionNumber: 2,
                prompt: "Timber slots with ________ geometry help diffuse high frequencies cleanly.",
                questionType: "SENTENCE_COMPLETION",
                maxWords: 1,
                correctAnswer: "Helmholtz",
                referenceParagraph: "B",
              },
              {
                id: "q-r2-3",
                groupId: "grp-r2-p1-1",
                questionNumber: 3,
                prompt: "Who formulated the foundational reverberation relationship?",
                questionType: "SHORT_ANSWER",
                maxWords: 2,
                correctAnswer: "Wallace Sabine",
                acceptedAnswers: ["Wallace Sabine", "Sabine"],
                referenceParagraph: "A",
              },
            ],
          },
        ],
      },
    ],
  };

  const draftTest: ExamTestDetailAuthoring = {
    id: "exam-read-draft-01",
    title: "Bản nháp — Ancient Maritime Navigation",
    subtitle: "Đề đang biên soạn — Chưa xuất bản cho học viên",
    skill: "READING",
    status: "DRAFT",
    version: 1,
    partCount: 1,
    totalQuestions: 2,
    totalDurationSeconds: 1200,
    difficulty: "FOUNDATION",
    tags: ["History", "Draft"],
    allowedModes: ["PART"],
    createdBy: { id: "tch-01", fullName: "Giảng viên Trần Lan Hương" },
    updatedAt: nowIso,
    parts: [
      {
        id: "part-draft-p1",
        partNumber: 1,
        partType: "PASSAGE",
        title: "Passage 1: Polynesian Star Compasses",
        passageTitle: "Wayfinding Across the Pacific",
        durationSeconds: 1200,
        questionCount: 2,
        questionNumberRange: { start: 1, end: 2 },
        paragraphs: [
          {
            label: "A",
            text: "Polynesian navigators memorized seasonal rising positions of stars along the horizon and read ocean swell interference patterns.",
          },
        ],
        passageHtml:
          "<p><strong>Paragraph A.</strong> Polynesian navigators memorized seasonal rising positions of stars along the horizon and read ocean <strong>swell</strong> interference patterns.</p>",
        questionGroups: [
          {
            id: "grp-draft-p1-1",
            partId: "part-draft-p1",
            groupNumber: 1,
            title: "Questions 1–2",
            instructionHtml: "<p>Answer the draft questions below.</p>",
            questionType: "TRUE_FALSE_NOT_GIVEN",
            questionNumberStart: 1,
            questionNumberEnd: 2,
            questions: [
              {
                id: "q-draft-1",
                groupId: "grp-draft-p1-1",
                questionNumber: 1,
                prompt: "Wayfinders observed wave swell interference in addition to stars.",
                questionType: "TRUE_FALSE_NOT_GIVEN",
                correctAnswer: "TRUE",
              },
              {
                id: "q-draft-2",
                groupId: "grp-draft-p1-1",
                questionNumber: 2,
                prompt: "Navigation traditions used ________ interference patterns on ocean waves.",
                questionType: "SENTENCE_COMPLETION",
                maxWords: 1,
                correctAnswer: "swell",
              },
            ],
          },
        ],
      },
    ],
  };

  // Seed one passed attempt & submitted passage translation so review workflows have immediate rich data
  const seededAttemptId = "att-seed-r1-p1-pass";
  const seededResult: ExamResultResponse = {
    attemptId: seededAttemptId,
    testId: readingFullTest.id,
    testTitle: readingFullTest.title,
    skill: "READING",
    mode: "PART",
    partId: "part-r1-p1",
    studentAssignmentId: null,
    status: "SUBMITTED",
    totalQuestions: 5,
    correctCount: 4,
    scorePercent: 80,
    passed: true,
    passThresholdPercent: PASS_SCORE_THRESHOLD,
    ieltsBandEstimate: 7.5,
    answerReviewAvailable: true,
    answerReviewLockedReason: null,
    translationEligible: true,
    translationEligibilityHint: "Bạn đã đạt ≥ 70% Passage 1 — đã mở khóa luyện dịch Passage 1.",
    partBreakdown: [
      {
        partId: "part-r1-p1",
        partNumber: 1,
        title: "Passage 1: Vertical Farming & Urban Microclimates",
        correctCount: 4,
        totalCount: 5,
        percentage: 80,
      },
    ],
    timeSpentSeconds: 615,
    submittedAt: "2026-11-10T10:15:00.000Z",
  };

  const seededReviewItems: ExamQuestionReviewItem[] = [
    {
      questionId: "q-r1-1",
      partId: "part-r1-p1",
      partNumber: 1,
      questionNumber: 1,
      questionType: "TRUE_FALSE_NOT_GIVEN",
      prompt: "Urban buildings tend to retain more solar heat than nearby countryside areas.",
      studentAnswer: "TRUE",
      correctAnswer: "TRUE",
      isCorrect: true,
      explanation: "Đoạn A nêu các thành phố hấp thụ bức xạ mặt trời mạnh hơn nông thôn.",
      referenceParagraph: "A",
    },
    {
      questionId: "q-r1-2",
      partId: "part-r1-p1",
      partNumber: 1,
      questionNumber: 2,
      questionType: "TRUE_FALSE_NOT_GIVEN",
      prompt: "Aeroponic towers consume slightly more water than conventional open-field lettuce farms.",
      studentAnswer: "FALSE",
      correctAnswer: "FALSE",
      isCorrect: true,
      explanation: "Tiết kiệm hơn 92% nước so với canh tác mở.",
      referenceParagraph: "B",
    },
    {
      questionId: "q-r1-3",
      partId: "part-r1-p1",
      partNumber: 1,
      questionNumber: 3,
      questionType: "TRUE_FALSE_NOT_GIVEN",
      prompt: "Wheat grown in vertical trays will become cheaper than imported grain by 2035.",
      studentAnswer: "NOT_GIVEN",
      correctAnswer: "NOT_GIVEN",
      isCorrect: true,
      referenceParagraph: "C",
    },
    {
      questionId: "q-r1-4",
      partId: "part-r1-p1",
      partNumber: 1,
      questionNumber: 4,
      questionType: "MULTIPLE_CHOICE_SINGLE",
      prompt: "What main operational challenge of vertical farms is noted in Paragraph B?",
      studentAnswer: "B",
      correctAnswer: "B",
      isCorrect: true,
      referenceParagraph: "B",
    },
    {
      questionId: "q-r1-5",
      partId: "part-r1-p1",
      partNumber: 1,
      questionNumber: 5,
      questionType: "MULTIPLE_CHOICE_MULTIPLE",
      prompt: "Which TWO crops are described in Paragraph C as practical indoors?",
      studentAnswer: ["A"],
      correctAnswer: ["A", "D"],
      isCorrect: false,
      explanation: "Cần chọn đủ 2 đáp án đúng: Leafy greens (A) và Strawberries (D).",
      referenceParagraph: "C",
    },
  ];

  const seededAttempt: StoredMockExamAttempt = {
    attemptId: seededAttemptId,
    studentId: "stu-01",
    testId: readingFullTest.id,
    testTitle: readingFullTest.title,
    skill: "READING",
    mode: "PART",
    status: "SUBMITTED",
    partId: "part-r1-p1",
    studentAssignmentId: null,
    revision: 2,
    startedAt: "2026-11-10T10:04:45.000Z",
    expiresAt: "2026-11-10T10:24:45.000Z",
    durationSeconds: 1200,
    partsAuthoring: [readingFullTest.parts[0]!],
    answers: {
      "q-r1-1": "TRUE",
      "q-r1-2": "FALSE",
      "q-r1-3": "NOT_GIVEN",
      "q-r1-4": "B",
      "q-r1-5": ["A"],
    },
    flaggedQuestionIds: ["q-r1-5"],
    submittedAt: "2026-11-10T10:15:00.000Z",
    result: seededResult,
    reviewItems: seededReviewItems,
    submitIdempotencyKeys: {},
  };

  const seedPart = readingFullTest.parts[0]!;
  const seededTranslation: StoredMockPassageTranslation = {
    translationId: "mtr-seed-01",
    studentId: "stu-01",
    studentName: "Nguyễn Minh Anh",
    studentEmail: "student@ielts.vn",
    testId: readingFullTest.id,
    testTitle: readingFullTest.title,
    passageId: seedPart.id,
    partNumber: seedPart.partNumber,
    passageTitle: seedPart.passageTitle ?? seedPart.title,
    passageHtml: seedPart.passageHtml ?? "",
    paragraphs: seedPart.paragraphs,
    status: "SUBMITTED",
    revision: 1,
    textVi:
      "Các đô thị hiện đại hấp thụ bức xạ mặt trời mạnh hơn nhiều so với vùng nông thôn lân cận, tạo ra hiệu ứng đảo nhiệt đô thị làm tăng nhu cầu làm mát vào mùa hè. Các kiến trúc sư và nhà nông học ngày càng coi nông trại thẳng đứng trong nhà như lớp đệm điều hòa vi khí hậu cho các tòa nhà mật độ cao.",
    teacherFeedback: null,
    reviewedBy: null,
    reviewedAt: null,
    updatedAt: "2026-11-10T10:40:00.000Z",
    submittedAt: "2026-11-10T10:42:00.000Z",
    unlockedByAttemptId: seededAttemptId,
    studentAssignmentId: null,
    assignmentTitle: null,
    courseTitle: null,
  };

  return {
    tests: [readingFullTest, listeningFullTest, singlePassagePractice, draftTest],
    attempts: {
      [seededAttemptId]: seededAttempt,
    },
    unlockedPassagesByStudent: {
      "stu-01": {
        "part-r1-p1": seededAttemptId,
      },
    },
    passageTranslations: {
      "stu-01::part-r1-p1": seededTranslation,
    },
  };
}

function paginate<T>(items: T[], sp: URLSearchParams): PaginatedResponse<T> {
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const limit = Math.max(1, Math.min(100, Number(sp.get("limit") ?? 20)));
  const start = (page - 1) * limit;
  const sliced = items.slice(start, start + limit);
  return {
    items: sliced,
    page,
    limit,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / limit)),
  };
}

function mockNotFound(message: string): never {
  throw new ApiError({
    statusCode: 404,
    code: "EXAM_NOT_FOUND",
    message,
    requestId: `mock-${Date.now()}`,
  });
}

function validateAuthoringTest(test: ExamTestDetailAuthoring): ValidateExamTestResponse {
  const errors: ValidateExamTestIssue[] = [];
  const warnings: ValidateExamTestIssue[] = [];

  if (!test.title.trim()) {
    errors.push({ field: "title", message: "Tiêu đề đề thi không được để trống." });
  }
  if (test.parts.length === 0) {
    errors.push({ field: "parts", message: "Đề thi phải có ít nhất 1 Passage hoặc Section." });
  }
  if (test.allowedModes.includes("FULL") && test.skill === "READING" && test.parts.length < 2) {
    warnings.push({
      field: "allowedModes",
      message: "Đề Reading Full Test thường có từ 2–3 Passage trở lên.",
    });
  }

  for (const part of test.parts) {
    if (test.skill === "READING" && !part.passageHtml?.trim() && !(part.paragraphs?.length ?? 0)) {
      errors.push({
        partId: part.id,
        field: "passageHtml",
        message: `Part ${part.partNumber}: Passage Reading phải có nội dung bài đọc.`,
      });
    }
    if (test.skill === "LISTENING" && !part.audioAsset?.assetId?.trim()) {
      errors.push({
        partId: part.id,
        field: "audioAsset",
        message: `Section ${part.partNumber}: Listening Section bắt buộc phải có tệp audio hoàn chỉnh.`,
      });
    }
    if (part.questionGroups.length === 0) {
      errors.push({
        partId: part.id,
        field: "questionGroups",
        message: `Part ${part.partNumber}: Cần ít nhất 1 nhóm câu hỏi.`,
      });
    }
    for (const group of part.questionGroups) {
      if (group.questions.length === 0) {
        errors.push({
          partId: part.id,
          groupId: group.id,
          message: `Part ${part.partNumber} · Nhóm ${group.groupNumber}: Chưa có câu hỏi nào.`,
        });
      }
      for (const q of group.questions) {
        const hasAnswer = Array.isArray(q.correctAnswer)
          ? q.correctAnswer.length > 0
          : Boolean(q.correctAnswer?.trim());
        if (!hasAnswer && !(q.acceptedAnswers?.length ?? 0)) {
          errors.push({
            partId: part.id,
            groupId: group.id,
            questionNumber: q.questionNumber,
            message: `Câu ${q.questionNumber}: Thiếu đáp án chuẩn để chấm tự động.`,
          });
        }
        if (
          (q.questionType === "MULTIPLE_CHOICE_SINGLE" ||
            q.questionType === "MULTIPLE_CHOICE_MULTIPLE") &&
          (!q.options || q.options.length < 2)
        ) {
          errors.push({
            partId: part.id,
            groupId: group.id,
            questionNumber: q.questionNumber,
            message: `Câu ${q.questionNumber}: Câu hỏi trắc nghiệm cần tối thiểu 2 lựa chọn.`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function finalizeMockAttemptSubmission(
  state: ExamV2MockState,
  attempt: StoredMockExamAttempt,
  nextStatus: "SUBMITTED" | "EXPIRED",
): ExamResultResponse {
  const allQuestions: Array<{ part: ExamPartAuthoring; q: ExamQuestionAuthoring }> = [];
  for (const part of attempt.partsAuthoring) {
    for (const group of part.questionGroups) {
      for (const q of group.questions) {
        allQuestions.push({ part, q });
      }
    }
  }

  const reviewItems: ExamQuestionReviewItem[] = [];
  const partMap = new Map<
    string,
    { partId: string; partNumber: number; title: string; correctCount: number; totalCount: number }
  >();

  let totalCorrect = 0;
  for (const { part, q } of allQuestions) {
    const studentAnswer = attempt.answers[q.id] ?? null;
    const isCorrect = gradeQuestion(q, studentAnswer ?? undefined);
    if (isCorrect) totalCorrect += 1;

    const pm = partMap.get(part.id) ?? {
      partId: part.id,
      partNumber: part.partNumber,
      title: part.title,
      correctCount: 0,
      totalCount: 0,
    };
    pm.totalCount += 1;
    if (isCorrect) pm.correctCount += 1;
    partMap.set(part.id, pm);

    reviewItems.push({
      questionId: q.id,
      partId: part.id,
      partNumber: part.partNumber,
      questionNumber: q.questionNumber,
      questionType: q.questionType,
      prompt: q.prompt,
      studentAnswer,
      correctAnswer: q.correctAnswer,
      acceptedAnswers: q.acceptedAnswers,
      isCorrect,
      explanation: q.explanation,
      referenceParagraph: q.referenceParagraph,
    });
  }

  const totalQuestions = Math.max(1, allQuestions.length);
  const scorePercent = Math.round((totalCorrect / totalQuestions) * 100);
  const passed = scorePercent >= PASS_SCORE_THRESHOLD;
  const answerReviewAvailable = passed;
  const submittedAt = attempt.submittedAt ?? new Date().toISOString();

  // Unlock translation passages strictly on backend threshold rule (>= 70% Reading)
  if (attempt.skill === "READING" && passed) {
    const unlockedMap = (state.unlockedPassagesByStudent[attempt.studentId] ??= {});
    if (attempt.mode === "PART" && attempt.partId) {
      unlockedMap[attempt.partId] = attempt.attemptId;
    } else if (attempt.mode === "FULL") {
      for (const p of attempt.partsAuthoring) {
        unlockedMap[p.id] = attempt.attemptId;
      }
    }
  }

  const timeSpentSeconds = Math.max(
    1,
    Math.min(
      attempt.durationSeconds,
      Math.round((Date.parse(submittedAt) - Date.parse(attempt.startedAt)) / 1000),
    ),
  );

  const result: ExamResultResponse = {
    attemptId: attempt.attemptId,
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    skill: attempt.skill,
    mode: attempt.mode,
    partId: attempt.partId,
    studentAssignmentId: attempt.studentAssignmentId,
    status: nextStatus,
    totalQuestions,
    correctCount: totalCorrect,
    scorePercent,
    passed,
    passThresholdPercent: PASS_SCORE_THRESHOLD,
    ieltsBandEstimate: estimateBand(scorePercent),
    answerReviewAvailable,
    answerReviewLockedReason: answerReviewAvailable
      ? null
      : "Bạn cần đạt tối thiểu 70% số câu đúng để mở khóa đáp án chi tiết và giải thích.",
    translationEligible: attempt.skill === "READING" && passed,
    translationEligibilityHint:
      attempt.skill === "READING"
        ? passed
          ? attempt.mode === "FULL"
            ? "Bạn đã đạt ≥ 70% Full Test — tất cả Passage trong đề này đã được mở khóa dịch."
            : "Bạn đã đạt ≥ 70% — Passage này đã được mở khóa luyện dịch tiếng Việt."
          : "Phần dịch bài đọc sẽ mở khóa sau khi bạn đạt từ 70% trở lên."
        : null,
    partBreakdown: Array.from(partMap.values()).map((pm) => ({
      ...pm,
      percentage: pm.totalCount > 0 ? Math.round((pm.correctCount / pm.totalCount) * 100) : 0,
    })),
    timeSpentSeconds,
    submittedAt,
  };

  attempt.status = nextStatus;
  attempt.submittedAt = submittedAt;
  attempt.result = result;
  attempt.reviewItems = reviewItems;
  return result;
}

function toAttemptDetail(attempt: StoredMockExamAttempt): ExamAttemptDetail {
  const nowMs = Date.now();
  const expiresMs = Date.parse(attempt.expiresAt);
  const remainingSeconds =
    attempt.status === "IN_PROGRESS" ? Math.max(0, Math.floor((expiresMs - nowMs) / 1000)) : 0;

  return {
    attemptId: attempt.attemptId,
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    skill: attempt.skill,
    mode: attempt.mode,
    status: attempt.status,
    partId: attempt.partId,
    studentAssignmentId: attempt.studentAssignmentId,
    revision: attempt.revision,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    serverTime: new Date(nowMs).toISOString(),
    remainingSeconds,
    durationSeconds: attempt.durationSeconds,
    parts: attempt.partsAuthoring.map(stripPartForStudent),
    answers: { ...attempt.answers },
    flaggedQuestionIds: [...attempt.flaggedQuestionIds],
    totalQuestions: attempt.partsAuthoring.reduce((s, p) => s + p.questionCount, 0),
    answeredCount: Object.values(attempt.answers).filter((v) =>
      Array.isArray(v) ? v.length > 0 : String(v ?? "").trim().length > 0,
    ).length,
    submittedAt: attempt.submittedAt,
  };
}

export interface ExamV2DispatchContext {
  method: string;
  pathname: string;
  sp: URLSearchParams;
  body: unknown;
  headers?: Record<string, string>;
  currentUser: { id: string; fullName: string; email: string };
}

export function dispatchExamV2MockRequest<T>(
  state: ExamV2MockState,
  ctx: ExamV2DispatchContext,
): { handled: boolean; data?: T } {
  const { method, pathname, sp, body, currentUser } = ctx;

  // -------------------------------------------------------------------------
  // Student Exam Tests Catalog & Detail
  // -------------------------------------------------------------------------
  if (method === "GET" && pathname === "/exam-tests") {
    const skill = sp.get("skill") as ExamSkill | null;
    const mode = sp.get("mode") as ExamMode | null;
    const difficulty = sp.get("difficulty");
    const search = sp.get("search")?.trim().toLowerCase();

    let items = state.tests.filter((t) => t.status === "PUBLISHED");
    if (skill) items = items.filter((t) => t.skill === skill);
    if (mode) items = items.filter((t) => t.allowedModes.includes(mode));
    if (difficulty) items = items.filter((t) => t.difficulty === difficulty);
    if (search) {
      items = items.filter(
        (t) =>
          t.title.toLowerCase().includes(search) ||
          (t.subtitle?.toLowerCase().includes(search) ?? false) ||
          t.tags.some((tag) => tag.toLowerCase().includes(search)),
      );
    }
    return { handled: true, data: paginate(items.map(summarizeTest), sp) as T };
  }

  const testPartMatch = /^\/exam-tests\/([^/]+)\/parts\/([^/]+)$/.exec(pathname);
  if (method === "GET" && testPartMatch) {
    const test = state.tests.find(
      (t) => t.id === testPartMatch[1] && t.status === "PUBLISHED",
    );
    if (!test) mockNotFound("Không tìm thấy đề thi đã xuất bản.");
    const part = test.parts.find((p) => p.id === testPartMatch[2]);
    if (!part) mockNotFound("Không tìm thấy phần thi.");
    return { handled: true, data: stripPartForStudent(part) as T };
  }

  const testDetailMatch = /^\/exam-tests\/([^/]+)$/.exec(pathname);
  if (method === "GET" && testDetailMatch) {
    const test = state.tests.find(
      (t) => t.id === testDetailMatch[1] && t.status === "PUBLISHED",
    );
    if (!test) mockNotFound("Không tìm thấy đề thi.");
    const active = Object.values(state.attempts).find(
      (a) =>
        a.studentId === currentUser.id &&
        a.testId === test.id &&
        a.status === "IN_PROGRESS" &&
        Date.parse(a.expiresAt) > Date.now(),
    );
    const detail: ExamTestDetailStudent = {
      ...summarizeTest(test),
      instructions: test.instructions,
      parts: test.parts.map(stripPartForStudent),
      activeAttempt: active
        ? {
            attemptId: active.attemptId,
            mode: active.mode,
            partId: active.partId,
            startedAt: active.startedAt,
            expiresAt: active.expiresAt,
            answeredCount: Object.keys(active.answers).length,
            totalQuestions: active.partsAuthoring.reduce((s, p) => s + p.questionCount, 0),
          }
        : null,
    };
    return { handled: true, data: detail as T };
  }

  // -------------------------------------------------------------------------
  // Student Exam Attempts Lifecycle
  // -------------------------------------------------------------------------
  if (method === "GET" && pathname === "/exam-attempts") {
    const testId = sp.get("testId");
    const status = sp.get("status");
    const list: ExamAttemptSummaryItem[] = Object.values(state.attempts)
      .filter((a) => a.studentId === currentUser.id)
      .filter((a) => (testId ? a.testId === testId : true))
      .filter((a) => (status ? a.status === status : true))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .map((a) => ({
        attemptId: a.attemptId,
        testId: a.testId,
        testTitle: a.testTitle,
        skill: a.skill,
        mode: a.mode,
        partId: a.partId,
        partTitle: a.partId
          ? (a.partsAuthoring.find((p) => p.id === a.partId)?.title ?? null)
          : null,
        status: a.status,
        scorePercent: a.result?.scorePercent ?? null,
        passed: a.result?.passed ?? null,
        startedAt: a.startedAt,
        expiresAt: a.expiresAt,
        submittedAt: a.submittedAt,
      }));
    return { handled: true, data: paginate(list, sp) as T };
  }

  if (method === "POST" && pathname === "/exam-attempts") {
    const req = body as StartExamAttemptRequest;
    const test = state.tests.find((t) => t.id === req.testId && t.status === "PUBLISHED");
    if (!test) mockNotFound("Không tìm thấy đề thi đã xuất bản.");
    if (!test.allowedModes.includes(req.mode)) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_EXAM_SCOPE",
        message: "Đề thi này không hỗ trợ chế độ thi bạn vừa chọn.",
      });
    }

    let selectedParts = test.parts;
    if (req.mode === "PART") {
      const targetPart = test.parts.find((p) => p.id === req.partId);
      if (!targetPart) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_EXAM_SCOPE",
          message: "Chế độ PART yêu cầu chọn đúng một Passage hoặc Section.",
        });
      }
      selectedParts = [targetPart];
    }

    // Reuse existing in-progress attempt with matching scope if still valid
    const existing = Object.values(state.attempts).find(
      (a) =>
        a.studentId === currentUser.id &&
        a.testId === test.id &&
        a.mode === req.mode &&
        (a.partId ?? null) === (req.partId ?? null) &&
        a.status === "IN_PROGRESS" &&
        Date.parse(a.expiresAt) > Date.now(),
    );
    if (existing) {
      return { handled: true, data: toAttemptDetail(existing) as T };
    }

    const durationSeconds =
      req.mode === "PART"
        ? (selectedParts[0]?.durationSeconds ?? Math.round(test.totalDurationSeconds / Math.max(1, test.parts.length)))
        : test.totalDurationSeconds;
    const nowMs = Date.now();
    const attemptId = `att-${nowMs}-${Math.random().toString(36).slice(2, 6)}`;
    const attempt: StoredMockExamAttempt = {
      attemptId,
      studentId: currentUser.id,
      testId: test.id,
      testTitle: test.title,
      skill: test.skill,
      mode: req.mode,
      status: "IN_PROGRESS",
      partId: req.mode === "PART" ? (req.partId ?? null) : null,
      studentAssignmentId: req.studentAssignmentId ?? null,
      revision: 1,
      startedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + durationSeconds * 1000).toISOString(),
      durationSeconds,
      partsAuthoring: selectedParts,
      answers: {},
      flaggedQuestionIds: [],
      submittedAt: null,
      submitIdempotencyKeys: {},
    };
    state.attempts[attemptId] = attempt;
    return { handled: true, data: toAttemptDetail(attempt) as T };
  }

  const attemptSubMatch = /^\/exam-attempts\/([^/]+)\/(answers|submit|result|review)$/.exec(
    pathname,
  );
  if (attemptSubMatch) {
    const attemptId = attemptSubMatch[1]!;
    const subRoute = attemptSubMatch[2]!;
    const attempt = state.attempts[attemptId];
    if (!attempt) mockNotFound("Không tìm thấy lượt làm bài.");

    if (attempt.status === "IN_PROGRESS" && Date.parse(attempt.expiresAt) <= Date.now()) {
      finalizeMockAttemptSubmission(state, attempt, "EXPIRED");
    }

    if (subRoute === "answers" && method === "PUT") {
      if (attempt.status === "EXPIRED") {
        throw new ApiError({
          statusCode: 409,
          code: "ATTEMPT_EXPIRED",
          message: "Thời gian làm bài đã hết, không thể lưu thêm đáp án.",
        });
      }
      if (attempt.status !== "IN_PROGRESS") {
        throw new ApiError({
          statusCode: 409,
          code: "ATTEMPT_ALREADY_SUBMITTED",
          message: "Bài làm đã được nộp trước đó.",
        });
      }
      const req = body as SaveExamAnswersRequest;
      if (req.baseRevision !== attempt.revision) {
        throw new ApiError({
          statusCode: 409,
          code: "ANSWERS_REVISION_CONFLICT",
          message: "Dữ liệu làm bài đã thay đổi từ một phiên mới hơn.",
        });
      }
      attempt.answers = { ...attempt.answers, ...req.answers };
      if (req.flaggedQuestionIds) {
        attempt.flaggedQuestionIds = [...req.flaggedQuestionIds];
      }
      attempt.revision += 1;
      const nowMs = Date.now();
      const resp: SaveExamAnswersResponse = {
        attemptId: attempt.attemptId,
        revision: attempt.revision,
        answeredCount: Object.values(attempt.answers).filter((v) =>
          Array.isArray(v) ? v.length > 0 : String(v ?? "").trim().length > 0,
        ).length,
        savedAt: new Date(nowMs).toISOString(),
        serverTime: new Date(nowMs).toISOString(),
        remainingSeconds: Math.max(
          0,
          Math.floor((Date.parse(attempt.expiresAt) - nowMs) / 1000),
        ),
      };
      return { handled: true, data: resp as T };
    }

    if (subRoute === "submit" && method === "POST") {
      const idemKey = ctx.headers?.["Idempotency-Key"] ?? ctx.headers?.["idempotency-key"];
      if (idemKey && attempt.submitIdempotencyKeys[idemKey]) {
        return { handled: true, data: attempt.submitIdempotencyKeys[idemKey] as T };
      }
      if (attempt.status === "SUBMITTED" && attempt.result) {
        return { handled: true, data: attempt.result as T };
      }
      const req = (body ?? {}) as SubmitExamAttemptRequest;
      if (req.answers) {
        attempt.answers = { ...attempt.answers, ...req.answers };
      }
      if (req.flaggedQuestionIds) {
        attempt.flaggedQuestionIds = [...req.flaggedQuestionIds];
      }
      const nextStatus = Date.parse(attempt.expiresAt) <= Date.now() ? "EXPIRED" : "SUBMITTED";
      const result = finalizeMockAttemptSubmission(state, attempt, nextStatus);
      if (idemKey) {
        attempt.submitIdempotencyKeys[idemKey] = result;
      }
      return { handled: true, data: result as T };
    }

    if (subRoute === "result" && method === "GET") {
      if (!attempt.result) {
        finalizeMockAttemptSubmission(
          state,
          attempt,
          attempt.status === "EXPIRED" ? "EXPIRED" : "SUBMITTED",
        );
      }
      return { handled: true, data: attempt.result as T };
    }

    if (subRoute === "review" && method === "GET") {
      if (!attempt.result) mockNotFound("Chưa có kết quả cho lượt làm bài này.");
      if (!attempt.result.answerReviewAvailable) {
        throw new ApiError({
          statusCode: 403,
          code: "ANSWER_REVIEW_LOCKED",
          message:
            attempt.result.answerReviewLockedReason ??
            "Đáp án và giải thích chỉ mở khóa khi đạt từ 70% trở lên.",
        });
      }
      return {
        handled: true,
        data: {
          attemptId: attempt.attemptId,
          testId: attempt.testId,
          testTitle: attempt.testTitle,
          skill: attempt.skill,
          answerReviewAvailable: true,
          items: attempt.reviewItems ?? [],
        } as T,
      };
    }
  }

  const attemptDetailMatch = /^\/exam-attempts\/([^/]+)$/.exec(pathname);
  if (method === "GET" && attemptDetailMatch) {
    const attempt = state.attempts[attemptDetailMatch[1]!];
    if (!attempt) mockNotFound("Không tìm thấy lượt làm bài.");
    if (attempt.status === "IN_PROGRESS" && Date.parse(attempt.expiresAt) <= Date.now()) {
      finalizeMockAttemptSubmission(state, attempt, "EXPIRED");
    }
    return { handled: true, data: toAttemptDetail(attempt) as T };
  }

  // -------------------------------------------------------------------------
  // Student & Teacher Reading Translations (Passage-Scoped V2)
  // -------------------------------------------------------------------------
  if (method === "GET" && pathname === "/reading-translations/eligibility") {
    const testId = sp.get("testId") ?? "";
    const test = state.tests.find((t) => t.id === testId && t.skill === "READING");
    if (!test) mockNotFound("Không tìm thấy đề Reading tương ứng.");

    const unlockedMap = state.unlockedPassagesByStudent[currentUser.id] ?? {};
    const fullTestPassed = Object.values(state.attempts).some(
      (a) =>
        a.studentId === currentUser.id &&
        a.testId === test.id &&
        a.mode === "FULL" &&
        a.result?.passed === true,
    );

    const passages: ReadingTranslationPassageEligibility[] = test.parts.map((p) => {
      const unlockedAttemptId = unlockedMap[p.id] ?? null;
      const eligible = Boolean(unlockedAttemptId) || fullTestPassed;
      const existing = state.passageTranslations[`${currentUser.id}::${p.id}`];
      const status = !eligible
        ? "LOCKED"
        : existing
          ? existing.status
          : "UNLOCKED";
      return {
        passageId: p.id,
        partNumber: p.partNumber,
        passageTitle: p.passageTitle ?? p.title,
        eligible,
        unlockedByAttemptId: unlockedAttemptId,
        unlockedAt: unlockedAttemptId ? "2026-11-10T10:15:00.000Z" : null,
        status,
        lockReason: eligible
          ? null
          : "Hãy hoàn thành tối thiểu 70% ở Passage này hoặc Full Test để mở khóa dịch.",
        updatedAt: existing?.updatedAt ?? null,
        submittedAt: existing?.submittedAt ?? null,
        reviewedAt: existing?.reviewedAt ?? null,
      };
    });

    const resp: ReadingTranslationEligibilityResponse = {
      testId: test.id,
      testTitle: test.title,
      passThresholdPercent: PASS_SCORE_THRESHOLD,
      fullTestPassed,
      passages,
    };
    return { handled: true, data: resp as T };
  }

  const passageTransActionMatch =
    /^\/reading-translations\/([^/]+)(?:\/(draft|submit))?$/.exec(pathname);
  if (passageTransActionMatch && pathname !== "/reading-translations/eligibility") {
    const passageId = passageTransActionMatch[1]!;
    const action = passageTransActionMatch[2];

    const ownerTest = state.tests.find(
      (t) => t.skill === "READING" && t.parts.some((p) => p.id === passageId),
    );
    const ownerPart = ownerTest?.parts.find((p) => p.id === passageId);
    if (!ownerTest || !ownerPart) mockNotFound("Không tìm thấy Passage Reading.");

    const unlockedMap = state.unlockedPassagesByStudent[currentUser.id] ?? {};
    const unlockedByAttemptId = unlockedMap[passageId] ?? null;
    if (!unlockedByAttemptId) {
      throw new ApiError({
        statusCode: 403,
        code: "TRANSLATION_LOCKED",
        message: "Passage này chưa được mở khóa dịch. Hãy đạt từ 70% trở lên trước khi dịch.",
      });
    }

    const key = `${currentUser.id}::${passageId}`;
    let record = state.passageTranslations[key];
    if (!record) {
      record = {
        translationId: `mtr-${Date.now()}`,
        studentId: currentUser.id,
        studentName: currentUser.fullName,
        studentEmail: currentUser.email,
        testId: ownerTest.id,
        testTitle: ownerTest.title,
        passageId: ownerPart.id,
        partNumber: ownerPart.partNumber,
        passageTitle: ownerPart.passageTitle ?? ownerPart.title,
        passageHtml: ownerPart.passageHtml ?? "",
        paragraphs: ownerPart.paragraphs,
        status: "DRAFT",
        revision: 1,
        textVi: "",
        teacherFeedback: null,
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date().toISOString(),
        submittedAt: null,
        unlockedByAttemptId,
        studentAssignmentId: null,
        assignmentTitle: null,
        courseTitle: null,
      };
      state.passageTranslations[key] = record;
    }

    if (!action && method === "GET") {
      const detail: ReadingTranslationDetail = {
        id: record.translationId,
        testId: record.testId,
        testTitle: record.testTitle,
        passageId: record.passageId,
        partNumber: record.partNumber,
        passageTitle: record.passageTitle,
        passageHtml: record.passageHtml,
        paragraphs: record.paragraphs,
        status: record.status,
        revision: record.revision,
        textVi: record.textVi,
        teacherFeedback: record.teacherFeedback,
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt,
        updatedAt: record.updatedAt,
        submittedAt: record.submittedAt,
        studentAssignmentId: record.studentAssignmentId,
      };
      return { handled: true, data: detail as T };
    }

    if (action === "draft" && method === "PUT") {
      if (record.status === "SUBMITTED" || record.status === "REVIEWED") {
        throw new ApiError({
          statusCode: 409,
          code: "ATTEMPT_ALREADY_SUBMITTED",
          message: "Bản dịch đã được nộp và đang ở chế độ chỉ đọc.",
        });
      }
      const req = body as SaveReadingTranslationDraftRequest;
      record.textVi = req.textVi;
      record.revision = (req.revision ?? record.revision) + 1;
      record.status = "DRAFT";
      record.updatedAt = new Date().toISOString();
      return {
        handled: true,
        data: {
          id: record.translationId,
          testId: record.testId,
          testTitle: record.testTitle,
          passageId: record.passageId,
          partNumber: record.partNumber,
          passageTitle: record.passageTitle,
          passageHtml: record.passageHtml,
          paragraphs: record.paragraphs,
          status: record.status,
          revision: record.revision,
          textVi: record.textVi,
          teacherFeedback: record.teacherFeedback,
          reviewedBy: record.reviewedBy,
          reviewedAt: record.reviewedAt,
          updatedAt: record.updatedAt,
          submittedAt: record.submittedAt,
        } as T,
      };
    }

    if (action === "submit" && method === "POST") {
      const req = body as SubmitReadingTranslationRequest;
      record.textVi = req.textVi;
      record.status = "SUBMITTED";
      record.revision += 1;
      record.submittedAt = new Date().toISOString();
      record.updatedAt = record.submittedAt;
      return {
        handled: true,
        data: {
          id: record.translationId,
          testId: record.testId,
          testTitle: record.testTitle,
          passageId: record.passageId,
          partNumber: record.partNumber,
          passageTitle: record.passageTitle,
          passageHtml: record.passageHtml,
          paragraphs: record.paragraphs,
          status: record.status,
          revision: record.revision,
          textVi: record.textVi,
          teacherFeedback: record.teacherFeedback,
          reviewedBy: record.reviewedBy,
          reviewedAt: record.reviewedAt,
          updatedAt: record.updatedAt,
          submittedAt: record.submittedAt,
        } as T,
      };
    }
  }

  if (method === "GET" && pathname === "/teacher/reading-translations") {
    const statusFilter = sp.get("status");
    const testIdFilter = sp.get("testId");
    let items: TeacherReadingTranslationItem[] = Object.values(state.passageTranslations).map(
      (r) => ({
        translationId: r.translationId,
        studentId: r.studentId,
        studentName: r.studentName,
        studentEmail: r.studentEmail,
        testId: r.testId,
        testTitle: r.testTitle,
        passageId: r.passageId,
        partNumber: r.partNumber,
        passageTitle: r.passageTitle,
        passageHtml: r.passageHtml,
        paragraphs: r.paragraphs,
        status: r.status,
        textVi: r.textVi,
        teacherFeedback: r.teacherFeedback,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
        submittedAt: r.submittedAt,
        unlockedByAttemptId: r.unlockedByAttemptId,
        assignmentTitle: r.assignmentTitle,
        courseTitle: r.courseTitle,
      }),
    );
    if (statusFilter) {
      items = items.filter((item) => item.status === statusFilter);
    }
    if (testIdFilter) {
      items = items.filter((item) => item.testId === testIdFilter);
    }
    return { handled: true, data: paginate(items, sp) as T };
  }

  const teacherTransReviewMatch = /^\/teacher\/reading-translations\/([^/]+)\/review$/.exec(
    pathname,
  );
  if (method === "POST" && teacherTransReviewMatch) {
    const translationId = teacherTransReviewMatch[1]!;
    const record = Object.values(state.passageTranslations).find(
      (r) => r.translationId === translationId,
    );
    if (!record) mockNotFound("Không tìm thấy bài dịch của học viên.");
    const req = body as ReviewReadingTranslationRequest;
    record.status = req.decision === "NEEDS_REVISION" ? "DRAFT" : "REVIEWED";
    record.teacherFeedback = req.feedback;
    record.reviewedBy = currentUser.fullName;
    record.reviewedAt = new Date().toISOString();
    return {
      handled: true,
      data: {
        translationId: record.translationId,
        studentId: record.studentId,
        studentName: record.studentName,
        studentEmail: record.studentEmail,
        testId: record.testId,
        testTitle: record.testTitle,
        passageId: record.passageId,
        partNumber: record.partNumber,
        passageTitle: record.passageTitle,
        passageHtml: record.passageHtml,
        paragraphs: record.paragraphs,
        status: record.status,
        textVi: record.textVi,
        teacherFeedback: record.teacherFeedback,
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt,
        submittedAt: record.submittedAt,
        unlockedByAttemptId: record.unlockedByAttemptId,
      } as T,
    };
  }

  // -------------------------------------------------------------------------
  // Teacher Question Bank & Builders (/teacher/exam-tests/*)
  // -------------------------------------------------------------------------
  if (method === "GET" && pathname === "/teacher/exam-tests") {
    const skill = sp.get("skill");
    const status = sp.get("status");
    const search = sp.get("search")?.trim().toLowerCase();
    let list = [...state.tests];
    if (skill) list = list.filter((t) => t.skill === skill);
    if (status) list = list.filter((t) => t.status === status);
    if (search) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(search) ||
          (t.subtitle?.toLowerCase().includes(search) ?? false) ||
          t.tags.some((tag) => tag.toLowerCase().includes(search)),
      );
    }
    return { handled: true, data: paginate(list.map(summarizeTest), sp) as T };
  }

  if (method === "POST" && pathname === "/teacher/exam-tests") {
    const req = body as CreateTeacherExamTestRequest;
    const nowIso = new Date().toISOString();
    const created: ExamTestDetailAuthoring = {
      id: `exam-${req.skill.toLowerCase()}-${Date.now()}`,
      title: req.title,
      subtitle: req.subtitle,
      skill: req.skill,
      status: "DRAFT",
      version: 1,
      partCount: 0,
      totalQuestions: 0,
      totalDurationSeconds: req.totalDurationSeconds ?? (req.skill === "READING" ? 3600 : 1800),
      difficulty: req.difficulty ?? "TARGET_65",
      tags: req.tags ?? [],
      allowedModes: req.allowedModes ?? ["PART", "FULL"],
      instructions: req.instructions,
      createdBy: { id: currentUser.id, fullName: currentUser.fullName },
      parts: [],
      updatedAt: nowIso,
    };
    state.tests.unshift(created);
    return { handled: true, data: created as T };
  }

  const teacherPartGroupMatch =
    /^\/teacher\/exam-tests\/([^/]+)\/parts\/([^/]+)\/question-groups$/.exec(pathname);
  if (method === "POST" && teacherPartGroupMatch) {
    const test = state.tests.find((t) => t.id === teacherPartGroupMatch[1]);
    if (!test) mockNotFound("Không tìm thấy đề thi.");
    if (test.status === "PUBLISHED") {
      throw new ApiError({
        statusCode: 409,
        code: "EXAM_VERSION_CONFLICT",
        message: "Đề đã xuất bản không thể thêm nhóm câu hỏi trực tiếp. Hãy tạo phiên bản mới.",
      });
    }
    const part = test.parts.find((p) => p.id === teacherPartGroupMatch[2]);
    if (!part) mockNotFound("Không tìm thấy phần thi.");
    const req = body as UpsertExamQuestionGroupInput;
    const groupId = req.id ?? `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const group: ExamQuestionGroupAuthoring = {
      id: groupId,
      partId: part.id,
      groupNumber: req.groupNumber,
      title: req.title,
      instructionHtml: req.instructionHtml,
      questionType: req.questionType,
      questionNumberStart: 1,
      questionNumberEnd: req.questions.length,
      sharedOptions: req.sharedOptions,
      summaryTemplateHtml: req.summaryTemplateHtml,
      diagramImageUrl: req.diagramImageUrl,
      maxWords: req.maxWords,
      maxSelections: req.maxSelections,
      questions: req.questions.map((q, idx) => ({
        ...q,
        id: q.id ?? `q-${Date.now()}-${idx}`,
        groupId,
      })),
    };
    part.questionGroups.push(group);
    recomputeTestMetrics(test);
    return { handled: true, data: group as T };
  }

  const teacherGroupEditMatch =
    /^\/teacher\/exam-tests\/([^/]+)\/question-groups\/([^/]+)$/.exec(pathname);
  if (teacherGroupEditMatch) {
    const test = state.tests.find((t) => t.id === teacherGroupEditMatch[1]);
    if (!test) mockNotFound("Không tìm thấy đề thi.");
    if (test.status === "PUBLISHED") {
      throw new ApiError({
        statusCode: 409,
        code: "EXAM_VERSION_CONFLICT",
        message: "Đề đã xuất bản không thể sửa câu hỏi trực tiếp.",
      });
    }
    const groupId = teacherGroupEditMatch[2]!;
    for (const part of test.parts) {
      const idx = part.questionGroups.findIndex((g) => g.id === groupId);
      if (idx !== -1) {
        if (method === "DELETE") {
          part.questionGroups.splice(idx, 1);
          recomputeTestMetrics(test);
          return { handled: true, data: { ok: true } as T };
        }
        if (method === "PATCH") {
          const patch = body as Partial<UpsertExamQuestionGroupInput>;
          const current = part.questionGroups[idx]!;
          part.questionGroups[idx] = {
            ...current,
            ...patch,
            questions: patch.questions
              ? patch.questions.map((q, qIdx) => ({
                  ...q,
                  id: q.id ?? `q-${Date.now()}-${qIdx}`,
                  groupId: current.id,
                }))
              : current.questions,
          };
          recomputeTestMetrics(test);
          return { handled: true, data: part.questionGroups[idx] as T };
        }
      }
    }
    mockNotFound("Không tìm thấy nhóm câu hỏi.");
  }

  const teacherPartMatch = /^\/teacher\/exam-tests\/([^/]+)\/parts(?:\/([^/]+))?$/.exec(
    pathname,
  );
  if (teacherPartMatch) {
    const test = state.tests.find((t) => t.id === teacherPartMatch[1]);
    if (!test) mockNotFound("Không tìm thấy đề thi.");
    const partId = teacherPartMatch[2];
    if (!partId && method === "POST") {
      if (test.status === "PUBLISHED") {
        throw new ApiError({
          statusCode: 409,
          code: "EXAM_VERSION_CONFLICT",
          message: "Đề đã xuất bản không thể thêm Passage/Section trực tiếp.",
        });
      }
      const req = body as UpsertExamPartInput;
      const newPartId = `part-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const groups: ExamQuestionGroupAuthoring[] = (req.questionGroups ?? []).map((g, gIdx) => {
        const gId = g.id ?? `grp-${Date.now()}-${gIdx}`;
        return {
          id: gId,
          partId: newPartId,
          groupNumber: g.groupNumber || gIdx + 1,
          title: g.title,
          instructionHtml: g.instructionHtml,
          questionType: g.questionType,
          questionNumberStart: 1,
          questionNumberEnd: g.questions.length,
          sharedOptions: g.sharedOptions,
          summaryTemplateHtml: g.summaryTemplateHtml,
          diagramImageUrl: g.diagramImageUrl,
          maxWords: g.maxWords,
          maxSelections: g.maxSelections,
          questions: g.questions.map((q, qIdx) => ({
            ...q,
            id: q.id ?? `q-${Date.now()}-${gIdx}-${qIdx}`,
            groupId: gId,
          })),
        };
      });
      const createdPart: ExamPartAuthoring = {
        id: newPartId,
        partNumber: req.partNumber || test.parts.length + 1,
        partType: req.partType,
        title: req.title,
        instructions: req.instructions,
        passageTitle: req.passageTitle,
        passageHtml: req.passageHtml,
        paragraphs: req.paragraphs,
        audioAsset: req.audioAsset,
        durationSeconds: req.durationSeconds,
        transcript: req.transcript,
        sourcePartId: req.sourcePartId,
        questionCount: 0,
        questionNumberRange: { start: 1, end: 1 },
        questionGroups: groups,
      };
      test.parts.push(createdPart);
      recomputeTestMetrics(test);
      return { handled: true, data: createdPart as T };
    }
    if (partId) {
      const partIdx = test.parts.findIndex((p) => p.id === partId);
      if (partIdx === -1) mockNotFound("Không tìm thấy Passage/Section.");
      if (test.status === "PUBLISHED") {
        throw new ApiError({
          statusCode: 409,
          code: "EXAM_VERSION_CONFLICT",
          message: "Đề đã xuất bản không thể chỉnh sửa nội dung Passage/Section.",
        });
      }
      if (method === "DELETE") {
        test.parts.splice(partIdx, 1);
        recomputeTestMetrics(test);
        return { handled: true, data: { ok: true } as T };
      }
      if (method === "PATCH") {
        const patch = body as Partial<UpsertExamPartInput>;
        const current = test.parts[partIdx]!;
        test.parts[partIdx] = {
          ...current,
          partNumber: patch.partNumber ?? current.partNumber,
          partType: patch.partType ?? current.partType,
          title: patch.title ?? current.title,
          instructions: patch.instructions ?? current.instructions,
          passageTitle: patch.passageTitle ?? current.passageTitle,
          passageHtml: patch.passageHtml ?? current.passageHtml,
          paragraphs: patch.paragraphs ?? current.paragraphs,
          audioAsset: patch.audioAsset ?? current.audioAsset,
          durationSeconds: patch.durationSeconds ?? current.durationSeconds,
          transcript: patch.transcript ?? current.transcript,
        };
        recomputeTestMetrics(test);
        return { handled: true, data: test.parts[partIdx] as T };
      }
    }
  }

  const teacherActionMatch =
    /^\/teacher\/exam-tests\/([^/]+)(?:\/(validate|preview|publish|new-version|archive))?$/.exec(
      pathname,
    );
  if (teacherActionMatch) {
    const test = state.tests.find((t) => t.id === teacherActionMatch[1]);
    if (!test) mockNotFound("Không tìm thấy đề thi trong ngân hàng đề.");
    const action = teacherActionMatch[2];

    if (!action && method === "GET") {
      return { handled: true, data: test as T };
    }
    if (!action && method === "PATCH") {
      if (test.status === "PUBLISHED") {
        throw new ApiError({
          statusCode: 409,
          code: "EXAM_VERSION_CONFLICT",
          message: "Đề đã xuất bản ở trạng thái bất biến. Hãy tạo phiên bản mới để chỉnh sửa.",
        });
      }
      const patch = body as UpdateTeacherExamTestRequest;
      Object.assign(test, patch, { updatedAt: new Date().toISOString() });
      return { handled: true, data: test as T };
    }
    if (action === "validate" && method === "POST") {
      return { handled: true, data: validateAuthoringTest(test) as T };
    }
    if (action === "preview" && method === "GET") {
      const preview: ExamTestDetailStudent = {
        ...summarizeTest(test),
        instructions: test.instructions,
        parts: test.parts.map(stripPartForStudent),
        activeAttempt: null,
      };
      return { handled: true, data: preview as T };
    }
    if (action === "publish" && method === "POST") {
      const check = validateAuthoringTest(test);
      if (!check.valid) {
        throw new ApiError({
          statusCode: 422,
          code: "EXAM_PUBLISH_VALIDATION_FAILED",
          message: check.errors[0]?.message ?? "Đề thi chưa đủ điều kiện xuất bản.",
        });
      }
      test.status = "PUBLISHED";
      test.publishedAt = new Date().toISOString();
      test.updatedAt = test.publishedAt;
      return { handled: true, data: test as T };
    }
    if (action === "new-version" && method === "POST") {
      const baseId = test.id.replace(/-v\d+$/, "");
      const maxVer = state.tests
        .filter((t) => t.id === baseId || t.id.startsWith(`${baseId}-v`))
        .reduce((max, item) => Math.max(max, item.version), test.version);
      const nextVer = maxVer + 1;
      const nowIso = new Date().toISOString();
      const cloned: ExamTestDetailAuthoring = {
        ...structuredClone(test),
        id: `${baseId}-v${nextVer}`,
        version: nextVer,
        status: "DRAFT",
        publishedAt: undefined,
        updatedAt: nowIso,
      };
      state.tests.unshift(cloned);
      return { handled: true, data: cloned as T };
    }
    if (action === "archive" && method === "POST") {
      test.status = "ARCHIVED";
      test.updatedAt = new Date().toISOString();
      return { handled: true, data: test as T };
    }
  }

  return { handled: false };
}
