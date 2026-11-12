import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    devMockExternalServices:
        (process.env.DEV_MOCK_EXTERNAL_SERVICES ?? 'true') === 'true',
}));

export const databaseConfig = registerAs('database', () => ({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'beenhere',
    password: process.env.DB_PASSWORD ?? 'beenhere_secret',
    database: process.env.DB_NAME ?? 'been_here_db',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
}));

export const redisConfig = registerAs('redis', () => ({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
}));

export const firebaseConfig = registerAs('firebase', () => ({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'been-here-dev',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : '',
}));

export const googlePlacesConfig = registerAs('googlePlaces', () => ({
    apiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
    lazyRefreshDays: parseInt(process.env.PLACE_LAZY_REFRESH_DAYS ?? '30', 10),
}));

export const r2Config = registerAs('r2', () => ({
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? 'been-here-media',
    publicBaseUrl:
        process.env.R2_PUBLIC_BASE_URL ?? 'https://media.beenhere.app',
    presignedUrlExpiresSeconds: parseInt(
        process.env.R2_PRESIGNED_URL_EXPIRES_SECONDS ?? '900',
        10,
    ),
}));

export const quotasConfig = registerAs('quotas', () => ({
    freeMaxDraftRoutes: parseInt(
        process.env.QUOTA_FREE_MAX_DRAFT_ROUTES ?? '3',
        10,
    ),
    freeMaxUnpublishedEditDrafts: parseInt(
        process.env.QUOTA_FREE_MAX_UNPUBLISHED_EDIT_DRAFTS ?? '1',
        10,
    ),
    freeMaxStopsPerRoute: parseInt(
        process.env.QUOTA_FREE_MAX_STOPS_PER_ROUTE ?? '20',
        10,
    ),
    freeMaxPhotosPerStop: parseInt(
        process.env.QUOTA_FREE_MAX_PHOTOS_PER_STOP ?? '3',
        10,
    ),
    freeMaxPrivateMemories: parseInt(
        process.env.QUOTA_FREE_MAX_PRIVATE_MEMORIES ?? '5',
        10,
    ),
    freeMonthlyMemories: parseInt(
        process.env.QUOTA_FREE_MAX_PRIVATE_MEMORIES ?? '5',
        10,
    ),
    freeMaxPlaceLists: parseInt(
        process.env.QUOTA_FREE_MAX_PLACE_LISTS ?? '3',
        10,
    ),
    freeMaxPlacesPerList: parseInt(
        process.env.QUOTA_FREE_MAX_PLACES_PER_LIST ?? '10',
        10,
    ),
    trustScoreShadowbanThreshold: parseInt(
        process.env.TRUST_SCORE_SHADOWBAN_THRESHOLD ?? '50',
        10,
    ),
    forkRewardTier1Points: parseInt(
        process.env.FORK_REWARD_TIER1_POINTS ?? '5',
        10,
    ),
    forkRewardTier2Points: parseInt(
        process.env.FORK_REWARD_TIER2_POINTS ?? '15',
        10,
    ),
    forkRewardTier3Points: parseInt(
        process.env.FORK_REWARD_TIER3_POINTS ?? '25',
        10,
    ),
    forkRewardBonusPerExtraStop: parseInt(
        process.env.FORK_REWARD_BONUS_PER_EXTRA_STOP ?? '2',
        10,
    ),
}));
