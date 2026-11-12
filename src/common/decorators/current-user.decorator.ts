import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { User } from '../../modules/users/entities/user.entity';

export interface AuthenticatedRequest extends Request {
    user?: User | null;
}

export const CurrentUser = createParamDecorator(
    (data: keyof User | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
        const user = request.user ?? null;
        if (!user) {
            return null;
        }
        return data ? user[data] : user;
    },
);
