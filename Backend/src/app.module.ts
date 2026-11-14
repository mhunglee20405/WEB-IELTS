import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import configuration, { validationSchema } from 'src/config/configuration';
import { DatabaseModule } from 'src/database/database.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { UsersModule } from 'src/modules/users/users.module';
import { CoursesModule } from 'src/modules/courses/courses.module';
import { EnrollmentsModule } from 'src/modules/enrollments/enrollments.module';
import { LessonsModule } from 'src/modules/lessons/lessons.module';
import { ExercisesModule } from 'src/modules/exercises/exercises.module';
import { AssignmentsModule } from 'src/modules/assignments/assignments.module';
import { SubmissionsModule } from 'src/modules/submissions/submissions.module';
import { TranslationsModule } from 'src/modules/translations/translations.module';
import { DeadlinesModule } from 'src/modules/deadlines/deadlines.module';
import { ExtensionRequestsModule } from 'src/modules/extensions/extensions.module';
import { PenaltyModule } from 'src/modules/penalties/penalties.module';
import { HealthModule } from 'src/modules/health/health.module';
import { AuditModule } from 'src/modules/audit/audit.module';
import { MailModule } from 'src/modules/mail/mail.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { JobsModule } from 'src/modules/jobs/jobs.module';
import { ExamTestsModule } from 'src/modules/exam-tests/exam-tests.module';
import { ExamAttemptsModule } from 'src/modules/exam-attempts/exam-attempts.module';
import { ReadingTranslationsModule } from 'src/modules/reading-translations/reading-translations.module';
import { MediaModule } from 'src/modules/media/media.module';
import { DashboardModule } from 'src/modules/dashboard/dashboard.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      envFilePath: ['.env', 'Backend/.env', '../Backend/.env'],
    }),

    // Redis & BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password', '') || undefined,
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 100,
      },
      {
        name: 'login',
        ttl: 60000,
        limit: 10, // 10 login attempts per minute
      },
    ]),

    // Database
    DatabaseModule,

    // Feature modules
    AuthModule,
    UsersModule,
    CoursesModule,
    EnrollmentsModule,
    LessonsModule,
    ExercisesModule,
    AssignmentsModule,
    SubmissionsModule,
    TranslationsModule,
    DeadlinesModule,
    ExtensionRequestsModule,
    PenaltyModule,
    AuditModule,
    MailModule,
    NotificationsModule,
    JobsModule,
    HealthModule,
    ExamTestsModule,
    ExamAttemptsModule,
    ReadingTranslationsModule,
    MediaModule,
    DashboardModule,
  ],
})
export class AppModule { }

