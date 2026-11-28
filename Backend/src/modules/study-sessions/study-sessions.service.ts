import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import {
  Enrollment,
  EnrollmentDocument,
} from 'src/database/schemas/enrollment.schema';
import { EnrollmentStatus, UserRole } from 'src/database/schemas/enums';
import {
  StudentProfile,
  StudentProfileDocument,
} from 'src/database/schemas/student-profile.schema';
import {
  StudentStudyDaily,
  StudentStudyDailyDocument,
} from 'src/database/schemas/student-study-daily.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  StudentStudyDetailQueryDto,
  StudyHeartbeatDto,
  TeacherStudySummaryQueryDto,
} from './dto/study-session.dto';

const MIN_HEARTBEAT_GAP_SECONDS = 15;
const MAX_HEARTBEAT_CREDIT_SECONDS = 90;
const DEFAULT_DETAIL_DAYS = 14;

function extractObjectId(ref: unknown): string {
  if (!ref) return '';
  if (ref instanceof Types.ObjectId) return ref.toHexString();
  if (typeof ref === 'object' && ref !== null) {
    if (
      'toHexString' in ref &&
      typeof (ref as { toHexString?: unknown }).toHexString === 'function'
    ) {
      return (ref as { toHexString: () => string }).toHexString();
    }
    if ('_id' in ref) {
      return extractObjectId((ref as { _id: unknown })._id);
    }
  }
  return String(ref);
}

function getVnDateString(date: Date): string {
  return formatVnDateTime(date).slice(0, 10);
}

function shiftVnDate(dateVn: string, deltaDays: number): string {
  const [y, m, d] = dateVn.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return formatVnDateTime(shifted).slice(0, 10);
}

function toIsoStringOrNull(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export interface HeartbeatResult {
  accepted: boolean;
  creditedSeconds: number;
  todayStudySeconds: number;
  totalStudySeconds: number;
}

export interface DailyStudyPoint {
  dateVn: string;
  studySeconds: number;
}

export interface StudentStudyDetailResult {
  totalStudySeconds: number;
  todayStudySeconds: number;
  last7DaysStudySeconds: number;
  lastActiveAt: string | null;
  dailyBreakdown: DailyStudyPoint[];
}

export interface TeacherStudySummaryItem {
  studentId: string;
  totalStudySeconds: number;
  last7DaysStudySeconds: number;
  lastActiveAt: string | null;
}

@Injectable()
export class StudySessionsService {
  constructor(
    @InjectModel(StudentStudyDaily.name)
    private readonly studyDailyModel: Model<StudentStudyDailyDocument>,
    @InjectModel(StudentProfile.name)
    private readonly studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<EnrollmentDocument>,
  ) {}

  /**
   * Record an active student study heartbeat with server-side anti-inflation clamping:
   * - Rejects beats arriving < 15s after lastStudyHeartbeatAt without incrementing totals.
   * - Credits min(deltaSeconds, floor(elapsedSeconds), 90) atomically to StudentProfile and StudentStudyDaily.
   */
  async heartbeat(
    dto: StudyHeartbeatDto,
    student: UserDocument,
  ): Promise<HeartbeatResult> {
    if (student?.role && student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can record study heartbeats');
    }

    const studentIdStr = extractObjectId(
      student?._id ?? (student as { id?: unknown })?.id,
    );
    if (!Types.ObjectId.isValid(studentIdStr)) {
      throw new BadRequestException('Invalid student identity');
    }

    if (!Number.isFinite(dto?.deltaSeconds) || dto.deltaSeconds < 1) {
      throw new BadRequestException('deltaSeconds must be at least 1');
    }

    const studentObjectId = new Types.ObjectId(studentIdStr);
    const now = new Date();
    const dateVn = getVnDateString(now);

    const profile = await this.studentProfileModel
      .findOne({ userId: studentObjectId })
      .exec();

    const currentTotalStudySeconds = profile?.totalStudySeconds ?? 0;
    const lastHeartbeatAt = profile?.lastStudyHeartbeatAt
      ? new Date(profile.lastStudyHeartbeatAt)
      : null;
    const elapsedSeconds = lastHeartbeatAt
      ? (now.getTime() - lastHeartbeatAt.getTime()) / 1000
      : null;

    if (elapsedSeconds !== null && elapsedSeconds < MIN_HEARTBEAT_GAP_SECONDS) {
      const daily = await this.studyDailyModel
        .findOne({ studentId: studentObjectId, dateVn })
        .exec();
      return {
        accepted: false,
        creditedSeconds: 0,
        todayStudySeconds: daily?.studySeconds ?? 0,
        totalStudySeconds: currentTotalStudySeconds,
      };
    }

    const requestedSeconds = Math.floor(dto.deltaSeconds);
    const elapsedCap =
      elapsedSeconds !== null ? Math.floor(elapsedSeconds) : requestedSeconds;
    const creditedSeconds = Math.max(
      1,
      Math.min(requestedSeconds, elapsedCap, MAX_HEARTBEAT_CREDIT_SECONDS),
    );

    const cutoffDate = new Date(now.getTime() - MIN_HEARTBEAT_GAP_SECONDS * 1000);
    const atomicFilter = {
      userId: studentObjectId,
      $or: [
        { lastStudyHeartbeatAt: { $lte: cutoffDate } },
        { lastStudyHeartbeatAt: { $exists: false } },
        { lastStudyHeartbeatAt: null },
      ],
    };

    let updatedProfile: StudentProfileDocument | null = null;
    try {
      updatedProfile = await this.studentProfileModel
        .findOneAndUpdate(
          atomicFilter,
          {
            $inc: { totalStudySeconds: creditedSeconds },
            $set: { lastStudyHeartbeatAt: now },
          },
          { upsert: !profile, new: true },
        )
        .exec();
    } catch (err: any) {
      // Concurrent first-beat upsert race on unique userId index -> treat as deduplicated beat
      if (err?.code !== 11000) {
        throw err;
      }
    }

    if (!updatedProfile) {
      const [latestProfile, daily] = await Promise.all([
        this.studentProfileModel.findOne({ userId: studentObjectId }).exec(),
        this.studyDailyModel
          .findOne({ studentId: studentObjectId, dateVn })
          .exec(),
      ]);
      return {
        accepted: false,
        creditedSeconds: 0,
        todayStudySeconds: daily?.studySeconds ?? 0,
        totalStudySeconds:
          latestProfile?.totalStudySeconds ?? currentTotalStudySeconds,
      };
    }

    const updatedDaily = await this.studyDailyModel
      .findOneAndUpdate(
        { studentId: studentObjectId, dateVn },
        {
          $inc: { studySeconds: creditedSeconds, heartbeatCount: 1 },
          $set: { lastHeartbeatAt: now },
        },
        { upsert: true, new: true },
      )
      .exec();

    return {
      accepted: true,
      creditedSeconds,
      todayStudySeconds: updatedDaily?.studySeconds ?? creditedSeconds,
      totalStudySeconds:
        updatedProfile.totalStudySeconds ??
        currentTotalStudySeconds + creditedSeconds,
    };
  }

  /**
   * Return study-time totals and 14-day VN calendar breakdown for the authenticated student.
   */
  async getMySummary(student: UserDocument): Promise<StudentStudyDetailResult> {
    if (student?.role && student.role !== UserRole.STUDENT) {
      throw new ForbiddenException(
        'Only students can view personal study summary',
      );
    }

    const studentIdStr = extractObjectId(
      student?._id ?? (student as { id?: unknown })?.id,
    );
    if (!Types.ObjectId.isValid(studentIdStr)) {
      throw new BadRequestException('Invalid student identity');
    }

    return this.buildStudentDetail(
      new Types.ObjectId(studentIdStr),
      DEFAULT_DETAIL_DAYS,
    );
  }

  /**
   * Return study-time summary items across active enrolled students scoped by actor role.
   */
  async getTeacherSummary(
    query: TeacherStudySummaryQueryDto,
    actor: UserDocument,
  ): Promise<{ items: TeacherStudySummaryItem[] }> {
    if (
      !actor ||
      (actor.role !== UserRole.TEACHER && actor.role !== UserRole.ADMIN)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const actorIdStr = extractObjectId(
      actor._id ?? (actor as { id?: unknown }).id,
    );

    let studentObjectIds: Types.ObjectId[] = [];
    let profiles: StudentProfileDocument[] | null = null;

    if (actor.role === UserRole.TEACHER) {
      if (!Types.ObjectId.isValid(actorIdStr)) {
        throw new BadRequestException('Invalid teacher identity');
      }

      const courseIds = await this.resolveTeacherCourseIds(
        actorIdStr,
        query?.courseId,
      );
      if (courseIds.length === 0) {
        return { items: [] };
      }

      studentObjectIds = await this.getActiveStudentIdsForCourses(courseIds);
    } else if (query?.courseId) {
      if (!Types.ObjectId.isValid(query.courseId)) {
        throw new BadRequestException('Invalid course ID');
      }
      const courseObjectId = new Types.ObjectId(query.courseId);
      const course = await this.courseModel.findById(courseObjectId).exec();
      if (!course) {
        throw new NotFoundException('Course not found');
      }
      studentObjectIds = await this.getActiveStudentIdsForCourses([
        courseObjectId,
      ]);
    } else {
      profiles = await this.studentProfileModel.find({}).exec();
      studentObjectIds = this.dedupeObjectIds(
        (profiles || []).map((p) => p.userId),
      );
    }

    if (studentObjectIds.length === 0) {
      return { items: [] };
    }

    const now = new Date();
    const todayVn = getVnDateString(now);
    const last7StartVn = shiftVnDate(todayVn, -6);

    const [loadedProfiles, dailyDocs] = await Promise.all([
      profiles
        ? Promise.resolve(profiles)
        : this.studentProfileModel
            .find({ userId: { $in: studentObjectIds } })
            .exec(),
      this.studyDailyModel
        .find({
          studentId: { $in: studentObjectIds },
          dateVn: { $gte: last7StartVn, $lte: todayVn },
        })
        .exec(),
    ]);

    const profileMap = new Map<string, StudentProfileDocument>();
    for (const profile of loadedProfiles || []) {
      const sid = extractObjectId(profile.userId);
      if (sid) {
        profileMap.set(sid, profile);
      }
    }

    const last7Map = new Map<string, number>();
    for (const doc of dailyDocs || []) {
      if (doc.dateVn < last7StartVn || doc.dateVn > todayVn) continue;
      const sid = extractObjectId(doc.studentId);
      if (!sid) continue;
      last7Map.set(sid, (last7Map.get(sid) ?? 0) + (doc.studySeconds ?? 0));
    }

    const items: TeacherStudySummaryItem[] = studentObjectIds.map((id) => {
      const studentId = id.toHexString();
      const profile = profileMap.get(studentId);
      return {
        studentId,
        totalStudySeconds: profile?.totalStudySeconds ?? 0,
        last7DaysStudySeconds: last7Map.get(studentId) ?? 0,
        lastActiveAt: toIsoStringOrNull(profile?.lastStudyHeartbeatAt),
      };
    });

    return { items };
  }

  /**
   * Return detailed daily breakdown for a student, verifying teacher ownership via active enrollment.
   */
  async getStudentDetail(
    studentId: string,
    query: StudentStudyDetailQueryDto,
    actor: UserDocument,
  ): Promise<StudentStudyDetailResult> {
    if (!Types.ObjectId.isValid(studentId)) {
      throw new BadRequestException('Invalid student ID');
    }

    if (
      !actor ||
      (actor.role !== UserRole.TEACHER && actor.role !== UserRole.ADMIN)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const studentObjectId = new Types.ObjectId(studentId);

    if (actor.role === UserRole.TEACHER) {
      const actorIdStr = extractObjectId(
        actor._id ?? (actor as { id?: unknown }).id,
      );
      if (!Types.ObjectId.isValid(actorIdStr)) {
        throw new BadRequestException('Invalid teacher identity');
      }

      const teacherCourses = await this.courseModel
        .find({ teacherId: new Types.ObjectId(actorIdStr) })
        .exec();
      const teacherCourseIds = this.dedupeObjectIds(
        (teacherCourses || []).map((c) => c._id),
      );
      if (teacherCourseIds.length === 0) {
        throw new ForbiddenException(
          'You can only view study details for students enrolled in your courses',
        );
      }

      const enrollment = await this.enrollmentModel
        .findOne({
          courseId: { $in: teacherCourseIds },
          studentId: studentObjectId,
          status: EnrollmentStatus.ACTIVE,
        })
        .exec();

      if (!enrollment) {
        throw new ForbiddenException(
          'You can only view study details for students enrolled in your courses',
        );
      }
    }

    const days = Math.min(
      90,
      Math.max(7, Number(query?.days) || DEFAULT_DETAIL_DAYS),
    );
    return this.buildStudentDetail(studentObjectId, days);
  }

  private async resolveTeacherCourseIds(
    teacherIdStr: string,
    courseId?: string,
  ): Promise<Types.ObjectId[]> {
    if (courseId) {
      if (!Types.ObjectId.isValid(courseId)) {
        throw new BadRequestException('Invalid course ID');
      }
      const course = await this.courseModel
        .findById(new Types.ObjectId(courseId))
        .exec();
      if (!course) {
        throw new NotFoundException('Course not found');
      }
      if (extractObjectId(course.teacherId) !== teacherIdStr) {
        throw new ForbiddenException(
          'You can only view study time for students in your own courses',
        );
      }
      return [new Types.ObjectId(extractObjectId(course._id))];
    }

    const courses = await this.courseModel
      .find({ teacherId: new Types.ObjectId(teacherIdStr) })
      .exec();
    return this.dedupeObjectIds((courses || []).map((c) => c._id));
  }

  private async getActiveStudentIdsForCourses(
    courseIds: Types.ObjectId[],
  ): Promise<Types.ObjectId[]> {
    const enrollments = await this.enrollmentModel
      .find({
        courseId: { $in: courseIds },
        status: EnrollmentStatus.ACTIVE,
      })
      .exec();
    return this.dedupeObjectIds((enrollments || []).map((e) => e.studentId));
  }

  private dedupeObjectIds(refs: unknown[]): Types.ObjectId[] {
    const unique: Types.ObjectId[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      const idStr = extractObjectId(ref);
      if (idStr && Types.ObjectId.isValid(idStr) && !seen.has(idStr)) {
        seen.add(idStr);
        unique.push(new Types.ObjectId(idStr));
      }
    }
    return unique;
  }

  private async buildStudentDetail(
    studentObjectId: Types.ObjectId,
    days: number,
  ): Promise<StudentStudyDetailResult> {
    const now = new Date();
    const todayVn = getVnDateString(now);
    const windowStartVn = shiftVnDate(todayVn, -(days - 1));
    const last7StartVn = shiftVnDate(todayVn, -6);

    const [profile, dailyDocs] = await Promise.all([
      this.studentProfileModel.findOne({ userId: studentObjectId }).exec(),
      this.studyDailyModel
        .find({
          studentId: studentObjectId,
          dateVn: { $gte: windowStartVn, $lte: todayVn },
        })
        .sort({ dateVn: 1 })
        .exec(),
    ]);

    const sortedDocs = (dailyDocs || [])
      .filter((doc) => doc.dateVn >= windowStartVn && doc.dateVn <= todayVn)
      .sort((a, b) => a.dateVn.localeCompare(b.dateVn));

    let todayStudySeconds = 0;
    let last7DaysStudySeconds = 0;

    const dailyBreakdown: DailyStudyPoint[] = sortedDocs.map((doc) => {
      const studySeconds = doc.studySeconds ?? 0;
      if (doc.dateVn === todayVn) {
        todayStudySeconds += studySeconds;
      }
      if (doc.dateVn >= last7StartVn) {
        last7DaysStudySeconds += studySeconds;
      }
      return {
        dateVn: doc.dateVn,
        studySeconds,
      };
    });

    return {
      totalStudySeconds: profile?.totalStudySeconds ?? 0,
      todayStudySeconds,
      last7DaysStudySeconds,
      lastActiveAt: toIsoStringOrNull(profile?.lastStudyHeartbeatAt),
      dailyBreakdown,
    };
  }
}
