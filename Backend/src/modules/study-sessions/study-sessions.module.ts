import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentSchema } from 'src/database/schemas/enrollment.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from 'src/database/schemas/student-profile.schema';
import {
  StudentStudyDaily,
  StudentStudyDailySchema,
} from 'src/database/schemas/student-study-daily.schema';
import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudentStudyDaily.name, schema: StudentStudyDailySchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
  ],
  controllers: [StudySessionsController],
  providers: [StudySessionsService],
  exports: [StudySessionsService],
})
export class StudySessionsModule {}
