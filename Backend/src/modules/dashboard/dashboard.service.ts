import { Injectable, NotFoundException } from '@nestjs/common';
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
import {
  CourseStatus,
  EnrollmentStatus,
  ExtensionRequestStatus,
  LessonStatus,
  StudentAssignmentStatus,
  TranslationSubmissionStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
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
  ) {}

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

    const formattedAssignments = saDocs
      .filter((sa: any) => sa.assignmentId)
      .map((sa: any) => {
        const asg = sa.assignmentId;
        const crs = asg.courseId;
        const exe = asg.exerciseId;
        const passed = Boolean(sa.isTargetAchieved);
        const openAt = asg.openAt ? new Date(asg.openAt).toISOString() : new Date().toISOString();
        const dueAt = asg.deadlineAt ? new Date(asg.deadlineAt).toISOString() : new Date().toISOString();
        const effectiveDueAt = sa.effectiveDeadlineAt
          ? new Date(sa.effectiveDeadlineAt).toISOString()
          : dueAt;

        return {
          id: extractObjectId(sa._id),
          studentAssignmentId: extractObjectId(sa._id),
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
          penaltyApplied: Boolean(sa.penaltyApplied),
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

    const lessonDocs = await this.lessonModel
      .find({
        ...(enrolledCourseIds.length > 0 ? { courseId: { $in: enrolledCourseIds } } : {}),
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
      description: l.description || '',
      meetingUrl: l.meetUrl,
      startAt: l.startAt ? l.startAt.toISOString() : undefined,
      endAt: l.endAt ? l.endAt.toISOString() : undefined,
      startTime: l.startAt ? l.startAt.toISOString() : '',
      endTime: l.endAt ? l.endAt.toISOString() : '',
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
        submittedAt: now.toISOString(),
      }));

    // 4. Counts
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [activePenaltiesCount, extensionsUsedThisMonth, unreadNotificationsCount] =
      await Promise.all([
        this.penaltyModel.countDocuments({
          studentId: student._id,
          isReversed: false,
        }),
        this.extensionModel.countDocuments({
          studentId: student._id,
          status: ExtensionRequestStatus.APPROVED,
          createdAt: { $gte: startOfMonth },
        }),
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
    const courseIds = courses.map((c) => c._id);

    const [
      pendingExtensionsCount,
      pendingTranslationsCount,
      overdueStudentsCount,
      recentAssignmentsDocs,
      lessonDocs,
    ] = await Promise.all([
      this.extensionModel.countDocuments({ status: ExtensionRequestStatus.PENDING }),
      this.translationModel.countDocuments({ status: TranslationSubmissionStatus.SUBMITTED }),
      this.studentAssignmentModel.countDocuments({ status: StudentAssignmentStatus.OVERDUE }),
      this.assignmentModel
        .find(courseIds.length > 0 ? { courseId: { $in: courseIds } } : {})
        .sort({ createdAt: -1 })
        .limit(10)
        .exec(),
      this.lessonModel
        .find({
          ...(courseIds.length > 0 ? { courseId: { $in: courseIds } } : {}),
          status: { $ne: LessonStatus.CANCELLED },
          endAt: { $gte: now },
        })
        .sort({ startAt: 1 })
        .limit(10)
        .exec(),
    ]);

    const recentAssignments = recentAssignmentsDocs.map((a: any) => ({
      id: extractObjectId(a._id),
      courseId: extractObjectId(a.courseId),
      title: a.title,
      exerciseId: extractObjectId(a.exerciseId),
      exerciseType: a.requiredScope || 'reading',
      assignedDate: a.assignedDate || formatVnDateTime(a.openAt).slice(0, 10),
      openAt: a.openAt ? a.openAt.toISOString() : '',
      dueAt: a.deadlineAt ? a.deadlineAt.toISOString() : '',
      status: a.status,
    }));

    const upcomingLessons = lessonDocs.map((l: any) => ({
      id: extractObjectId(l._id),
      courseId: extractObjectId(l.courseId),
      title: l.title,
      description: l.description || '',
      meetingUrl: l.meetUrl,
      startAt: l.startAt ? l.startAt.toISOString() : undefined,
      endAt: l.endAt ? l.endAt.toISOString() : undefined,
      startTime: l.startAt ? l.startAt.toISOString() : '',
      endTime: l.endAt ? l.endAt.toISOString() : '',
      status: l.status,
    }));

    return {
      activeCoursesCount: courses.length,
      pendingExtensionsCount,
      pendingTranslationsCount,
      overdueStudentsCount,
      recentAssignments,
      upcomingLessons,
    };
  }

  async getStudentProfile(student: UserDocument) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [profile, enrolledCoursesCount, activePenaltiesCount, extensionsUsedThisMonth] =
      await Promise.all([
        this.studentProfileModel.findOne({ userId: student._id }).exec(),
        this.enrollmentModel.countDocuments({
          studentId: student._id,
          status: EnrollmentStatus.ACTIVE,
        }),
        this.penaltyModel.countDocuments({
          studentId: student._id,
          isReversed: false,
        }),
        this.extensionModel.countDocuments({
          studentId: student._id,
          status: ExtensionRequestStatus.APPROVED,
          createdAt: { $gte: startOfMonth },
        }),
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
    const [activeCoursesCount, pendingExtensionsCount, pendingTranslationsCount] =
      await Promise.all([
        this.courseModel.countDocuments({
          teacherId: teacher._id,
          status: CourseStatus.ACTIVE,
        }),
        this.extensionModel.countDocuments({ status: ExtensionRequestStatus.PENDING }),
        this.translationModel.countDocuments({ status: TranslationSubmissionStatus.SUBMITTED }),
      ]);

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
      activeCoursesCount,
      pendingExtensionsCount,
      pendingTranslationsCount,
    };
  }

  async getStudentPenalties(studentId: string) {
    if (!Types.ObjectId.isValid(studentId)) {
      throw new NotFoundException('Student not found');
    }

    const penalties = await this.penaltyModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .sort({ createdAt: -1 })
      .exec();

    const active = penalties.filter((p) => !p.isReversed);
    const totalPoints = active.reduce((sum, p) => sum + p.deltaPoints, 0);

    return {
      totalPoints,
      activePenaltiesCount: active.length,
      records: penalties.map((p) => ({
        id: extractObjectId(p._id),
        studentId: extractObjectId(p.studentId),
        studentAssignmentId: p.studentAssignmentId ? extractObjectId(p.studentAssignmentId) : undefined,
        points: p.deltaPoints,
        reason: p.reason,
        reversed: p.isReversed,
        createdAt: p.createdAt ? p.createdAt.toISOString() : undefined,
      })),
    };
  }
}
