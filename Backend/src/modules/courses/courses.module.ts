import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentSchema } from 'src/database/schemas/enrollment.schema';
import { User, UserSchema } from 'src/database/schemas/user.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import { Lesson, LessonSchema } from 'src/database/schemas/lesson.schema';
import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: User.name, schema: UserSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Lesson.name, schema: LessonSchema },
    ]),
    EnrollmentsModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
