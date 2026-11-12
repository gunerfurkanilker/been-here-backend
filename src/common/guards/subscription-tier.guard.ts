import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, REQUIRED_SUBSCRIPTION_KEY } from '../decorators';
import { SubscriptionTier } from '../enums';

@Injectable()
export class SubscriptionTierGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredTier = this.reflector.getAllAndOverride<
            SubscriptionTier | undefined
        >(REQUIRED_SUBSCRIPTION_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredTier) {
            return true;
        }

        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const user = request.user;

        if (!user) {
            throw new UnauthorizedException(
                'Bu özelliğe erişmek için giriş yapmalısınız.',
            );
        }

        if (requiredTier === SubscriptionTier.PREMIUM) {
            const isExpired =
                user.subscription_expires_at !== null &&
                new Date(user.subscription_expires_at).getTime() < Date.now();

            if (
                user.subscription_tier !== SubscriptionTier.PREMIUM ||
                isExpired
            ) {
                throw new ForbiddenException(
                    'Bu özellik yalnızca Premium üyelere açıktır (Upgrade to Premium).',
                );
            }
        }

        return true;
    }
}
