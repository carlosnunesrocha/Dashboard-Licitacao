import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserPrincipal } from '../../common/constants.js';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserPrincipal => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);