import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { IS_PUBLIC_KEY, AuthenticatedRequest } from '../decorators';
import { UsersService } from '../../modules/users/users.service';
import { SubscriptionTier } from '../enums';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
    private readonly logger = new Logger(FirebaseAuthGuard.name);
    private firebaseInitialized = false;

    constructor(
        private readonly reflector: Reflector,
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
    ) {
        this.initFirebase();
    }

    private initFirebase(): void {
        const projectId = this.configService.get<string>('firebase.projectId');
        const clientEmail = this.configService.get<string>(
            'firebase.clientEmail',
        );
        const privateKey = this.configService.get<string>(
            'firebase.privateKey',
        );

        if (projectId && clientEmail && privateKey) {
            if (getApps().length === 0) {
                initializeApp({
                    credential: cert({
                        projectId,
                        clientEmail,
                        privateKey,
                    }),
                });
            }
            this.firebaseInitialized = true;
            this.logger.log('Firebase Admin SDK initialized.');
        } else {
            this.logger.log(
                'Firebase credentials not configured; running with DEV_MOCK_EXTERNAL_SERVICES fallback.',
            );
        }
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()],
        );

        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            if (isPublic) {
                request.user = null;
                return true;
            }
            throw new UnauthorizedException(
                'Bu işlem için giriş yapmanız gerekmektedir (Bearer token eksik).',
            );
        }

        const token = authHeader.slice(7).trim();
        const devMock = this.configService.get<boolean>(
            'app.devMockExternalServices',
            true,
        );

        try {
            if (
                devMock &&
                (token.startsWith('dev:') || !this.firebaseInitialized)
            ) {
                // Dev format: "dev:<uid>" veya "dev:premium:<uid>"
                const raw = token.startsWith('dev:') ? token.slice(4) : token;
                const isPremium = raw.startsWith('premium:');
                const uid = isPremium ? raw.slice(8) : raw || 'dev-user-1';
                const user = await this.usersService.findOrCreateFromAuth({
                    firebase_uid: uid,
                    email: `${uid}@dev.beenhere.app`,
                    display_name: `Dev Traveler (${uid})`,
                    default_tier: isPremium
                        ? SubscriptionTier.PREMIUM
                        : SubscriptionTier.FREE,
                });
                request.user = user;
                return true;
            }

            if (!this.firebaseInitialized) {
                throw new UnauthorizedException(
                    'Firebase Admin SDK yapılandırılmamış.',
                );
            }

            const decoded = await getAuth().verifyIdToken(token);
            const displayName =
                typeof decoded.name === 'string' ? decoded.name : null;
            const user = await this.usersService.findOrCreateFromAuth({
                firebase_uid: decoded.uid,
                email: decoded.email ?? null,
                display_name: displayName,
                avatar_url: decoded.picture ?? null,
            });
            request.user = user; // Bu atamayı db'den gelen userı muhtelif yerlerde kullanacağımız için çağırıyoruz
            return true;
        } catch (error) {
            if (isPublic) {
                request.user = null;
                return true;
            }
            throw new UnauthorizedException(
                error instanceof Error
                    ? error.message
                    : 'Geçersiz veya süresi dolmuş kimlik doğrulama anahtarı.',
            );
        }
    }
}
