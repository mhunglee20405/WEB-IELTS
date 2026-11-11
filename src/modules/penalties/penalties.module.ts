import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PenaltiesController } from './penalties.controller';
import { PenaltiesService } from './penalties.service';
import {
  PenaltyTransaction,
  PenaltyTransactionSchema,
} from 'src/database/schemas/penalty-transaction.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from 'src/database/schemas/student-profile.schema';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentSchema } from 'src/database/schemas/enrollment.schema';
import { AuditModule } from 'src/modules/audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PenaltyTransaction.name, schema: PenaltyTransactionSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
    AuditModule,
  ],
  controllers: [PenaltiesController],
  providers: [PenaltiesService],
  exports: [PenaltiesService],
})
export class PenaltyModule {}

