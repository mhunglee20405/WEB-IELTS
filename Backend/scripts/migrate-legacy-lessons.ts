export {};

const { MongoClient } = require('../node_modules/mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';

enum LessonType {
  LIVE_MEET = 'live_meet',
  WORKSHOP = 'workshop',
  REVIEW = 'review',
}

function determineLessonType(title: string = '', content: string = ''): LessonType {
  const combined = `${title} ${content}`.toLowerCase();
  if (/workshop|chuyên đề|seminar|webinar/i.test(combined)) {
    return LessonType.WORKSHOP;
  }
  if (/review|chữa bài|chữa đề|giải đề|luyện đề|feedback|sửa bài/i.test(combined)) {
    return LessonType.REVIEW;
  }
  return LessonType.LIVE_MEET;
}

async function runMigration() {
  const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
  console.log('===============================================================');
  console.log(`🚀 LEGACY LESSON TYPE MIGRATION [${isDryRun ? 'DRY-RUN PREVIEW' : 'LIVE APPLY'}]`);
  console.log('===============================================================');

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('lessons');

    const totalLessons = await collection.countDocuments();
    const missingTypeCount = await collection.countDocuments({
      $or: [{ type: { $exists: false } }, { type: null }, { type: '' }],
    });

    console.log(`📊 Total lessons in database: ${totalLessons}`);
    console.log(`🔎 Lessons missing valid 'type' field: ${missingTypeCount}`);

    const cursor = collection.find({
      $or: [{ type: { $exists: false } }, { type: null }, { type: '' }],
    });

    const classificationSummary: Record<LessonType, number> = {
      [LessonType.LIVE_MEET]: 0,
      [LessonType.WORKSHOP]: 0,
      [LessonType.REVIEW]: 0,
    };

    const updates: { id: any; title: string; assignedType: LessonType }[] = [];

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) continue;
      const detectedType = determineLessonType(doc.title, doc.content || doc.description);
      classificationSummary[detectedType]++;
      updates.push({
        id: doc._id,
        title: doc.title,
        assignedType: detectedType,
      });
    }

    console.log('\n--- Classification Breakdown ---');
    console.log(`  - ${LessonType.LIVE_MEET}: ${classificationSummary[LessonType.LIVE_MEET]}`);
    console.log(`  - ${LessonType.WORKSHOP}: ${classificationSummary[LessonType.WORKSHOP]}`);
    console.log(`  - ${LessonType.REVIEW}: ${classificationSummary[LessonType.REVIEW]}`);

    if (updates.length > 0) {
      console.log('\n--- Sample Classifications ---');
      updates.slice(0, 10).forEach((u, i) => {
        console.log(`  ${i + 1}. [${u.assignedType.toUpperCase()}] "${u.title}" (${u.id})`);
      });
    }

    if (!isDryRun && updates.length > 0) {
      console.log('\n--- Applying Migrations to MongoDB ---');
      let updatedCount = 0;
      for (const u of updates) {
        await collection.updateOne(
          { _id: u.id },
          { $set: { type: u.assignedType } },
        );
        updatedCount++;
      }
      console.log(`✅ Successfully updated ${updatedCount} lessons in MongoDB.`);
    } else if (isDryRun && updates.length > 0) {
      console.log('\n💡 Dry-run complete. Re-run with `--apply` to commit changes.');
    } else {
      console.log('\n✅ All lesson records already have valid persisted `type` attributes.');
    }

    // Verify final state
    const remainingMissing = await collection.countDocuments({
      $or: [{ type: { $exists: false } }, { type: null }, { type: '' }],
    });
    console.log(`\n📌 Final check: ${remainingMissing} lessons missing type.`);
  } finally {
    await client.close();
  }
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

