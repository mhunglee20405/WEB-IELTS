import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';
import { UserSchema } from '../schemas/user.schema';
import { UserRole, UserStatus } from '../schemas/enums';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';

function ask(query: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function parseCliArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_\-])[A-Za-z\d@$!%*?&#^_\-]{8,}$/;

async function run() {
  console.log('===============================================================');
  console.log('🛡️ WEB-IELTS INITIAL SYSTEM ADMINISTRATOR BOOTSTRAP CLI');
  console.log('===============================================================');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB at', MONGODB_URI);

  const UserModel = mongoose.model('User', UserSchema, 'users');

  // Check if an admin already exists
  const existingAdmin = await UserModel.findOne({ role: UserRole.ADMIN }).exec();
  if (existingAdmin) {
    console.error(`\n⛔ FATAL: An administrator already exists in this database (${existingAdmin.email}).`);
    console.error('Initial bootstrap is permanently locked to prevent unauthorized privilege escalation.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const cli = parseCliArgs();

  let email = cli.email;
  let fullName = cli.fullName || cli.fullname;
  let password = cli.password;
  let phone = cli.phone;

  if (!email) {
    email = await ask('👉 Nhập địa chỉ Email Quản trị viên: ');
  }
  if (!email || !email.includes('@')) {
    console.error('❌ Địa chỉ email không hợp lệ.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!fullName) {
    fullName = await ask('👉 Nhập Họ và Tên: ');
  }
  if (!fullName || fullName.length < 2) {
    console.error('❌ Họ và tên phải có ít nhất 2 ký tự.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!password) {
    password = await ask('👉 Nhập Mật khẩu quản trị (tối thiểu 8 ký tự, gồm chữ hoa, thường, số, ký tự đặc biệt): ');
  }

  if (!PASSWORD_REGEX.test(password)) {
    console.error('❌ Mật khẩu không đáp ứng tiêu chuẩn an toàn:');
    console.error('   - Tối thiểu 8 ký tự');
    console.error('   - Ít nhất 1 chữ hoa, 1 chữ thường');
    console.error('   - Ít nhất 1 số và 1 ký tự đặc biệt (@$!%*?&#^_-)');
    await mongoose.disconnect();
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingEmail = await UserModel.findOne({ email: normalizedEmail }).exec();
  if (existingEmail) {
    console.error(`❌ Email "${normalizedEmail}" đã được sử dụng.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\n🔒 Đang băm mật khẩu bằng Argon2id (memoryCost=65536, timeCost=3)...');
  const hashedPassword = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const admin = new UserModel({
    email: normalizedEmail,
    fullName: fullName.trim(),
    passwordHash: hashedPassword,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    phone: phone?.trim() || undefined,
  });

  await admin.save();

  // Clean up any temporary .bootstrap-token files across candidate paths
  const candidateTokenFiles = [
    path.resolve(process.cwd(), '.bootstrap-token'),
    path.resolve(__dirname, '../../..', '.bootstrap-token'),
    path.resolve(__dirname, '../../../..', '.bootstrap-token'),
  ];
  for (const tokenFile of Array.from(new Set(candidateTokenFiles))) {
    if (fs.existsSync(tokenFile)) {
      try {
        fs.unlinkSync(tokenFile);
      } catch {
        // Ignore
      }
    }
  }

  console.log('===============================================================');
  console.log('🎉 KHỞI TẠO QUẢN TRỊ VIÊN BAN ĐẦU THÀNH CÔNG!');
  console.log(`   - ID:        ${admin._id}`);
  console.log(`   - Email:     ${admin.email}`);
  console.log(`   - Họ tên:    ${admin.fullName}`);
  console.log(`   - Vai trò:   ${admin.role}`);
  console.log(`   - Trạng thái: ${admin.status}`);
  console.log('===============================================================');
  console.log('👉 Bây giờ bạn có thể khởi động hệ thống và đăng nhập qua giao diện web.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('\n💥 Bootstrap thất bại:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
