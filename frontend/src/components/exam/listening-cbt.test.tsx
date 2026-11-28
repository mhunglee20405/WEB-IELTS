import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ListeningExamView } from "./listening-exam-view";
import { ListeningTestBuilder } from "@/components/teacher/listening-test-builder";
import { createEmptyDraftPart, syncListeningPartsBlanks, type DraftPart } from "@/components/teacher/exam-builder-types";
import { normalizeGroupBlanks, parseSlashAnswers } from "@/lib/exam/listening-template";
import type { ExamAnswerValue, ExamPartPublic } from "@/lib/api/types";

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isMockApiMode: () => true,
  };
});

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("IELTS Listening Template Sync & Builder / Student CBT Views", () => {
  it("normalizes blanks sequentially across groups & recordings and preserves UIDs on deletion", () => {
    const html1 =
      '<p>Name: <span class="ielts-blank blank-uid-a1">(1)_____</span>, Fee: <span class="ielts-blank blank-uid-a2">(2)_____</span>, Room: <span class="ielts-blank blank-uid-a3">(3)_____</span></p>';

    const res1 = normalizeGroupBlanks(html1, 1);
    expect(res1.tokens).toEqual([
      { uid: "a1", questionNumber: 1 },
      { uid: "a2", questionNumber: 2 },
      { uid: "a3", questionNumber: 3 },
    ]);
    expect(res1.nextNumber).toBe(4);

    // Delete middle blank a2 -> a3 renumbers to (2)_____ while keeping its UID "a3"
    const htmlAfterDelete =
      '<p>Name: <span class="ielts-blank blank-uid-a1">(1)_____</span>, Room: <span class="ielts-blank blank-uid-a3">(3)_____</span></p>';
    const res2 = normalizeGroupBlanks(htmlAfterDelete, 1);
    expect(res2.tokens).toEqual([
      { uid: "a1", questionNumber: 1 },
      { uid: "a3", questionNumber: 2 },
    ]);
    expect(res2.html).toContain("(2)_____");

    // Multi-recording sequential numbering
    const part1 = createEmptyDraftPart("LISTENING", 0);
    const part2 = createEmptyDraftPart("LISTENING", 1);
    const synced = syncListeningPartsBlanks([part1, part2]);
    expect(synced[0]!.groups[0]!.summaryTemplateHtml).toContain("(1)_____");
    expect(synced[0]!.groups[0]!.summaryTemplateHtml).toContain("(2)_____");
    expect(synced[1]!.groups[0]!.summaryTemplateHtml).toContain("(3)_____");
    expect(synced[1]!.groups[0]!.summaryTemplateHtml).toContain("(4)_____");
  });

  it("parses slash-separated accepted answers cleanly", () => {
    const parsed = parseSlashAnswers("grey / gray / light grey", "NOTE_COMPLETION");
    expect(parsed.primary).toBe("grey");
    expect(parsed.accepted).toEqual(["grey", "gray", "light grey"]);
  });

  it("allows teacher to manage 4 Recordings, sync answers on the right, and launch Student Preview modal", async () => {
    function TeacherHarness() {
      const [parts, setParts] = useState<DraftPart[]>([createEmptyDraftPart("LISTENING", 0)]);
      return (
        <ListeningTestBuilder
          testTitle="Cambridge Listening Test 01"
          parts={parts}
          setParts={setParts}
          isPublishedLocked={false}
          uploadPercent={{}}
          previewAudioUrl={{}}
          onAudioFileChange={vi.fn()}
          onSetPreviewAudioUrl={vi.fn()}
          onError={vi.fn()}
          markDirty={vi.fn()}
        />
      );
    }

    renderWithQuery(<TeacherHarness />);

    expect(screen.getByRole("tab", { name: /Recording 1/i })).toBeInTheDocument();
    // Add Recording 2
    fireEvent.click(screen.getByRole("button", { name: /Thêm Recording/i }));
    expect(screen.getByRole("tab", { name: /Recording 2/i })).toBeInTheDocument();

    // Right column has synced answer boxes 3 and 4 for Recording 2
    expect(screen.getByPlaceholderText(/Đáp án câu 3/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Đáp án câu 4/i)).toBeInTheDocument();

    // Open live Student Preview modal
    fireEvent.click(screen.getByTestId("listening-live-preview-btn"));
    expect(
      await screen.findByRole("dialog", { name: /Xem trước giao diện làm bài IELTS Listening/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Highlight nội dung/i).length).toBeGreaterThan(0);
  });

  it("renders Student 60/40 Listening CBT view with Highlight toggle, Recording 1-4 tabs, and preserves answers across tabs", () => {
    const mockParts: ExamPartPublic[] = [
      {
        id: "rec-1",
        partNumber: 1,
        partType: "SECTION",
        title: "Recording 1",
        audioAsset: {
          assetId: "audio-list-s1",
          playbackUrl: "/audio/ielts-listening-section1.wav",
          durationSeconds: 300,
          allowPause: true,
          allowSeek: true,
          maxPlayCount: null,
        },
        questionCount: 2,
        questionNumberRange: { start: 1, end: 2 },
        questionGroups: [
          {
            id: "grp-1",
            partId: "rec-1",
            groupNumber: 1,
            title: "Questions 1–2",
            instructionHtml: "<p>Write ONE WORD ONLY for each answer.</p>",
            summaryTemplateHtml:
              '<p><strong>Booking Form</strong></p><ul><li>Guest name: <span class="ielts-blank blank-uid-1">(1)_____</span></li><li>Arrival month: <span class="ielts-blank blank-uid-2">(2)_____</span></li></ul>',
            questionType: "NOTE_COMPLETION",
            questionNumberStart: 1,
            questionNumberEnd: 2,
            maxWords: 1,
            questions: [
              { id: "q-1", groupId: "grp-1", questionNumber: 1, prompt: "Guest name", questionType: "NOTE_COMPLETION", maxWords: 1 },
              { id: "q-2", groupId: "grp-1", questionNumber: 2, prompt: "Arrival month", questionType: "NOTE_COMPLETION", maxWords: 1 },
            ],
          },
        ],
      },
      {
        id: "rec-2",
        partNumber: 2,
        partType: "SECTION",
        title: "Recording 2",
        audioAsset: {
          assetId: "audio-list-s2",
          playbackUrl: "/audio/ielts-listening-section2.wav",
          durationSeconds: 300,
          allowPause: true,
          allowSeek: false,
          maxPlayCount: 2,
        },
        questionCount: 1,
        questionNumberRange: { start: 3, end: 3 },
        questionGroups: [
          {
            id: "grp-2",
            partId: "rec-2",
            groupNumber: 1,
            title: "Questions 3",
            instructionHtml: "<p>Complete the note.</p>",
            summaryTemplateHtml: '<p>Meet at the <span class="ielts-blank blank-uid-3">(3)_____</span>.</p>',
            questionType: "NOTE_COMPLETION",
            questionNumberStart: 3,
            questionNumberEnd: 3,
            maxWords: 1,
            questions: [
              { id: "q-3", groupId: "grp-2", questionNumber: 3, prompt: "Meeting point", questionType: "NOTE_COMPLETION", maxWords: 1 },
            ],
          },
        ],
      },
    ];

    function StudentHarness() {
      const [activePartId, setActivePartId] = useState("rec-1");
      const [answers, setAnswers] = useState<Record<string, ExamAnswerValue | undefined>>({});
      return (
        <ListeningExamView
          parts={mockParts}
          activePartId={activePartId}
          onSelectPart={setActivePartId}
          answers={answers}
          flaggedIds={new Set()}
          activeQuestionId={null}
          onAnswerChange={(qId, val) => setAnswers((prev) => ({ ...prev, [qId]: val }))}
        />
      );
    }

    renderWithQuery(<StudentHarness />);

    // Top toggle + Recording tabs present
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    expect(screen.getByRole("tab", { name: /Recording 1/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Recording 2/i })).toBeInTheDocument();

    // Type answer for Q1, switch to Recording 2, switch back to Recording 1 -> answer preserved
    const q1Input = screen.getByPlaceholderText(/Nhập đáp án câu 1/i) as HTMLInputElement;
    fireEvent.change(q1Input, { target: { value: "Henderson" } });
    expect(q1Input.value).toBe("Henderson");

    fireEvent.click(screen.getByRole("tab", { name: /Recording 2/i }));
    expect(screen.getByPlaceholderText(/Nhập đáp án câu 3/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Recording 1/i }));
    expect((screen.getByPlaceholderText(/Nhập đáp án câu 1/i) as HTMLInputElement).value).toBe(
      "Henderson",
    );
  });

  it("renders teacher-inserted diagrams and opens/closes fullscreen Lightbox on click and Escape", async () => {
    const partsWithDiagram: ExamPartPublic[] = [
      {
        id: "rec-img",
        partNumber: 2,
        partType: "SECTION",
        title: "Section 2: Campus Map",
        audioAsset: {
          assetId: "aud-img",
          playbackUrl: "/audio/ielts-listening-section2.wav",
          durationSeconds: 180,
          allowPause: true,
          allowSeek: true,
        },
        questionCount: 1,
        questionNumberRange: { start: 11, end: 11 },
        questionGroups: [
          {
            id: "grp-img",
            partId: "rec-img",
            groupNumber: 1,
            title: "Questions 11",
            instructionHtml: "<p>Label the map below.</p>",
            summaryTemplateHtml:
              '<p><img src="https://cdn.example.com/campus-map.png" alt="Campus Map" width="520" /></p><p>Library: <span class="ielts-blank blank-uid-img1">(11)_____</span></p>',
            questionType: "NOTE_COMPLETION",
            questionNumberStart: 11,
            questionNumberEnd: 11,
            maxWords: 1,
            questions: [
              {
                id: "q-11",
                groupId: "grp-img",
                questionNumber: 11,
                prompt: "Library",
                questionType: "NOTE_COMPLETION",
                maxWords: 1,
              },
            ],
          },
        ],
      },
    ];

    renderWithQuery(
      <ListeningExamView
        parts={partsWithDiagram}
        activePartId="rec-img"
        onSelectPart={vi.fn()}
        answers={{}}
        flaggedIds={new Set()}
        activeQuestionId={null}
        onAnswerChange={vi.fn()}
      />,
    );

    const diagramImg = await screen.findByAltText("Campus Map");
    expect(diagramImg).toHaveAttribute("src", "https://cdn.example.com/campus-map.png");

    fireEvent.click(diagramImg);
    const lightbox = screen.getByTestId("listening-image-lightbox");
    expect(lightbox).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("listening-image-lightbox")).not.toBeInTheDocument();
  });
});
