import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseModule, Admin } from '../shared/database';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { readFileSync } from 'fs';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Helpers } from '../shared/helpers';
import { Encrypter } from '../shared/encrypter';
import { AdminStrategy } from './strategies/admin.strategy';
import { AdminAuthController } from './admin/admin-auth.controller';
import { UrlSigner } from './../shared/url-signer';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([Admin]),
    PassportModule.register({ defaultStrategy: 'customer' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const appKey = configService.get('app.key');
        Helpers.ensureKeys(appKey);

        return {
          privateKey: {
            key: readFileSync(
              `${process.cwd()}/.keys/jwt-private.key`,
            ).toString(),
            passphrase: appKey,
          },
          signOptions: { expiresIn: '1d', algorithm: 'RS256' },
        };
      },
      inject: [ConfigService],
    }),
    // JwtModule.register({
    //   privateKey: readFileSync(`${process.cwd()}/.keys/jwt-private.key`).toString(),
    //   signOptions: { expiresIn: '60s', algorithm: 'RS256' },
    // }),
  ],
  providers: [AuthService, AdminStrategy, Encrypter, UrlSigner],
  controllers: [AuthController, AdminAuthController],
})
export class AuthModule {}
