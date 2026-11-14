import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function submitLoginForm(page: Page, email: string, expectedUrlPattern: RegExp) {
  await page.getByLabel(/Email đăng nhập/i).fill(email);
  await page.locator("#password").fill("Student123!");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(expectedUrlPattern);
}

async function loginAs(page: Page, email: string, expectedUrlPattern: RegExp) {
  await page.goto("/login");
  await submitLoginForm(page, email, expectedUrlPattern);
}

async function logoutViaUi(page: Page) {
  await page.getByRole("button", { name: /Đăng xuất/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /Đăng xuất khỏi hệ thống\?/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function getShellLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const aside = document.querySelector("aside");
    const main = document.querySelector("main#main-content");
    const activeNav = document.querySelector(
      'nav[aria-label="Điều hướng chính"] a[aria-current="page"]',
    );
    const asideRect = aside?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const htmlStyle = window.getComputedStyle(document.documentElement);
    const activeStyle = activeNav ? window.getComputedStyle(activeNav) : null;
    return {
      viewportHeight: window.innerHeight,
      htmlOverflow: htmlStyle.overflow,
      asideWidth: asideRect ? Math.round(asideRect.width) : 0,
      asideLeft: asideRect ? Math.round(asideRect.left) : -1,
      asideRight: asideRect ? Math.round(asideRect.right) : -1,
      asideBottom: asideRect ? Math.round(asideRect.bottom) : 0,
      mainLeft: mainRect ? Math.round(mainRect.left) : -1,
      mainWidth: mainRect ? Math.round(mainRect.width) : 0,
      mainClientWidth: main ? main.clientWidth : 0,
      activeBg: activeStyle?.backgroundColor ?? "",
      activeWeight: activeStyle?.fontWeight ?? "",
      activeRadius: activeStyle?.borderRadius ?? "",
      activePadding: activeStyle?.padding ?? "",
    };
  });
}

async function assertZeroAxeViolations(page: Page, contextLabel: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations,
    `Axe violations found on ${contextLabel}: ${JSON.stringify(results.violations, null, 2)}`,
  ).toEqual([]);
}

test.describe("IELTS LMS Frontend End-to-End Verification", () => {
  test("enforces HTTP security headers, unauthenticated redirect, multi-role guard, keyboard navigation & Axe WCAG AA", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const loginResponse = await page.goto("/login");
    expect(loginResponse).not.toBeNull();
    const headers = loginResponse!.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");

    await expect(page).toHaveTitle(/Đăng nhập hệ thống \| IELTS Academic LMS/);
    await assertNoHorizontalOverflow(page);
    await assertZeroAxeViolations(page, "/login desktop");
    const loginCardBounds = await page.evaluate(() => {
      const canvas = document.querySelector(".lms-auth-canvas");
      const card = document.querySelector(".lms-auth-card");
      const devBar = document.querySelector(".lms-auth-devbar");
      const canvasRect = canvas?.getBoundingClientRect();
      const cardRect = card?.getBoundingClientRect();
      const devRect = devBar?.getBoundingClientRect();
      return {
        canvasCenterX: canvasRect ? canvasRect.left + canvasRect.width / 2 : 0,
        viewportHeight: window.innerHeight,
        cardCenterX: cardRect ? cardRect.left + cardRect.width / 2 : 0,
        devCenterX: devRect ? devRect.left + devRect.width / 2 : null,
        cardTop: cardRect ? cardRect.top : 0,
        cardBottom: cardRect ? cardRect.bottom : 0,
        devTop: devRect ? devRect.top : null,
      };
    });
    expect(Math.abs(loginCardBounds.cardCenterX - loginCardBounds.canvasCenterX)).toBeLessThanOrEqual(2);
    expect(loginCardBounds.cardTop).toBeGreaterThan(20);
    expect(loginCardBounds.cardBottom).toBeLessThan(loginCardBounds.viewportHeight);
    if (loginCardBounds.devTop !== null && loginCardBounds.devCenterX !== null) {
      expect(Math.abs(loginCardBounds.devCenterX - loginCardBounds.canvasCenterX)).toBeLessThanOrEqual(2);
      expect(loginCardBounds.devTop).toBeGreaterThanOrEqual(loginCardBounds.cardBottom + 20);
    }

    // Unauthenticated student route redirects to /login?next=...
    await page.goto("/student/assignments");
    await expect(page).toHaveURL(/\/login\?next=%2Fstudent%2Fassignments/);

    // Login as Student -> blocked from Teacher portal
    await page.getByLabel(/Email đăng nhập/i).fill("student@ielts.vn");
    await page.locator("#password").fill("Student123!");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/student\/assignments/);
    await expect(page).toHaveTitle(/Bài tập hằng ngày \| IELTS Academic LMS/);

    // Verify skip link focus works via keyboard Tab on desktop
    await page.keyboard.press("Tab");
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute("href"));
    expect(focusedHref).toBe("#main-content");

    // Student navigating to /teacher/dashboard hits /unauthorized
    await page.goto("/teacher/dashboard");
    await expect(page).toHaveURL(/\/unauthorized/);
    await expect(
      page.getByRole("heading", { name: /Bạn không có quyền truy cập trang này/i }),
    ).toBeVisible();
    await assertZeroAxeViolations(page, "/unauthorized");

    // Verify mobile viewport (375px) on Student Dashboard + mobile drawer Esc close
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/student/dashboard");
    await expect(page.getByRole("heading", { name: /Tổng quan học tập/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertZeroAxeViolations(page, "/student/dashboard mobile 375px");

    await page.getByRole("button", { name: "Mở menu điều hướng" }).click();
    await expect(page.getByRole("dialog", { name: "IELTS Academic LMS" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "IELTS Academic LMS" })).toBeHidden();

    // Filter out benign localhost 401 checks if any only occurred on expected 401/403 API flows
    const unexpectedErrors = consoleErrors.filter(
      (txt) => !txt.includes("status of 401") && !txt.includes("status of 403"),
    );
    expect(unexpectedErrors).toEqual([]);
  });

  test("enforces pre-open blocking, Reading < 70% lock -> >= 70% PASS unlock, Listening playback & Translation freeze flow", async ({
    page,
  }) => {
    await loginAs(page, "student@ielts.vn", /\/student\/dashboard/);

    // 1. Pre-open assignment sa-05 cannot access questions
    await page.goto("/student/assignments/sa-05");
    await expect(page.getByRole("heading", { name: /Bài tập chưa mở/i })).toBeVisible();

    // 2. Direct /review on unpassed sa-01 is gated (403 ANSWER_LOCKED)
    await page.goto("/student/assignments/sa-01/review");
    await expect(page.getByRole("heading", { name: /Đáp án chưa được mở khóa/i })).toBeVisible();

    // 3. Open Reading assignment sa-01 -> submit 50% (Q1 TRUE, Q2 TRUE) -> stays locked
    await page.goto("/student/assignments/sa-01");
    await expect(
      page.getByRole("heading", { name: "Urban Microclimates & Green Roofs" }),
    ).toBeVisible();
    await assertZeroAxeViolations(page, "/student/assignments/sa-01");

    await page.getByRole("group", { name: /Câu 1/i }).getByRole("radio", { name: "TRUE", exact: true }).check();
    await page.getByRole("group", { name: /Câu 2/i }).getByRole("radio", { name: "TRUE", exact: true }).check();

    await page.getByRole("button", { name: "Nộp bài" }).click();
    const confirmDialog = page.getByRole("dialog", { name: /Xác nhận nộp bài chấm điểm/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Nộp bài ngay" }).click();

    await expect(page.getByText(/Lần nộp #1: Đạt 50% \(CHƯA ĐẠT\)/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Mở đáp án chi tiết/i })).toHaveCount(0);

    // Dismiss retry banner & answer Q2 FALSE -> 100% PASS -> review & translation unlock!
    await page.getByRole("button", { name: /Tiếp tục sửa và làm lại/i }).click();
    await page.getByRole("group", { name: /Câu 2/i }).getByRole("radio", { name: "FALSE", exact: true }).check();

    await page.getByRole("button", { name: "Nộp bài" }).click();
    await page.getByRole("dialog", { name: /Xác nhận nộp bài chấm điểm/i }).getByRole("button", { name: "Nộp bài ngay" }).click();

    await expect(page.getByText(/Lần nộp #2: Đạt 100% \(ĐẠT\)/)).toBeVisible();
    await page.getByRole("link", { name: /Mở đáp án chi tiết/i }).click();

    await expect(page).toHaveURL(/\/student\/assignments\/sa-01\/review/);
    await expect(page.getByText("Đáp án chuẩn", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/sedum substrates giảm nhiệt độ/i)).toBeVisible();
    await assertZeroAxeViolations(page, "/student/assignments/sa-01/review");

    // 4. Translation draft + submit freeze flow
    await page.goto("/student/assignments/sa-01/translation");
    const draftBox = page.getByLabel(/Bản dịch tiếng Việt của bạn/i);
    await draftBox.fill(
      "Mái nhà xanh là lớp thảm thực vật kỹ thuật được lắp đặt trên các tòa nhà đô thị nhằm giảm dòng chảy nước mưa và dịu hiệu ứng đảo nhiệt.",
    );
    await page.getByRole("button", { name: /Lưu bản nháp/i }).click();
    await expect(page.getByRole("status")).toContainText(/nháp/i);

    await page.getByRole("button", { name: "Nộp bản dịch" }).click();
    await page.getByRole("dialog", { name: /Xác nhận nộp bản dịch chính thức/i }).getByRole("button", { name: /Nộp & Khóa chỉnh sửa/i }).click();
    await expect(draftBox).toHaveAttribute("readonly", "");

    // 5. Listening signed audio player verification on sa-02
    await page.goto("/student/assignments/sa-02");
    await expect(page.getByText(/Audio Listening bảo mật/i)).toBeVisible();
    await expect(page.locator("audio[controls]")).toBeVisible();
  });

  test("completes Student Extension -> Teacher Decision -> Teacher 1:1 guard -> Admin Audit flows", async ({
    page,
  }) => {
    // 1. Student requests extension on sa-03
    await loginAs(page, "student@ielts.vn", /\/student\/dashboard/);
    await page.goto("/student/extensions?studentAssignmentId=sa-03");
    await expect(page).toHaveTitle(/Xin gia hạn bài tập \| IELTS Academic LMS/);
    await page.getByLabel(/Lý do xin gia hạn/i).fill(
      "Em có lịch thi học kỳ buổi tối tại trường nên xin dời hạn sang cuối ngày mai.",
    );
    await page.getByRole("button", { name: /Gửi yêu cầu gia hạn/i }).click();
    await expect(page.getByRole("status")).toContainText(/Đã gửi yêu cầu gia hạn thành công/i);

    // 2. Teacher logs in, approves extension, and reviews student translation
    await logoutViaUi(page);
    await submitLoginForm(page, "teacher@ielts.vn", /\/teacher\/dashboard/);
    await assertZeroAxeViolations(page, "/teacher/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const dashboardLayoutMetrics = await getShellLayoutMetrics(page);
    expect(dashboardLayoutMetrics.htmlOverflow).toBe("hidden");
    expect(dashboardLayoutMetrics.asideLeft).toBe(0);
    expect(dashboardLayoutMetrics.asideWidth).toBe(256);
    expect(dashboardLayoutMetrics.asideBottom).toBeGreaterThanOrEqual(
      dashboardLayoutMetrics.viewportHeight - 1,
    );
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText(
      "© 2026 IELTS Academic LMS. All rights reserved.",
    );

    // Teacher courses UI/UX: fluid grid, standardized 256px full-viewport sidebar, zero horizontal shift vs tall pages & single-page pagination cleanup
    await page.goto("/teacher/courses");
    await expect(page).toHaveTitle(/Quản lý khóa học \| IELTS Academic LMS/);
    await expect(page.getByText("IELTS-FOUND-K12")).toBeVisible();
    await assertZeroAxeViolations(page, "/teacher/courses");
    await assertNoHorizontalOverflow(page);

    const coursesLayoutMetrics = await getShellLayoutMetrics(page);
    expect(coursesLayoutMetrics).toEqual(dashboardLayoutMetrics);

    await expect(page.getByRole("navigation", { name: "Phân trang" })).toHaveCount(0);
    await expect(page.getByText(/Hiển thị toàn bộ/i)).toBeVisible();
    await page.getByRole("searchbox").fill("FOUND");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByText("IELTS-FOUND-K12")).toBeVisible();
    await page.getByRole("button", { name: "Xóa từ khóa tìm kiếm" }).click();

    await page.goto("/teacher/extensions");
    await expect(page).toHaveTitle(/Duyệt yêu cầu gia hạn \| IELTS Academic LMS/);
    await page.getByRole("button", { name: /Phê duyệt/i }).first().click();
    const decisionModal = page.getByRole("dialog", { name: /Phê duyệt yêu cầu gia hạn/i });
    await expect(decisionModal).toBeVisible();
    await decisionModal
      .getByLabel(/Ghi chú phản hồi gửi học viên/i)
      .fill("Đồng ý gia hạn thêm 24 giờ cho bạn Minh Anh.");
    await decisionModal.getByRole("button", { name: "Xác nhận phê duyệt", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Đã phê duyệt gia hạn/i);

    // Teacher grades submitted translation tr-06 & verify zero-px layout shift and identical active menu styling across routes
    await page.goto("/teacher/translations");
    await expect(page.getByLabel(/Nhận xét sửa lỗi từ vựng/i)).toBeVisible();
    await assertZeroAxeViolations(page, "/teacher/translations");
    await assertNoHorizontalOverflow(page);
    const translationsLayoutMetrics = await getShellLayoutMetrics(page);
    expect(translationsLayoutMetrics).toEqual(dashboardLayoutMetrics);
    await page
      .getByLabel(/Nhận xét sửa lỗi từ vựng/i)
      .fill("Bản dịch sát nghĩa, thuật ngữ thoát hơi nước diễn đạt tự nhiên.");
    await page.getByRole("button", { name: /Gửi kết quả chấm dịch/i }).click();
    await expect(page.getByRole("status")).toContainText(/Đã chấm Đạt cho bản dịch/i);

    // 3. Multi-role Admin + Teacher verifies portal switcher, immutable sidebar width, 1:1 course guard, user creation & penalty reversal
    await logoutViaUi(page);
    await submitLoginForm(page, "admin@ielts.vn", /\/admin\/users/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await assertZeroAxeViolations(page, "/admin/users");
    const adminLayoutMetrics = await getShellLayoutMetrics(page);
    expect(adminLayoutMetrics).toEqual(dashboardLayoutMetrics);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);

    // Multi-role header switcher navigates to Teacher portal cleanly
    await page.getByRole("navigation", { name: "Chuyển cổng vai trò" }).getByRole("link", { name: "Giảng viên" }).click();
    await expect(page).toHaveURL(/\/teacher\/dashboard/);

    // 1:1 Course Limit check on crs-02 (Coaching 1:1 owned by adm-01 already has stu-01)
    await page.goto("/teacher/courses/crs-02/students");
    await expect(page.getByText(/Khóa học 1:1 đã đủ 1 học viên/i)).toBeVisible();
    await page.getByLabel(/Chọn học viên cần ghi danh/i).selectOption("stu-02");
    await page.getByRole("button", { name: /Thêm vào lớp/i }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(/1:1|tối đa 1/i);

    // Switch back to Admin Audit -> reverse active penalty pen-01
    await page.getByRole("navigation", { name: "Chuyển cổng vai trò" }).getByRole("link", { name: "Quản trị viên" }).click();
    await page.goto("/admin/audit");
    await assertZeroAxeViolations(page, "/admin/audit");
    await page.getByRole("button", { name: /Hoàn tác phạt/i }).first().click();
    const reverseModal = page.getByRole("dialog", { name: /Hoàn tác điểm phạt/i });
    await expect(reverseModal).toBeVisible();
    await reverseModal
      .getByLabel(/Lý do hoàn tác bắt buộc/i)
      .fill("Học viên đã nộp minh chứng gia hạn hợp lệ từ giáo vụ.");
    await reverseModal.getByRole("button", { name: /Xác nhận hoàn tác phạt/i }).click();
    await expect(page.getByRole("status")).toContainText(/Đã hoàn tác điểm phạt/i);
  });

  test("Phase 9 end-to-end: Student Practice Library -> Reading CBT Exam -> Conditional Translation & Listening, Teacher Question Bank -> Assignment v2 -> Passage Grading", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Student navigates via "Luyện thi IELTS" to Practice Library & selects Exam
    await loginAs(page, "student@ielts.vn", /\/student\/dashboard/);
    const studentPracticeLink = page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link", { name: "Luyện thi IELTS" });
    await studentPracticeLink.click();
    await expect(page).toHaveURL(/\/student\/practice$/);
    await expect(page).toHaveTitle(/Thư viện luyện thi IELTS \| IELTS Academic LMS/);
    await expect(
      page.getByRole("heading", { name: /IELTS Academic Reading Full Test 01/i }),
    ).toBeVisible();
    await expect(studentPracticeLink).toHaveAttribute("aria-current", "page");
    await expect(studentPracticeLink).toHaveClass(/bg-blue-50/);
    await assertZeroAxeViolations(page, "/student/practice");
    await assertNoHorizontalOverflow(page);

    // Open Reading Test Detail -> choose Passage 2 in PART mode
    await page.goto("/student/practice/exam-read-full-01");
    await expect(
      page.getByRole("button", { name: /Wild Pollinator Corridors/i }),
    ).toBeVisible();
    await assertZeroAxeViolations(page, "/student/practice/exam-read-full-01");

    await page.getByRole("button", { name: /Wild Pollinator Corridors/i }).click();
    await page.getByTestId("start-exam-btn").click();
    await expect(page).toHaveURL(/\/student\/exam\/att-/);

    // Focused CBT Exam Shell hides main left sidebar & enforces Axe + zero horizontal overflow
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.getByText(/honeybees remain grounded/i)).toBeVisible();
    await assertZeroAxeViolations(page, "CBT Reading Exam active room");
    await assertNoHorizontalOverflow(page);

    // Answer Q6-Q10 accurately (100% PASS)
    await page.getByTestId("exam-question-6").getByRole("combobox").selectOption("i");
    await page.getByTestId("exam-question-7").getByRole("combobox").selectOption("iii");
    await page.getByTestId("exam-question-8").getByRole("textbox").fill("clover");
    await page.getByTestId("exam-question-9").getByRole("textbox").fill("18");
    await page.getByTestId("exam-question-10").locator('input[value="NO"]').check();

    // Open confirmation dialog and submit
    await page.getByTestId("exam-submit-open-btn").click();
    await expect(page.getByTestId("exam-submit-confirm-btn")).toBeVisible();
    await page.getByTestId("exam-submit-confirm-btn").click();
    await expect(page).toHaveURL(/\/student\/exam\/att-.*\/result$/);

    // Result screen: 100%, PASS badge, unlocked Answer Review, Conditional Translate CTA
    await expect(page.getByTestId("result-score-percent")).toHaveText("100%");
    await expect(page.getByTestId("answer-review-list")).toBeVisible();
    await expect(page.getByTestId("result-translate-cta")).toBeVisible();
    await assertZeroAxeViolations(page, "CBT Exam Result");
    await assertNoHorizontalOverflow(page);

    // Responsive mobile viewport verification (390x844) on Result + Practice Detail
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 720 });

    // Click Conditional Translate CTA -> Passage 2 Translation Workspace
    await page.getByTestId("result-translate-cta").click();
    await expect(page).toHaveURL(
      /\/student\/reading\/exam-read-full-01\/translate\/part-r1-p2$/,
    );
    await assertZeroAxeViolations(page, "Passage Translation Workspace");
    await assertNoHorizontalOverflow(page);

    // Verify switcher shows Passage 1 & 2 unlocked while Passage 3 remains locked
    const passageSwitcher = page.getByRole("navigation", {
      name: "Chọn Passage dịch",
    });
    await expect(passageSwitcher.getByText("Passage 3 (Khóa)")).toBeVisible();

    await page
      .locator("#translation-vi-editor")
      .fill(
        "Trong nhiều thập kỷ, các chủ vườn cây ăn quả chủ yếu phụ thuộc vào các tổ ong mật nuôi được vận chuyển theo mùa, nhưng khảo sát cho thấy ong hoang dã thụ phấn hiệu quả hơn vào buổi sáng gió lạnh.",
      );
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page.getByRole("status")).toContainText(/Đã lưu bản nháp/i);
    await page.getByTestId("translation-submit-btn").click();
    await expect(page.getByText("Đã nộp chờ duyệt").first()).toBeVisible();

    // Launch Listening Test -> verify audio player renders cleanly without leaked transcript
    await page.goto("/student/practice/exam-list-full-01");
    await page.getByTestId("start-exam-btn").click();
    await expect(page).toHaveURL(/\/student\/exam\/att-/);
    await expect(page.getByTestId("exam-listening-player")).toBeVisible();
    await expect(
      page.getByTestId("exam-listening-player").locator("audio[controls]"),
    ).toBeVisible();
    await expect(page.getByText(/TEACHER ONLY TRANSCRIPT/i)).toHaveCount(0);
    await assertZeroAxeViolations(page, "CBT Listening Exam active room");

    // Exit CBT view via header back/logout workflow
    await page.goto("/student/dashboard");
    await logoutViaUi(page);

    // 2. Teacher logs in -> Question Bank -> Preview -> Full Test Builder -> New Assignment v2 -> Passage Grading
    await submitLoginForm(page, "teacher@ielts.vn", /\/teacher\/dashboard/);
    const teacherBankLink = page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link", { name: "Kho đề thi IELTS" });
    await teacherBankLink.click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveURL(/\/teacher\/question-bank$/);
    await expect(
      page.getByText(/IELTS Academic Reading Full Test 01/i),
    ).toBeVisible();
    await expect(teacherBankLink).toHaveAttribute("aria-current", "page");
    await expect(teacherBankLink).toHaveClass(/bg-blue-50/);
    await assertZeroAxeViolations(page, "/teacher/question-bank");
    await assertNoHorizontalOverflow(page);

    // Student-safe preview hides transcripts & answers
    await page.goto("/teacher/question-bank/exam-list-full-01/preview");
    await expect(
      page.getByText(/Đáp án và Transcript của Giảng viên đã được ẩn hoàn toàn/i),
    ).toBeVisible();
    await expect(page.getByText(/TEACHER ONLY TRANSCRIPT/i)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    // Full test builder renders parts pool cleanly
    await page.goto("/teacher/question-bank/full-test-builder");
    await expect(page.getByText(/Vertical Farming/i)).toBeVisible();
    await assertZeroAxeViolations(page, "/teacher/question-bank/full-test-builder");

    // Create Assignment v2 with PART scope & requiredPartId
    await page.goto("/teacher/assignments/new");
    await page.getByLabel(/Chọn khóa học/i).selectOption("crs-01");
    await page.getByLabel(/Chọn đề đã xuất bản/i).selectOption("exam-read-full-01");
    await expect(page.getByText(/Cấu hình phạm vi đề thi IELTS v2/i)).toBeVisible();
    await page.getByRole("radio", { name: /1 Part cụ thể/i }).check();
    await page.getByLabel(/Chọn Passage bắt buộc/i).selectOption("part-r1-p2");
    await page.getByRole("button", { name: /Xác nhận giao bài/i }).click();
    await expect(page).toHaveURL(/\/teacher\/assignments\/asg-/);

    // Grade submitted Passage Translation via v2 queue toggle
    await page.goto("/teacher/translations");
    await page.getByTestId("switch-v2-passage-translations").click();
    await expect(page.getByText(/Nguyễn Minh Anh/i).first()).toBeVisible();
    await page
      .getByLabel(/Nhận xét cho học viên/i)
      .first()
      .fill("Dịch sát thuật ngữ nông nghiệp bền vững và rất tự nhiên.");
    await page.getByRole("button", { name: /Lưu nhận xét Passage/i }).first().click();
    await expect(page.getByRole("status")).toContainText(/Đã chấm hoàn tất Passage/i);
    await assertZeroAxeViolations(page, "/teacher/translations v2");

    expect(
      consoleErrors.filter((msg) => !msg.includes("Failed to load resource")),
    ).toEqual([]);
  });
});

