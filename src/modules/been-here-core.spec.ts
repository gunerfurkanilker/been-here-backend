import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    GlobalRank,
    PlaceStatus,
    RouteStatus,
    SubscriptionTier,
    UiCategory,
    VerificationType,
} from '../common/enums';
import { GamificationService } from './gamification/gamification.service';
import { PlacesService } from './places/places.service';
import { MediaService } from './media/media.service';
import { RoutesService } from './routes/routes.service';
import { UsersService } from './users/users.service';
import { User } from './users/entities/user.entity';
import { Route } from './routes/entities/route.entity';

describe('Been Here Core Business Rules (TRD & Manifesto)', () => {
    describe('PlacesService — UI Category Mapping & Status', () => {
        let placesService: PlacesService;

        beforeEach(() => {
            placesService = new PlacesService(
                {} as never,
                new ConfigService(),
                undefined,
            );
        });

        it('maps Google food, lodging, and destination types to 3 UI categories', () => {
            expect(
                placesService.mapGoogleTypesToUiCategory(['bakery', 'cafe']),
            ).toBe(UiCategory.FOOD);
            expect(
                placesService.mapGoogleTypesToUiCategory([
                    'campground',
                    'lodging',
                ]),
            ).toBe(UiCategory.ACCOMMODATION);
            expect(
                placesService.mapGoogleTypesToUiCategory([
                    'museum',
                    'point_of_interest',
                ]),
            ).toBe(UiCategory.DESTINATION);
        });

        it('maps Google businessStatus to Soft-Delete PlaceStatus', () => {
            expect(
                placesService.mapBusinessStatusToPlaceStatus(
                    'CLOSED_PERMANENTLY',
                ),
            ).toBe(PlaceStatus.CLOSED_PERMANENTLY);
            expect(
                placesService.mapBusinessStatusToPlaceStatus(
                    'CLOSED_TEMPORARILY',
                ),
            ).toBe(PlaceStatus.CLOSED_TEMPORARILY);
            expect(
                placesService.mapBusinessStatusToPlaceStatus('OPERATIONAL'),
            ).toBe(PlaceStatus.ACTIVE);
        });

        it('parses closed days from weekdayDescriptions and builds warnings for closed status & closed days', () => {
            const parsed = placesService.parseOpeningHours([
                'Pazartesi: Kapalı',
                'Salı: 08:30–17:30',
            ]);
            expect(parsed?.closed_days).toEqual(['Pazartesi']);

            const warnings = placesService.buildPlaceWarnings({
                default_name: 'İzmir Arkeoloji Müzesi',
                status: PlaceStatus.CLOSED_TEMPORARILY,
                opening_hours: parsed,
                community_warnings: {
                    'Yüksek UV / Gölgesiz': 12,
                    'Dik Tırmanış': 5,
                },
            } as never);

            expect(warnings.is_closed).toBe(true);
            expect(warnings.status_warning).toBe(
                'İzmir Arkeoloji Müzesi geçici olarak kapalıdır.',
            );
            expect(warnings.opening_hours_warning).toBe(
                'İzmir Arkeoloji Müzesi Pazartesi günleri kapalıdır.',
            );
            expect(warnings.community_warning_badges[0]).toEqual({
                label: 'Yüksek UV / Gölgesiz',
                votes: 12,
            });
            expect(warnings.warnings).toHaveLength(3);
            expect(warnings.warnings[2]).toContain(
                'Yüksek UV / Gölgesiz (12 oy)',
            );
        });

        it('enforces Free user PlaceList quotas (max 3 lists, max 10 places/list) and defaults title to "Favori Liste X"', async () => {
            const listCountMock = jest.fn().mockResolvedValue(0);
            const listSaveMock = jest.fn((l: unknown) => Promise.resolve(l));
            const listCreateMock = jest.fn((l: unknown) => l);
            const listFindOneMock = jest
                .fn()
                .mockResolvedValue({ id: 'list-1', user_id: 'free-1' });
            const itemCountMock = jest.fn().mockResolvedValue(10);
            const itemFindOneMock = jest.fn().mockResolvedValue(null);

            const serviceWithLists = new PlacesService(
                {
                    findOne: jest.fn().mockResolvedValue({ id: 'place-1' }),
                } as never,
                new ConfigService(),
                undefined,
                {
                    count: listCountMock,
                    create: listCreateMock,
                    save: listSaveMock,
                    findOne: listFindOneMock,
                } as never,
                {
                    count: itemCountMock,
                    findOne: itemFindOneMock,
                    create: jest.fn((i: unknown) => i),
                    save: jest.fn((i: unknown) => Promise.resolve(i)),
                } as never,
                new UsersService({} as never),
            );

            const freeUser = {
                id: 'free-1',
                subscription_tier: SubscriptionTier.FREE,
                subscription_expires_at: null,
            } as User;

            // Default naming when title is omitted
            const createdList = await serviceWithLists.createPlaceList(
                freeUser,
                {},
            );
            expect(createdList.title).toBe('Favori Liste 1');

            // Free user reaching 3 lists cannot create a 4th
            listCountMock.mockResolvedValueOnce(3);
            await expect(
                serviceWithLists.createPlaceList(freeUser, {
                    title: 'Ege Koyları',
                }),
            ).rejects.toThrow(ForbiddenException);

            // Free user reaching 10 items in a list cannot add an 11th
            await expect(
                serviceWithLists.addPlaceToList(freeUser, 'list-1', {
                    place_id: 'place-1',
                }),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('GamificationService — Ranks, Points & Verified Hype Score', () => {
        let gamificationService: GamificationService;
        const incrementMock = jest.fn();
        const userFindOneMock = jest.fn();
        const userSaveMock = jest.fn((u: User) => Promise.resolve(u));

        beforeEach(() => {
            incrementMock.mockClear();
            userFindOneMock.mockClear();
            userSaveMock.mockClear();

            gamificationService = new GamificationService(
                {
                    findOne: userFindOneMock,
                    save: userSaveMock,
                } as never,
                {
                    increment: incrementMock,
                } as never,
                {} as never,
                {} as never,
            );
        });

        it('calculates GlobalRank accurately across thresholds', () => {
            expect(gamificationService.calculateGlobalRank(0)).toBe(
                GlobalRank.WANDERER,
            );
            expect(gamificationService.calculateGlobalRank(500)).toBe(
                GlobalRank.EXPLORER,
            );
            expect(gamificationService.calculateGlobalRank(2500)).toBe(
                GlobalRank.PATHFINDER,
            );
            expect(gamificationService.calculateGlobalRank(10000)).toBe(
                GlobalRank.ELITE_TRAVELER,
            );
            expect(gamificationService.calculateGlobalRank(50000)).toBe(
                GlobalRank.MASTER_OF_ROUTES,
            );
        });

        it('increments verified_hype_score for GEO_VERIFIED and PHOTO_VERIFIED, but NOT for MANUAL', async () => {
            userFindOneMock.mockResolvedValue({
                id: 'u1',
                global_points: 490,
                global_rank: GlobalRank.WANDERER,
            });

            await gamificationService.recordPlaceVisitReward(
                'u1',
                'place-1',
                VerificationType.MANUAL,
            );
            expect(incrementMock).not.toHaveBeenCalled();

            await gamificationService.recordPlaceVisitReward(
                'u1',
                'place-1',
                VerificationType.PHOTO_VERIFIED,
            );
            expect(incrementMock).toHaveBeenCalledWith(
                { id: 'place-1' },
                'verified_hype_score',
                1,
            );

            await gamificationService.recordPlaceVisitReward(
                'u1',
                'place-1',
                VerificationType.GEO_VERIFIED,
            );
            expect(incrementMock).toHaveBeenCalledWith(
                { id: 'place-1' },
                'verified_hype_score',
                3,
            );
        });
    });

    describe('MediaService — Free vs Premium Quotas & Video Restrictions', () => {
        let mediaService: MediaService;
        let usersService: UsersService;

        beforeEach(() => {
            usersService = new UsersService({} as never);
            mediaService = new MediaService(
                new ConfigService(),
                usersService,
                { findOne: jest.fn() } as never,
                { findOne: jest.fn(), find: jest.fn() } as never,
            );
        });

        it('blocks video/mp4 upload for FREE users and allows it for PREMIUM users', async () => {
            const freeUser = {
                id: 'free-1',
                subscription_tier: SubscriptionTier.FREE,
                subscription_expires_at: null,
            } as User;

            await expect(
                mediaService.createPresignedUploadUrl(freeUser, {
                    file_name: 'clip.mp4',
                    mime_type: 'video/mp4',
                    target_type: 'ROUTE_STOP',
                }),
            ).rejects.toThrow(ForbiddenException);

            const premiumUser = {
                id: 'prem-1',
                subscription_tier: SubscriptionTier.PREMIUM,
                subscription_expires_at: null,
            } as User;

            const res = await mediaService.createPresignedUploadUrl(
                premiumUser,
                {
                    file_name: 'clip.mp4',
                    mime_type: 'video/mp4',
                    target_type: 'ROUTE_STOP',
                },
            );
            expect(res.mime_type).toBe('video/mp4');
            expect(res.upload_url).toContain('.mp4');
        });

        it('validates immediate stop media attachment quotas (max 3 per stop, max 20 stops x 3 = 60 per route)', () => {
            const freeUser = {
                id: 'free-1',
                subscription_tier: SubscriptionTier.FREE,
                subscription_expires_at: null,
            } as User;

            // 3 photos in a single stop is allowed
            expect(() =>
                mediaService.validateStopMediaQuota(
                    freeUser,
                    ['a.webp', 'b.webp', 'c.webp'],
                    0,
                ),
            ).not.toThrow();

            // Exceeding 3 photos in a single stop (4 photos) throws
            expect(() =>
                mediaService.validateStopMediaQuota(
                    freeUser,
                    ['a.webp', 'b.webp', 'c.webp', 'd.webp'],
                    0,
                ),
            ).toThrow(ForbiddenException);

            // Exceeding 60 total photos across the route (58 in other stops + 3 in current = 61)
            expect(() =>
                mediaService.validateStopMediaQuota(
                    freeUser,
                    ['a.webp', 'b.webp', 'c.webp'],
                    58,
                ),
            ).toThrow(ForbiddenException);
        });
    });

    describe('RoutesService — 3 + 1 Draft Quota & Max 20 Stops per Route', () => {
        it('allows unpublishing 1 published route into the +1 edit slot and enforces max 20 stops per route for FREE users', async () => {
            const countMock = jest.fn();
            const usersService = new UsersService({} as never);
            const routesService = new RoutesService(
                { count: countMock } as never,
                {} as never,
                {} as never,
                {} as never,
                new ConfigService(),
                usersService,
                {} as never,
                {} as never,
            );

            const freeUser = {
                id: 'free-1',
                subscription_tier: SubscriptionTier.FREE,
                subscription_expires_at: null,
            } as User;

            // 0 existing unpublished-edit drafts -> allowed (+1 slot available)
            countMock.mockResolvedValueOnce(0);
            await expect(
                routesService.enforceDraftRouteQuota(freeUser, 'UNPUBLISH', {
                    id: 'r-pub',
                    status: RouteStatus.PUBLISHED,
                } as Route),
            ).resolves.toBeUndefined();

            // Already 1 unpublished-edit draft -> blocks a 2nd unpublish
            countMock.mockResolvedValueOnce(1);
            await expect(
                routesService.enforceDraftRouteQuota(freeUser, 'UNPUBLISH', {
                    id: 'r-pub-2',
                    status: RouteStatus.PUBLISHED,
                } as Route),
            ).rejects.toThrow(ForbiddenException);

            // Max 20 stops per route check
            expect(() =>
                routesService.enforceRouteStopCountQuota(freeUser, 20),
            ).not.toThrow();
            expect(() =>
                routesService.enforceRouteStopCountQuota(freeUser, 21),
            ).toThrow(ForbiddenException);
        });

        it('forkRoute pulls selected stops into existing target_route_id and enforces 20-stop limit', async () => {
            const routeFindOneMock = jest
                .fn()
                .mockResolvedValueOnce({
                    id: 'source-route',
                    user_id: 'other-user',
                    status: RouteStatus.PUBLISHED,
                })
                .mockResolvedValueOnce({
                    id: 'target-route',
                    user_id: 'free-1',
                    status: RouteStatus.DRAFT,
                    was_published: false,
                });

            const stopFindMock = jest
                .fn()
                // Source stops
                .mockResolvedValueOnce([
                    { id: 'src-stop-1', place_id: 'p-new-1', day_number: 1 },
                    { id: 'src-stop-2', place_id: 'p-new-2', day_number: 1 },
                ])
                // Target route already has 19 stops
                .mockResolvedValueOnce(
                    Array.from({ length: 19 }, (_, idx) => ({
                        id: `t-stop-${idx}`,
                        place_id: `p-existing-${idx}`,
                    })),
                );

            const usersService = new UsersService({} as never);
            const routesService = new RoutesService(
                {
                    findOne: routeFindOneMock,
                    count: jest.fn().mockResolvedValue(1),
                } as never,
                {
                    find: stopFindMock,
                } as never,
                {} as never,
                {} as never,
                new ConfigService(),
                usersService,
                {} as never,
                {} as never,
            );

            const freeUser = {
                id: 'free-1',
                subscription_tier: SubscriptionTier.FREE,
                subscription_expires_at: null,
            } as User;

            // Trying to pull 2 stops into a route that already has 19 stops (19 + 2 = 21 > 20) throws ForbiddenException
            await expect(
                routesService.forkRoute(freeUser, 'source-route', {
                    target_route_id: 'target-route',
                    selected_stop_ids: ['src-stop-1', 'src-stop-2'],
                }),
            ).rejects.toThrow(ForbiddenException);
        });
    });
});
