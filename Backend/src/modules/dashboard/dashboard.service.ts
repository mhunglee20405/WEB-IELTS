import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import { Lesson, LessonDocument } from 'src/database/schemas/lesson.schema';
import {
  ExtensionRequest,
  ExtensionRequestDocument,
} from 'src/database/schemas/extension-request.schema';
import {
  PenaltyTransaction,
  PenaltyTransactionDocument,
} from 'src/database/schemas/penalty-transaction.schema';
import {
  Notification,
  NotificationDocument,
} from 'src/database/schemas/notification.schema';
import {
  TranslationSubmission,
  TranslationSubmissionDocument,
} from 'src/database/schemas/translation-submission.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from 'src/database/schemas/student-profile.schema';
import {
  TeacherProfile,
  TeacherProfileDocument,
} from 'src/database/schemas/teacher-profile.schema';
import { ExamTest, ExamTestDocument } from 'src/database/schemas/exam-test.schema';
import {
  CourseStatus,
  EnrollmentStatus,
  ExtensionRequestStatus,
  LessonStatus,
  StudentAssignmentStatus,
  TranslationSubmissionStatus,
  UserRole,
} from 'src/database/schemas/enums';
import {
  formatVnDateTime,
  createVnMonthBounds,
} from 'src/common/utils/timezone.util';
import { extractObjectId } from 'src/modules/submissions/submissions.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(StudentAssignment.name)
    private readonly studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(Lesson.name)
    private readonly lessonModel: Model<LessonDocument>,
    @InjectModel(ExtensionRequest.name)
    private readonly extensionModel: Model<ExtensionRequestDocument>,
    @InjectModel(PenaltyTransaction.name)
    private readonly penaltyModel: Model<PenaltyTransactionDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(TranslationSubmission.name)
    private readonly translationModel: Model<TranslationSubmissionDocument>,
    @InjectModel(StudentProfile.name)
    private readonly studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(TeacherProfile.name)
    private readonly teacherProfileModel: Model<TeacherProfileDocument>,
    @Optional()
    @InjectModel(ExamTest.name)
    private readonly examTestModel?: Model<ExamTestDocument>,
  ) {}

  private async countMonthlyExtensionsUsed(
    studentId: Types.ObjectId,
    now: Date,
  ): Promise<number> {
    const { startOfMonth, endOfMonth } = createVnMonthBounds(now);
    return this.extensionModel.countDocuments({
      studentId,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    });
  }

  private async getTeacherScopedData(
    teacher: UserDocument,
    courseIds: Types.ObjectId[],
    includeOverdueCount: boolean,
  ): Promise<{
    pendingExtensionsCount: number;
    pendingTranslationsCount: number;
    overdueStudentsCount: number;
    courseAssignments: AssignmentDocument[];
  }> {
    if (courseIds.length === 0) {
      return {
        pendingExtensionsCount: 0,
        pendingTranslationsCount: 0,
        overdueStudentsCount: 0,
        courseAssignments: [],
      };
    }

    const [courseAssignments, authoredTests] = await Promise.all([
      this.assignmentModel.find({ courseId: { $in: courseIds } }).exec(),
      this.examTestModel
        ? this.examTestModel
            .find(teacher.role === UserRole.ADMIN ? {} : { createdBy: teacher._id })
            .exec()
        : Promise.resolve([]),
    ]);

    const assignmentIds = courseAssignments.map((a) => a._id as Types.ObjectId);
    const usedTestIds = courseAssignments
      .flatMap((a) => [a.examTestId, a.exerciseId])
      .filter((id): id is Types.ObjectId => Boolean(id));
    const authoredTestIds = authoredTests.map((t) => t._id as Types.ObjectId);
    const authoredIdSet = new Set(authoredTestIds.map((id) => extractObjectId(id)));
    const sharedUsedTestIds = usedTestIds.filter(
      (id) => !authoredIdSet.has(extractObjectId(id)),
    );

    let enrolledStudentIds: Types.ObjectId[] = [];
    if (sharedUsedTestIds.length > 0 && teacher.role !== UserRole.ADMIN) {
      const enrollments = await this.enrollmentModel
        .find({ courseId: { $in: courseIds }, status: EnrollmentStatus.ACTIVE })
        .exec();
      enrolledStudentIds = enrollments.map((e) => e.studentId);
    }

    const translationOrConditions: Record<string, any>[] = [];
    if (assignmentIds.length > 0) {
      translationOrConditions.push({ assignmentId: { $in: assignmentIds } });
    }
    if (authoredTestIds.length > 0) {
      translationOrConditions.push({ testId: { $in: authoredTestIds } });
    }
    if (sharedUsedTestIds.length > 0) {
      if (teacher.role === UserRole.ADMIN) {
        translationOrConditions.push({ testId: { $in: sharedUsedTestIds } });
      } else if (enrolledStudentIds.length > 0) {
        translationOrConditions.push({
          testId: { $in: sharedUsedTestIds },
          studentId: { $in: enrolledStudentIds },
        });
      }
    }

    const [pendingExtensionsCount, pendingTranslationsCount, overdueStudentsCount] =
      await Promise.all([
        this.extensionModel.countDocuments({
          courseId: { $in: courseIds },
          status: ExtensionRequestStatus.PENDING,
        }),
        translationOrConditions.length === 0
          ? Promise.resolve(0)
          : this.translationModel.countDocuments({
              status: TranslationSubmissionStatus.SUBMITTED,
              $or: translationOrConditions,
            }),
        !includeOverdueCount || assignmentIds.length === 0
          ? Promise.resolve(0)
          : this.studentAssignmentModel.countDocuments({
              assignmentId: { $in: assignmentIds },
              status: StudentAssignmentStatus.OVERDUE,
            }),
      ]);

    return {
      pendingExtensionsCount,
      pendingTranslationsCount,
      overdueStudentsCount,
      courseAssignments,
    };
  }

  async getStudentDashboard(student: UserDocument) {
    const now = new Date();
    const todayKey = formatVnDateTime(now).slice(0, 10);
    const nowMs = now.getTime();

    // 1. Student assignments
    const saDocs = await this.studentAssignmentModel
      .find({ studentId: student._id })
      .populate({
        path: 'assignmentId',
        populate: [
          { path: 'courseId', select: 'code title' },
          { path: 'exerciseId', select: 'title type passScore' },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();

    const submittedAtBySaId = new Map<string, string>();
    const formattedAssignments = saDocs
      .filter((sa: any) => sa.assignmentId)
      .map((sa: any) => {
        const asg = sa.assignmentId;
        const crs = asg.courseId;
        const exe = asg.exerciseId;
        const targetScore = asg.targetScorePercent ?? 70;
        const passed = Boolean(
          sa.isTargetAchieved ||
          sa.status === StudentAssignmentStatus.PASSED ||
          (sa.bestScore !== undefined && sa.bestScore !== null && sa.bestScore >= targetScore),
        );
        const openAt = asg.openAt ? new Date(asg.openAt).toISOString() : new Date().toISOString();
        const dueAt = asg.deadlineAt ? new Date(asg.deadlineAt).toISOString() : new Date().toISOString();
        const effectiveDueAt = sa.effectiveDeadlineAt
          ? new Date(sa.effectiveDeadlineAt).toISOString()
          : dueAt;

        const saIdStr = extractObjectId(sa._id);
        const rawSubmittedAt = sa.lastSubmittedAt || sa.updatedAt || now;
        submittedAtBySaId.set(saIdStr, new Date(rawSubmittedAt).toISOString());

        return {
          id: saIdStr,
          studentAssignmentId: saIdStr,
          assignmentId: extractObjectId(asg._id),
          courseId: crs ? extractObjectId(crs._id || crs) : '',
          courseTitle: crs?.title || '',
          studentId: extractObjectId(student._id),
          studentName: student.fullName,
          title: asg.title,
          exerciseType: exe?.type || 'reading',
          assignedDate: asg.assignedDate || todayKey,
          openAt,
          dueAt,
          effectiveDueAt,
          timezone: 'Asia/Ho_Chi_Minh',
          status: sa.status,
          attemptsCount: sa.attemptsCount || 0,
          bestScore: sa.bestScore ?? null,
          passed,
          answerReviewUnlocked: passed,
          translationAvailable: passed && exe?.type === 'reading',
          translationStatus: sa.translationStatus || 'not_started',
          penaltyApplied: Boolean(sa.penaltyAppliedAt),
        };
      });

    const todayExercises = formattedAssignments.filter(
      (a) => a.assignedDate === todayKey,
    );
    const upcomingDeadlines = formattedAssignments.filter(
      (a) => !a.passed && Date.parse(a.openAt) <= nowMs,
    );

    // 2. Upcoming lessons for student enrolled courses
    const enrollments = await this.enrollmentModel
      .find({ studentId: student._id, status: EnrollmentStatus.ACTIVE })
      .exec();
    const enrolledCourseIds = enrollments.map((e) => e.courseId);

    const lessonDocs =
      enrolledCourseIds.length === 0
        ? []
        : await this.lessonModel
            .find({
              courseId: { $in: enrolledCourseIds },
              status: { $ne: LessonStatus.CANCELLED },
              endAt: { $gte: now },
            })
            .sort({ startAt: 1 })
            .limit(10)
            .exec();

    const upcomingLessons = lessonDocs.map((l: any) => ({
      id: extractObjectId(l._id),
      courseId: extractObjectId(l.courseId),
      title: l.title,
      description: l.content || l.description || '',
      content: l.content || '',
      meetUrl: l.meetUrl,
      meetingUrl: l.meetUrl,
      startAt: l.startAt ? l.startAt.toISOString() : undefined,
      endAt: l.endAt ? l.endAt.toISOString() : undefined,
      startTime: l.startAt ? l.startAt.toISOString() : '',
      endTime: l.endAt ? l.endAt.toISOString() : '',
      type: l.meetUrl ? 'live_meet' : 'workshop',
      status: l.status,
    }));

    // 3. Recent scores
    const recentScores = formattedAssignments
      .filter((a) => a.bestScore !== null)
      .slice(0, 5)
      .map((a) => ({
        studentAssignmentId: a.studentAssignmentId,
        title: a.title,
        score: a.bestScore!,
        passed: a.passed,
        submittedAt: submittedAtBySaId.get(a.studentAssignmentId) || now.toISOString(),
      }));

    // 4. Counts
    const [activePenaltiesCount, extensionsUsedThisMonth, unreadNotificationsCount] =
      await Promise.all([
        this.penaltyModel.countDocuments({
          studentId: student._id,
          deltaPoints: { $gt: 0 },
          isReversed: false,
        }),
        this.countMonthlyExtensionsUsed(student._id as Types.ObjectId, now),
        this.notificationModel.countDocuments({
          userId: student._id,
          isRead: false,
        }),
      ]);

    return {
      todayExercises,
      upcomingDeadlines,
      upcomingLessons,
      recentScores,
      activePenaltiesCount,
      extensionsUsedThisMonth,
      maxExtensionsPerMonth: 3,
      unreadNotificationsCount,
    };
  }

  async getTeacherDashboard(teacher: UserDocument) {
    const now = new Date();

    const courses = await this.courseModel
      .find({
        ...(teacher.role === UserRole.ADMIN ? {} : { teacherId: teacher._id }),
        status: CourseStatus.ACTIVE,
      })
      .exec();
    const courseIds = courses.map((c) => c._id as Types.ObjectId);

    if (courseIds.length === 0) {
      return {
        activeCoursesCount: 0,
        pendingExtensionsCount: 0,
        pendingTranslationsCount: 0,
        overdueStudentsCount: 0,
        recentAssignments: [],
        upcomingLessons: [],
      };
    }

    const [scopedCounts, lessonDocs] = await Promise.all([
      this.getTeacherScopedData(teacher, courseIds, true),
      this.lessonModel
        .find({
          courseId: { $in: courseIds },
          status: { $ne: LessonStatus.CANCELLED },
          endAt: { $gte: now },
        })
        .sort({ startAt: 1 })
        .limit(10)
        .exec(),
    ]);

    const recentAssignmentsDocs = [...scopedCounts.courseAssignments]
      .sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);

    const nowMs = now.getTime();
    const recentAssignments = recentAssignmentsDocs.map((a: any) => {
      const openMs = a.openAt ? new Date(a.openAt).getTime() : 0;
      const dueMs = a.deadlineAt ? new Date(a.deadlineAt).getTime() : 0;
      let effectiveStatus = a.status;
      if (openMs && dueMs) {
        if (nowMs < openMs) {
          effectiveStatus = 'scheduled';
        } else if (nowMs >= openMs && nowMs < dueMs) {
          effectiveStatus = 'available';
        } else {
          effectiveStatus = 'expired';
        }
      }
      return {
        id: extractObjectId(a._id),
        courseId: extractObjectId(a.courseId),
        title: a.title,
        exerciseId: extractObjectId(a.exerciseId),
        exerciseType: a.requiredScope || 'reading',
        assignedDate: a.assignedDate || formatVnDateTime(a.openAt).slice(0, 10),
        openAt: a.openAt ? a.openAt.toISOString() : '',
        dueAt: a.deadlineAt ? a.deadlineAt.toISOString() : '',
        status: effectiveStatus,
      };
    });

    const upcomingLessons = lessonDocs.map((l: any) => ({
      id: extractObjectId(l._id),
      courseId: extractObjectId(l.courseId),
      title: l.title,
      description: l.content || l.description || '',
      content: l.content || '',
      meetUrl: l.meetUrl,
      meetingUrl: l.meetUrl,
      startAt: l.startAt ? l.startAt.toISOString() : undefined,
      endAt: l.endAt ? l.endAt.toISOString() : undefined,
      startTime: l.startAt ? l.startAt.toISOString() : '',
      endTime: l.endAt ? l.endAt.toISOString() : '',
      type: l.meetUrl ? 'live_meet' : 'workshop',
      status: l.status,
    }));

    return {
      activeCoursesCount: courses.length,
      pendingExtensionsCount: scopedCounts.pendingExtensionsCount,
      pendingTranslationsCount: scopedCounts.pendingTranslationsCount,
      overdueStudentsCount: scopedCounts.overdueStudentsCount,
      recentAssignments,
      upcomingLessons,
    };
  }

  async getStudentProfile(student: UserDocument) {
    const now = new Date();

    const [profile, enrolledCoursesCount, activePenaltiesCount, extensionsUsedThisMonth] =
      await Promise.all([
        this.studentProfileModel.findOne({ userId: student._id }).exec(),
        this.enrollmentModel.countDocuments({
          studentId: student._id,
          status: EnrollmentStatus.ACTIVE,
        }),
        this.penaltyModel.countDocuments({
          studentId: student._id,
          deltaPoints: { $gt: 0 },
          isReversed: false,
        }),
        this.countMonthlyExtensionsUsed(student._id as Types.ObjectId, now),
      ]);

    return {
      user: {
        id: extractObjectId(student._id),
        email: student.email,
        fullName: student.fullName,
        roles: [student.role],
        role: student.role,
        status: student.status,
        timezone: 'Asia/Ho_Chi_Minh',
      },
      targetBand: profile?.targetBand ?? 7.0,
      enrolledCoursesCount,
      activePenaltiesCount,
      extensionsUsedThisMonth,
      maxExtensionsPerMonth: 3,
    };
  }

  async getTeacherProfile(teacher: UserDocument) {
    const courses = await this.courseModel
      .find({
        ...(teacher.role === UserRole.ADMIN ? {} : { teacherId: teacher._id }),
        status: CourseStatus.ACTIVE,
      })
      .exec();
    const courseIds = courses.map((c) => c._id as Types.ObjectId);
    const scopedCounts = await this.getTeacherScopedData(teacher, courseIds, false);

    return {
      user: {
        id: extractObjectId(teacher._id),
        email: teacher.email,
        fullName: teacher.fullName,
        roles: [teacher.role],
        role: teacher.role,
        status: teacher.status,
        timezone: 'Asia/Ho_Chi_Minh',
      },
      specialization: 'IELTS Academic Reading & Listening',
      activeCoursesCount: courses.length,
      pendingExtensionsCount: scopedCounts.pendingExtensionsCount,
      pendingTranslationsCount: scopedCounts.pendingTranslationsCount,
    };
  }

  async getStudentPenalties(studentId: string, actor?: UserDocument) {
    if (!Types.ObjectId.isValid(studentId)) {
      throw new NotFoundException('Student not found');
    }

    if (actor?.role === UserRole.STUDENT) {
      if (extractObjectId(actor._id) !== studentId) {
        throw new ForbiddenException("You do not have access to this student's penalties");
      }
    } else if (actor?.role === UserRole.TEACHER) {
      const teacherCourses = await this.courseModel
        .find({ teacherId: actor._id })
        .exec();
      const teacherCourseIds = teacherCourses.map((c) => c._id);
      if (teacherCourseIds.length === 0) {
        throw new ForbiddenException("You do not have access to this student's penalties");
      }
      const enrollment = await this.enrollmentModel
        .findOne({
          courseId: { $in: teacherCourseIds },
          studentId: new Types.ObjectId(studentId),
          status: EnrollmentStatus.ACTIVE,
        })
        .exec();
      if (!enrollment) {
        throw new ForbiddenException("You do not have access to this student's penalties");
      }
    }

    const penalties = await this.penaltyModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .sort({ createdAt: -1 })
      .exec();

    const active = penalties.filter((p) => !p.isReversed && p.deltaPoints > 0);
    const totalPoints = Math.max(0, penalties.reduce((sum, p) => sum + p.deltaPoints, 0));

    const records = penalties.map((p) => {
      const isReversed = Boolean(p.isReversed || p.deltaPoints < 0 || p.reversedTransactionId);
      return {
        id: extractObjectId(p._id),
        studentId: extractObjectId(p.studentId),
        studentAssignmentId: p.studentAssignmentId ? extractObjectId(p.studentAssignmentId) : undefined,
        points: Math.abs(p.deltaPoints ?? 1),
        deltaPoints: p.deltaPoints,
        reason: p.reason,
        reversed: isReversed,
        isReversed,
        createdAt: p.createdAt ? p.createdAt.toISOString() : undefined,
        occurredAt: p.createdAt ? p.createdAt.toISOString() : undefined,
        reversedAt: p.reversedAt ? p.reversedAt.toISOString() : (isReversed && p.updatedAt ? p.updatedAt.toISOString() : undefined),
        reversalReason: p.reversalReason,
      };
    });

    return {
      totalPoints,
      totalActivePoints: totalPoints,
      activePenaltiesCount: active.length,
      records,
      items: records,
    };
  }
}
