import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { Exercise, ExerciseSchema } from 'src/database/schemas/exercise.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Exercise.name, schema: ExerciseSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
    ]),
  ],
  controllers: [ExercisesController],
  providers: [ExercisesService],
  exports: [ExercisesService],
})
export class ExercisesModule {}

