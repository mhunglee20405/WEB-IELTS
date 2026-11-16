import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import { UserStatus } from 'src/database/schemas/enums';
import { UnauthorizedException } from '@nestjs/common';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tv?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ _id: payload.sub, status: UserStatus.ACTIVE })
      .exec();

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (payload.tv !== undefined && (user.tokenVersion || 0) !== payload.tv) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn do thay đổi thông tin xác thực. Vui lòng đăng nhập lại.');
    }

    return user;
  }
}

