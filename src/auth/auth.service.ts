/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { MailerService } from '@nestjs-modules/mailer';
import { STRINGS } from '../shared/constants';
import { Encrypter } from '../shared/encrypter';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Admin, User, Physician } from '../shared/database';
import { Repository, MoreThan } from 'typeorm';
import { UserLoginDto } from '../shared/dto/user-login.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { UserPasswordResetDto } from './../shared/dto/user-password-reset.dto';
import { UrlSigner } from './../shared/url-signer';
import { route } from './../shared/helpers';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Physician)
    private readonly physicianRepo: Repository<Physician>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private encrypter: Encrypter,
    private mailerService: MailerService,
    private urlSigner: UrlSigner,
  ) {}

  async adminLogin({ username, password }: UserLoginDto): Promise<Admin> {
    const user = await this.adminRepo.findOne({ where: { email: username } });

    if (!user) {
      throw new HttpException(
        STRINGS.auth.login.invalid,
        HttpStatus.UNAUTHORIZED,
      );
    }
    // console.log(user);
    if (!bcrypt.compareSync(password, user.password)) {
      throw new HttpException(
        STRINGS.auth.login.invalid,
        HttpStatus.UNAUTHORIZED,
      );
    }

    return user;
  }

  async userLogin({ username, password }: UserLoginDto, userType: string): Promise<User | Physician> {
    const user = userType === 'physician'
      ? await this.physicianRepo.findOne({ where: { email: username } })
      : await this.userRepo.findOne({ where: { email: username } });

    if (!user) {
      throw new HttpException(
        STRINGS.auth.login.invalid,
        HttpStatus.UNAUTHORIZED,
      );
    }
    // console.log(user);
    if (!bcrypt.compareSync(password, user.password)) {
      throw new HttpException(
        STRINGS.auth.login.invalid,
        HttpStatus.UNAUTHORIZED,
      );
    }

    return user;
  }

  async validateAdmin(userId: any, data: any) {
    const user = await this.adminRepo.findOne({
      where: {
        id: userId,
        email: data.email,
      },
    });

    return user;
  }

  async validateUser(userId: any, data: any, userType = 'admin') {
    let repo = null;

    if (userType === 'admin') {
      repo = this.adminRepo;
    }

    if (userType === 'user') {
      repo = this.userRepo;
    }

    if (userType === 'physician') {
      repo = this.physicianRepo;
    }

    const user = await repo.findOne({
      where: {
        id: userId,
        email: data.email,
      },
    });

    return user;
  }

  async login(loginDto: any, userType: string) {
    let user = null;

    if (userType === 'admin') {
      user = await this.adminLogin(loginDto);
    }

    if (userType === 'user') {
      user = await this.userLogin(loginDto, 'user');
    }

    if (userType === 'physician') {
      user = await this.userLogin(loginDto, 'physician');
    }

    return {
      expires_in: this.configService.get('app.tokenExpiresIn'),
      access_token: this.jwtService.sign(this._preparePayload(user, userType)),
    };
  }

  getTemporarySignedUrl(user: any, userType: string): string {
    const signedUrl = this.urlSigner.sign(
      route().toFullUrl(`${userType}/auth/password-reset`, false, false),
      { ttl: 60 },
      [user.id, this.encrypter.sha1(user.email)],
    );

    return signedUrl;
  }

  async resetPassword(dto: UserPasswordResetDto, userType: string) {
    const user = null;

    if (userType === 'admin') {
      throw new HttpException('Invalid Request', HttpStatus.BAD_REQUEST);
    }

    return await this.mailerService
      .sendMail({
        to: {
          name: null,
          address: user.email,
        },
        from: {
          name: this.configService.get('mail.fromName'),
          address: this.configService.get('mail.fromEmail'),
        },
        subject: 'Password reset',
        template: 'password_reset',
        context: {
          buttonUrl: this.getTemporarySignedUrl(user, userType),
          appName: this.configService.get('app.name'),
          supportEmail: this.configService.get('app.supportEmail'),
        },
      })
      .then(success => {
        return {
          message: 'Password reset link have been sent to your e-mail.',
          statusCode: 200,
          status: 'success',
        };
      })
      .catch(err => {
        // console.log(err);
        throw new HttpException(
          'Password reset not successful, unable to send welcome message.',
          500,
        );
      });
  }

  private _preparePayload(user: any, userType?: string): any {
    const { id, email, firstName, lastName } = user;

    let _data: any = {};

    if (userType === 'user') {
      _data = user.profile ? { firstName: user.profile.firstName, lastName: user.profile.lastName, email } : {email};
    }
    
    if (userType === 'physician') {
      _data = user.profile ? { firstName: user.profile.firstName, lastName: user.profile.lastName, email } : {email};
    }
    
    if (userType === 'admin') {
      _data = { firstName, lastName, email };
    }

    const data = this.encrypter.encrypt(_data);
    const encUserId = this.encrypter.encryptString(id.toString());

    return { data, sub: encUserId };
  }
}
