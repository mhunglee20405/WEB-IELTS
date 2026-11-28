import { ExamQuestionType } from 'src/database/schemas/enums';
import { normalizeText, normalizeTFNG } from 'src/modules/submissions/submissions.service';

export interface GradingResult {
  isCorrect: boolean;
  awardedPoints: number;
}

export function gradeQuestion(
  type: ExamQuestionType | string,
  studentAnswer: any,
  gradingSpec: any,
  points = 1,
): GradingResult {
  if (!gradingSpec || !gradingSpec.acceptedKeys || gradingSpec.acceptedKeys.length === 0) {
    return { isCorrect: false, awardedPoints: 0 };
  }

  const acceptedKeys: string[] = gradingSpec.acceptedKeys;
  const caseSensitive = Boolean(gradingSpec.caseSensitive);
  let isCorrect = false;

  switch (type) {
    case ExamQuestionType.MULTIPLE_CHOICE_SINGLE:
    case ExamQuestionType.MATCHING_HEADINGS:
    case ExamQuestionType.MATCHING_INFORMATION:
    case ExamQuestionType.MATCHING_FEATURES:
    case ExamQuestionType.MATCHING_SENTENCE_ENDINGS: {
      const valStr = typeof studentAnswer === 'string' ? studentAnswer : String(studentAnswer || '');
      const normalizedStudent = normalizeText(valStr, false);
      isCorrect = acceptedKeys.some(
        (key) => normalizeText(key, false) === normalizedStudent,
      );
      break;
    }

    case ExamQuestionType.MULTIPLE_CHOICE_MULTIPLE: {
      // studentAnswer should be an array of string keys
      let studentArr: string[] = [];
      if (Array.isArray(studentAnswer)) {
        studentArr = studentAnswer.map((s) => normalizeText(String(s), false)).filter(Boolean);
      } else if (typeof studentAnswer === 'string' && studentAnswer.trim()) {
        studentArr = [normalizeText(studentAnswer, false)];
      }

      const expectedSet = new Set(acceptedKeys.map((k) => normalizeText(k, false)));
      const studentSet = new Set(studentArr);

      if (expectedSet.size === studentSet.size) {
        let allMatch = true;
        for (const item of studentSet) {
          if (!expectedSet.has(item)) {
            allMatch = false;
            break;
          }
        }
        isCorrect = allMatch;
      }
      break;
    }

    case ExamQuestionType.TRUE_FALSE_NOT_GIVEN:
    case ExamQuestionType.YES_NO_NOT_GIVEN: {
      const valStr = typeof studentAnswer === 'string' ? studentAnswer : String(studentAnswer || '');
      const normalizedStudent = normalizeTFNG(valStr);
      isCorrect = acceptedKeys.some(
        (key) => normalizeTFNG(key) === normalizedStudent,
      );
      break;
    }

    case ExamQuestionType.SENTENCE_COMPLETION:
    case ExamQuestionType.SUMMARY_COMPLETION:
    case ExamQuestionType.NOTE_COMPLETION:
    case ExamQuestionType.TABLE_COMPLETION:
    case ExamQuestionType.FLOW_CHART_COMPLETION:
    case ExamQuestionType.DIAGRAM_LABEL_COMPLETION:
    case ExamQuestionType.SHORT_ANSWER: {
      const valStr = typeof studentAnswer === 'string' ? studentAnswer : String(studentAnswer || '');
      const normalizedStudent = normalizeText(valStr, caseSensitive);

      // Check max words if defined
      if (gradingSpec.maxWords && gradingSpec.maxWords > 0) {
        const words = normalizedStudent.split(' ').filter(Boolean);
        if (words.length > gradingSpec.maxWords) {
          return { isCorrect: false, awardedPoints: 0 };
        }
      }

      isCorrect = acceptedKeys.some(
        (key) => normalizeText(key, caseSensitive) === normalizedStudent,
      );
      break;
    }

    default: {
      const valStr = typeof studentAnswer === 'string' ? studentAnswer : String(studentAnswer || '');
      isCorrect = acceptedKeys.some(
        (key) => normalizeText(key, caseSensitive) === normalizeText(valStr, caseSensitive),
      );
      break;
    }
  }

  return {
    isCorrect,
    awardedPoints: isCorrect ? points : 0,
  };
}

