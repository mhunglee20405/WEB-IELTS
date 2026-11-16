const mongoose = require('mongoose');

async function check() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms_customer?replicaSet=rs0&directConnection=true';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Database: ${mongoose.connection.name}`);
  const collections = await db.listCollections().toArray();
  for (const c of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`  ${c.name.padEnd(25)} : ${count}`);
  }
  await mongoose.disconnect();
}

check().catch(console.error);
