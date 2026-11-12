import { SetMetadata } from '@nestjs/common';
import { SubscriptionTier } from '../enums';

export const REQUIRED_SUBSCRIPTION_KEY = 'requiredSubscriptionTier';
export const RequireSubscription = (tier: SubscriptionTier) =>
    SetMetadata(REQUIRED_SUBSCRIPTION_KEY, tier);
