import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { StudentAssignmentStatus } from './enums';

export type StudentAssignmentDocument = StudentAssignment & Document;

@Schema({ timestamps: true, collection: 'student_assignments' })
export class StudentAssignment {
  @Prop({ type: Types.ObjectId, ref: 'Assignment', required: true })
  assignmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  /** Original deadline snapshot at assignment creation */
  @Prop()
  originalDeadlineAt?: Date;

  /** Per-student effective deadline (may differ from assignment.deadlineAt after extension) */
  @Prop({ required: true })
  effectiveDeadlineAt: Date;

  @Prop({
    type: String,
    enum: Object.values(StudentAssignmentStatus),
    default: StudentAssignmentStatus.NOT_STARTED,
  })
  status: StudentAssignmentStatus;

  @Prop({ min: 0, max: 100 })
  bestScore?: number;

  @Prop()
  passedAt?: Date;

  @Prop()
  lastSubmittedAt?: Date;

  @Prop()
  penaltyAppliedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StudentAssignmentSchema = SchemaFactory.createForClass(StudentAssignment);
StudentAssignmentSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });
StudentAssignmentSchema.index({ status: 1, effectiveDeadlineAt: 1 });
StudentAssignmentSchema.index({ studentId: 1, status: 1 });

