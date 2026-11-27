import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createVnDailyBounds, formatVnDateTime } from 'src/common/utils/timezone.util';
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import {
  AssignmentStatus,
  CourseStatus,
  NotificationType,
} from 'src/database/schemas/enums';
import {
  Notification,
  NotificationDocument,
} from 'src/database/schemas/notification.schema';
import { NotificationsService } from 'src/modules/notifications/notifications.service';

export interface AssignmentReminderResult {
  checkedCourses: number;
  remindedCount: number;
  skippedAlreadyReminded: number;
  isoWeek: string;
}

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

function shiftVnDate(dateVn: string, deltaDays: number): string {
  const [y, m, d] = dateVn.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return formatVnDateTime(shifted).slice(0, 10);
}

@Injectable()
export class AssignmentReminderService {
  private readonly logger = new Logger(AssignmentReminderService.name);

  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Computes ISO-8601 week identifier ('YYYY-Www') in Asia/Ho_Chi_Minh (UTC+7).
   */
  getVnIsoWeek(date: Date = new Date()): string {
    const vnDate = formatVnDateTime(date).slice(0, 10);
    const [year, month, day] = vnDate.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const isoDay = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay);
    const isoYear = utcDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const diffDays = Math.floor((utcDate.getTime() - yearStart.getTime()) / 86400000);
    const weekNumber = Math.floor(diffDays / 7) + 1;
    return `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;
  }

  /**
   * Checks all active non-expired courses and sends at most 1 weekly reminder per course
   * to the assigned teacher when no assignment is scheduled in the upcoming 7 VN days.
   */
  async checkAndRemindTeachers(now: Date = new Date()): Promise<AssignmentReminderResult> {
    const isoWeek = this.getVnIsoWeek(now);
    const todayVn = formatVnDateTime(now).slice(0, 10);
    const windowStartDateVn = shiftVnDate(todayVn, 1);
    const windowEndDateVn = shiftVnDate(todayVn, 7);
    const windowStart = createVnDailyBounds(windowStartDateVn).openAt;
    const windowEnd = createVnDailyBounds(windowEndDateVn).deadlineAt;

    const activeCourses = await this.courseModel
      .find({
        status: CourseStatus.ACTIVE,
        $or: [{ endAt: { $exists: false } }, { endAt: null }, { endAt: { $gt: now } }],
      })
      .exec();

    let remindedCount = 0;
    let skippedAlreadyReminded = 0;

    for (const course of activeCourses) {
      const courseId = extractObjectId(course._id);
      const teacherId = extractObjectId(course.teacherId);
      if (!courseId || !teacherId) {
        this.logger.warn(
          `Skipping active course ${courseId || 'unknown'} due to missing teacherId`,
        );
        continue;
      }

      const existingAssignment = await this.assignmentModel
        .findOne({
          courseId: course._id,
          status: {
            $in: [
              AssignmentStatus.PUBLISHED,
              AssignmentStatus.SCHEDULED,
              AssignmentStatus.AVAILABLE,
            ],
          },
          openAt: { $gte: windowStart, $lte: windowEnd },
        })
        .exec();

      if (existingAssignment) {
        continue;
      }

      const idempotencyKey = `notif:schedule-reminder:${teacherId}:${courseId}:${isoWeek}`;
      const existingNotification = await this.notificationModel
        .findOne({ idempotencyKey })
        .exec();

      if (existingNotification) {
        skippedAlreadyReminded++;
        continue;
      }

      try {
        await this.notificationsService.create({
          userId: teacherId,
          type: NotificationType.ASSIGNMENT_SCHEDULE_REMINDER,
          title: `Nhắc lên lịch giao bài tuần tới: ${course.title}`,
          body: `Khóa học ${course.code} (${course.title}) chưa có bài tập nào được lên lịch trong 7 ngày tới (${windowStartDateVn} – ${windowEndDateVn}). Vui lòng lên lịch giao bài trước 1 tuần.`,
          payload: {
            courseId,
            courseTitle: course.title,
            courseCode: course.code,
            isoWeek,
            windowStartVn: windowStartDateVn,
            windowEndVn: windowEndDateVn,
          },
          sendEmail: true,
          emailTemplateKey: 'assignment-schedule-reminder',
          idempotencyKey,
        });
        remindedCount++;
      } catch (err: any) {
        this.logger.warn(
          `Failed to dispatch schedule reminder for course ${courseId} (teacher ${teacherId}): ${err.message}`,
        );
      }
    }

    return {
      checkedCourses: activeCourses.length,
      remindedCount,
      skippedAlreadyReminded,
      isoWeek,
    };
  }
}
