import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Place } from '../places/entities/place.entity';
import { Route } from '../routes/entities/route.entity';
import { RouteStop } from '../routes/entities/route-stop.entity';
import { UserRegionalScore } from './entities/user-regional-score.entity';
import { GlobalRank, RouteStatus, VerificationType } from '../../common/enums';
import {
    CONTINENT_LABELS,
    COUNTRIES_CATALOG,
    ContinentCode,
    getContinentCountryMatchers,
    resolveCountryMetadata,
} from '../../common/constants/geography.constants';

@Injectable()
export class GamificationService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Place)
        private readonly placeRepo: Repository<Place>,
        @InjectRepository(Route)
        private readonly routeRepo: Repository<Route>,
        @InjectRepository(RouteStop)
        private readonly stopRepo: Repository<RouteStop>,
        @Optional()
        @InjectRepository(UserRegionalScore)
        private readonly regionalScoreRepo?: Repository<UserRegionalScore>,
    ) {}

    calculateGlobalRank(points: number): GlobalRank {
        if (points >= 50000) return GlobalRank.MASTER_OF_ROUTES;
        if (points >= 10000) return GlobalRank.ELITE_TRAVELER;
        if (points >= 2500) return GlobalRank.PATHFINDER;
        if (points >= 500) return GlobalRank.EXPLORER;
        return GlobalRank.WANDERER;
    }

    getPointsForVerification(type: VerificationType): number {
        switch (type) {
            case VerificationType.GEO_VERIFIED:
                return 50;
            case VerificationType.PHOTO_VERIFIED:
                return 20;
            case VerificationType.MANUAL:
            default:
                return 5;
        }
    }

    /**
     * `user_regional_scores` tablosuna kıta, ülke ve şehir bazlı puan yazar / günceller.
     * Böylece liderlik tablosu ve bölgesel uzmanlık sorguları doğrudan bu tablo üzerinden
     * yüksek performansla çalışır ve Publish/Fork bonus puanları da ilgili bölgeye kaydedilir.
     */
    async upsertRegionalScore(params: {
        userId: string;
        countryInput?: string | null;
        cityInput?: string | null;
        pointsToAdd: number;
        verifiedVisitsIncrement?: number;
        publishedRoutesIncrement?: number;
    }): Promise<UserRegionalScore | null> {
        if (!this.regionalScoreRepo) {
            return null;
        }

        const countryMeta = resolveCountryMetadata(
            params.countryInput ?? 'TR',
        );
        const countryCode =
            countryMeta?.code ??
            (params.countryInput?.trim().toUpperCase().slice(0, 10) || 'TR');
        const continent = countryMeta?.continent ?? 'EUROPE';
        const city = params.cityInput?.trim() || 'GENERAL';

        let record = await this.regionalScoreRepo.findOne({
            where: {
                user_id: params.userId,
                country_code: countryCode,
                city,
            },
        });

        if (!record) {
            record = this.regionalScoreRepo.create({
                user_id: params.userId,
                continent,
                country_code: countryCode,
                city,
                points: Math.max(0, params.pointsToAdd),
                verified_visits_count: Math.max(
                    0,
                    params.verifiedVisitsIncrement ?? 0,
                ),
                published_routes_count: Math.max(
                    0,
                    params.publishedRoutesIncrement ?? 0,
                ),
            });
        } else {
            record.continent = continent;
            record.points = Math.max(
                0,
                (record.points || 0) + params.pointsToAdd,
            );
            record.verified_visits_count = Math.max(
                0,
                (record.verified_visits_count || 0) +
                    (params.verifiedVisitsIncrement ?? 0),
            );
            record.published_routes_count = Math.max(
                0,
                (record.published_routes_count || 0) +
                    (params.publishedRoutesIncrement ?? 0),
            );
        }

        return this.regionalScoreRepo.save(record);
    }

    /**
     * Rota yayınlandığında (+30 / +50p) veya rotadan mekan forklandığında (+5 / +15 / +25p)
     * kazanılan puanı hem kullanıcının global puanına hem de rotanın ait olduğu ülke/şehir/kıta
     * (`user_regional_scores`) kaydına işler.
     */
    async addRegionalPointsForRoute(
        userId: string,
        routeId: string,
        pointsToAdd: number,
        isPublishEvent = false,
    ): Promise<void> {
        await this.addPointsToUser(userId, pointsToAdd);

        if (!this.regionalScoreRepo) {
            return;
        }

        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            return;
        }

        let targetCountry = route.countries?.[0] ?? null;
        let targetCity = route.cities?.[0] ?? null;

        if (!targetCountry || !targetCity) {
            const firstStop = await this.stopRepo.findOne({
                where: { route_id: route.id },
                order: { order_index: 'ASC' },
            });
            if (firstStop) {
                const place = await this.placeRepo.findOne({
                    where: { id: firstStop.place_id },
                });
                if (place) {
                    targetCountry = targetCountry ?? place.country_code;
                    targetCity = targetCity ?? place.city;
                }
            }
        }

        await this.upsertRegionalScore({
            userId,
            countryInput: targetCountry,
            cityInput: targetCity,
            pointsToAdd,
            publishedRoutesIncrement: isPublishEvent ? 1 : 0,
        });
    }

    /**
     * Ziyaret/Anı veya Durak doğrulamasına göre kullanıcı puanını, bölgesel skor tablosunu (`user_regional_scores`),
     * rütbesini ve mekanın Verified-Hype puanını günceller.
     */
    async recordPlaceVisitReward(
        userId: string,
        placeId: string,
        verificationType: VerificationType,
    ): Promise<void> {
        const points = this.getPointsForVerification(verificationType);
        await this.addPointsToUser(userId, points);

        const isVerifiedVisit =
            verificationType === VerificationType.GEO_VERIFIED ||
            verificationType === VerificationType.PHOTO_VERIFIED;

        // Sadece GEO_VERIFIED ve PHOTO_VERIFIED ziyaretler mekanın verified_hype_score değerini artırır
        if (isVerifiedVisit) {
            const hypeIncrement =
                verificationType === VerificationType.GEO_VERIFIED ? 3 : 1;
            await this.placeRepo.increment(
                { id: placeId },
                'verified_hype_score',
                hypeIncrement,
            );
        }

        // Mekanın bulunduğu kıta, ülke ve şehir için `user_regional_scores` tablosunu güncelle
        if (this.regionalScoreRepo) {
            const place = await this.placeRepo.findOne({
                where: { id: placeId },
            });
            await this.upsertRegionalScore({
                userId,
                countryInput: place?.country_code ?? 'TR',
                cityInput: place?.city ?? 'GENERAL',
                pointsToAdd: points,
                verifiedVisitsIncrement: isVerifiedVisit ? 1 : 0,
            });
        }
    }

    async addPointsToUser(
        userId: string,
        pointsToAdd: number,
    ): Promise<User | null> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            return null;
        }

        user.global_points = Math.max(
            0,
            (user.global_points || 0) + pointsToAdd,
        );
        user.global_rank = this.calculateGlobalRank(user.global_points);
        return this.userRepo.save(user);
    }

    /**
     * Keşif Destesi'nde sağa/sola kaydırma oranlarına göre kullanıcının görünmez Trust Score'unu günceller.
     */
    async recalculateUserTrustScore(userId: string): Promise<number> {
        const stats = await this.routeRepo
            .createQueryBuilder('route')
            .select('COALESCE(SUM(route.swipe_right_count), 0)', 'rightCount')
            .addSelect('COALESCE(SUM(route.swipe_left_count), 0)', 'leftCount')
            .addSelect('COALESCE(SUM(route.fork_count), 0)', 'forkCount')
            .where('route.user_id = :userId', { userId })
            .getRawOne<{
                rightCount: string;
                leftCount: string;
                forkCount: string;
            }>();

        const rightCount = parseInt(stats?.rightCount ?? '0', 10);
        const leftCount = parseInt(stats?.leftCount ?? '0', 10);
        const forkCount = parseInt(stats?.forkCount ?? '0', 10);
        const totalSwipes = rightCount + leftCount;

        if (totalSwipes < 5) {
            return 100;
        }

        const leftRatio = leftCount / totalSwipes;
        const forkBonus = Math.min(15, forkCount * 3);
        const computedScore = Math.max(
            10,
            Math.min(100, Math.round(100 - leftRatio * 75 + forkBonus)),
        );

        await this.userRepo.update(
            { id: userId },
            { trust_score: computedScore },
        );
        return computedScore;
    }

    /**
     * Sezonluk / Aylık / Tüm Zamanlar ve Kıta > Ülke Hiyerarşik Liderlik Tablosu
     * - GLOBAL seçildiğinde: Gezginlerin global puanı (`global_points`) sıralanır.
     * - Kıta (Avrupa > Tümü, Asya > Tümü...) veya Tekil Ülke (Avrupa > Almanya...) seçildiğinde:
     *   Başka bir kıta/ülkede 50.000 puan kasmış birinin o ülkede 5.000 puan kasmış yerel gezginin önüne
     *   geçmemesi için YALNIZCA ilgili kıta/ülke sınırlarındaki durak ve rota etkileşimlerinden kazanılan
     *   adil bölgesel puan (`regional_points`) hesaplanarak sıralanır.
     * - Not: Ligler ekranında ülke seçimi tekildir (çoktan seçmeli değildir).
     */
    async getLeaderboard(options: {
        period?: 'ALL_TIME' | 'MONTHLY' | 'SEASONAL';
        continent?: ContinentCode;
        country?: string;
        city?: string;
        limit?: number;
    }) {
        const limit = Math.min(options.limit ?? 20, 100);
        const period = options.period ?? 'ALL_TIME';
        const continent: ContinentCode = options.continent ?? 'GLOBAL';
        const rawCountry = options.country?.trim();
        const isAllCountriesInContinent =
            !rawCountry ||
            rawCountry.toLowerCase() === 'all' ||
            rawCountry.toLowerCase() === 'tümü';

        if (
            period === 'ALL_TIME' &&
            continent === 'GLOBAL' &&
            isAllCountriesInContinent &&
            !options.city
        ) {
            const topUsers = await this.userRepo.find({
                order: { global_points: 'DESC' },
                take: limit,
                select: {
                    id: true,
                    username: true,
                    display_name: true,
                    avatar_url: true,
                    avatar_urls: true,
                    global_points: true,
                    global_rank: true,
                },
            });
            return {
                period,
                continent: 'GLOBAL',
                country: null,
                city: null,
                ranking_mode: 'GLOBAL_POINTS',
                items: topUsers,
            };
        }

        // Tekil ülke filtresi (Örn: Almanya / DE) veya Kıta > Tümü filtresi
        let resolvedCountryCode: string | null = null;
        if (!isAllCountriesInContinent && rawCountry) {
            const countryMeta = resolveCountryMetadata(rawCountry);
            resolvedCountryCode =
                countryMeta?.code ?? rawCountry.toUpperCase();
        }

        // ALL_TIME bölgesel lig sorgularında doğrudan indexli `user_regional_scores` tablosunu kullan
        if (period === 'ALL_TIME' && this.regionalScoreRepo) {
            const rqb = this.regionalScoreRepo
                .createQueryBuilder('urs')
                .innerJoin(User, 'u', 'u.id = urs.user_id')
                .select('u.id', 'user_id')
                .addSelect('u.username', 'username')
                .addSelect('u.display_name', 'display_name')
                .addSelect('u.avatar_url', 'avatar_url')
                .addSelect('u.global_rank', 'global_rank')
                .addSelect(
                    'SUM(urs.verified_visits_count)',
                    'verified_visits_count',
                )
                .addSelect(
                    'SUM(urs.published_routes_count)',
                    'published_routes_count',
                )
                .addSelect('SUM(urs.points)', 'regional_points');

            if (resolvedCountryCode) {
                rqb.andWhere('UPPER(urs.country_code) = :countryCode', {
                    countryCode: resolvedCountryCode,
                });
            } else if (continent !== 'GLOBAL') {
                rqb.andWhere('urs.continent = :continent', { continent });
            }

            if (options.city) {
                rqb.andWhere('urs.city ILIKE :city', { city: options.city });
            }

            const regionalRows = await rqb
                .groupBy('u.id')
                .addGroupBy('u.username')
                .addGroupBy('u.display_name')
                .addGroupBy('u.avatar_url')
                .addGroupBy('u.global_rank')
                .orderBy('SUM(urs.points)', 'DESC')
                .addOrderBy('SUM(urs.verified_visits_count)', 'DESC')
                .limit(limit)
                .getRawMany<{
                    user_id: string;
                    username: string;
                    display_name: string | null;
                    avatar_url: string | null;
                    global_rank: GlobalRank;
                    verified_visits_count: string;
                    published_routes_count: string;
                    regional_points: string;
                }>();

            if (regionalRows.length > 0) {
                return {
                    period,
                    continent,
                    country:
                        resolvedCountryCode ??
                        (continent !== 'GLOBAL' ? 'ALL' : null),
                    city: options.city ?? null,
                    ranking_mode: 'USER_REGIONAL_SCORES_TABLE',
                    items: regionalRows.map((row, idx) => ({
                        rank_position: idx + 1,
                        user_id: row.user_id,
                        username: row.username,
                        display_name: row.display_name,
                        avatar_url: row.avatar_url,
                        global_rank: row.global_rank,
                        verified_visits_count: parseInt(
                            row.verified_visits_count ?? '0',
                            10,
                        ),
                        published_routes_count: parseInt(
                            row.published_routes_count ?? '0',
                            10,
                        ),
                        regional_points: parseInt(
                            row.regional_points ?? '0',
                            10,
                        ),
                    })),
                };
            }
        }

        const qb = this.stopRepo
            .createQueryBuilder('stop')
            .innerJoin(Route, 'r', 'r.id = stop.route_id')
            .innerJoin(User, 'u', 'u.id = r.user_id')
            .innerJoin(Place, 'p', 'p.id = stop.place_id')
            .select('u.id', 'user_id')
            .addSelect('u.username', 'username')
            .addSelect('u.display_name', 'display_name')
            .addSelect('u.avatar_url', 'avatar_url')
            .addSelect('u.global_rank', 'global_rank')
            .addSelect('COUNT(stop.id)', 'verified_visits_count')
            .addSelect(
                `SUM(
                    CASE
                        WHEN stop.verification_type = 'GEO_VERIFIED' THEN 50
                        WHEN stop.verification_type = 'PHOTO_VERIFIED' THEN 20
                        ELSE 5
                    END
                ) + COALESCE(MAX(r.fork_count), 0) * 10 + COALESCE(MAX(r.swipe_right_count), 0) * 2`,
                'regional_points',
            )
            .where('stop.verification_type IN (:...verifiedTypes)', {
                verifiedTypes: [
                    VerificationType.GEO_VERIFIED,
                    VerificationType.PHOTO_VERIFIED,
                    VerificationType.MANUAL,
                ],
            });

        if (period === 'MONTHLY') {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            qb.andWhere('r.created_at >= :startOfMonth', { startOfMonth });
        } else if (period === 'SEASONAL') {
            const ninetyDaysAgo = new Date(
                Date.now() - 90 * 24 * 60 * 60 * 1000,
            );
            qb.andWhere('r.created_at >= :ninetyDaysAgo', {
                ninetyDaysAgo,
            });
        }

        if (resolvedCountryCode) {
            qb.andWhere('UPPER(p.country_code) = :countryCode', {
                countryCode: resolvedCountryCode,
            });
        } else if (continent !== 'GLOBAL') {
            const { codes } = getContinentCountryMatchers(continent);
            if (codes.length > 0) {
                qb.andWhere('UPPER(p.country_code) IN (:...continentCodes)', {
                    continentCodes: codes,
                });
            }
        }

        if (options.city) {
            qb.andWhere('p.city ILIKE :city', { city: options.city });
        }

        const rows = await qb
            .groupBy('u.id')
            .addGroupBy('u.username')
            .addGroupBy('u.display_name')
            .addGroupBy('u.avatar_url')
            .addGroupBy('u.global_rank')
            .orderBy('regional_points', 'DESC')
            .addOrderBy('COUNT(stop.id)', 'DESC')
            .limit(limit)
            .getRawMany<{
                user_id: string;
                username: string;
                display_name: string | null;
                avatar_url: string | null;
                global_rank: GlobalRank;
                verified_visits_count: string;
                regional_points: string;
            }>();

        const formattedItems = rows.map((row, idx) => ({
            rank_position: idx + 1,
            user_id: row.user_id,
            username: row.username,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            global_rank: row.global_rank,
            verified_visits_count: parseInt(
                row.verified_visits_count ?? '0',
                10,
            ),
            regional_points: parseInt(row.regional_points ?? '0', 10),
        }));

        return {
            period,
            continent,
            country: resolvedCountryCode ?? (continent !== 'GLOBAL' ? 'ALL' : null),
            city: options.city ?? null,
            ranking_mode: 'REGIONAL_POINTS',
            items: formattedItems,
        };
    }

    /**
     * Anasayfa ve Ligler (Leaderboards) ekranları için Kıta > Ülke Hiyerarşisi.
     * Her kıtanın altındaki ülkeleri en çok rota (PUBLISHED) bulunan ülke en üstte olacak şekilde sıralar
     * ve opsiyonel ülke arama metni (q) ile filtreler.
     */
    async getGeographyHierarchy(searchQuery?: string) {
        const publishedRoutes = await this.routeRepo.find({
            where: { status: RouteStatus.PUBLISHED },
            select: { id: true, countries: true },
        });

        const countryRouteCounts = new Map<string, number>();
        for (const r of publishedRoutes) {
            const matchedCodesForRoute = new Set<string>();
            for (const rawCountry of r.countries ?? []) {
                const meta = resolveCountryMetadata(rawCountry);
                if (meta) {
                    matchedCodesForRoute.add(meta.code);
                }
            }
            for (const code of matchedCodesForRoute) {
                countryRouteCounts.set(
                    code,
                    (countryRouteCounts.get(code) ?? 0) + 1,
                );
            }
        }

        const normalizedQ = searchQuery?.trim().toLowerCase() ?? '';
        const continentsOrder: Array<Exclude<ContinentCode, 'GLOBAL'>> = [
            'EUROPE',
            'ASIA',
            'NORTH_AMERICA',
            'SOUTH_AMERICA',
            'AFRICA',
            'OCEANIA',
        ];

        const continents = continentsOrder.map((continentCode) => {
            const countriesInContinent = COUNTRIES_CATALOG.filter(
                (c) => c.continent === continentCode,
            )
                .filter((c) => {
                    if (!normalizedQ) return true;
                    return (
                        c.name_tr.toLowerCase().includes(normalizedQ) ||
                        c.name_en.toLowerCase().includes(normalizedQ) ||
                        c.code.toLowerCase().includes(normalizedQ)
                    );
                })
                .map((c) => ({
                    code: c.code,
                    name_tr: c.name_tr,
                    name_en: c.name_en,
                    route_count: countryRouteCounts.get(c.code) ?? 0,
                }))
                .sort(
                    (a, b) =>
                        b.route_count - a.route_count ||
                        a.name_tr.localeCompare(b.name_tr, 'tr'),
                );

            const totalRoutesInContinent = countriesInContinent.reduce(
                (sum, item) => sum + item.route_count,
                0,
            );

            return {
                continent: continentCode,
                name_tr: CONTINENT_LABELS[continentCode].name_tr,
                name_en: CONTINENT_LABELS[continentCode].name_en,
                total_routes_count: totalRoutesInContinent,
                all_option: {
                    code: 'ALL',
                    name_tr: 'Tümü',
                    name_en: 'All',
                },
                countries: countriesInContinent,
            };
        });

        return {
            global_option: {
                continent: 'GLOBAL',
                name_tr: 'Global',
                name_en: 'Global',
                total_routes_count: publishedRoutes.length,
            },
            continents,
        };
    }

    /**
     * Bölgesel Uzmanlık (Regional Mastery) ve Tematik Rozetler (Thematic Expertise)
     */
    async getUserBadgesAndMastery(userId: string) {
        const regionalRows = await this.stopRepo
            .createQueryBuilder('stop')
            .innerJoin(Route, 'r', 'r.id = stop.route_id')
            .innerJoin(Place, 'p', 'p.id = stop.place_id')
            .select('p.city', 'city')
            .addSelect('p.country_code', 'country_code')
            .addSelect('COUNT(stop.id)', 'visit_count')
            .where('r.user_id = :userId', { userId })
            .andWhere('stop.verification_type IN (:...verifiedTypes)', {
                verifiedTypes: [
                    VerificationType.GEO_VERIFIED,
                    VerificationType.PHOTO_VERIFIED,
                ],
            })
            .andWhere('p.city IS NOT NULL')
            .groupBy('p.city')
            .addGroupBy('p.country_code')
            .orderBy('COUNT(stop.id)', 'DESC')
            .getRawMany<{
                city: string;
                country_code: string;
                visit_count: string;
            }>();

        const categoryRows = await this.stopRepo
            .createQueryBuilder('stop')
            .innerJoin(Route, 'r', 'r.id = stop.route_id')
            .innerJoin(Place, 'p', 'p.id = stop.place_id')
            .select('p.ui_category', 'ui_category')
            .addSelect('COUNT(stop.id)', 'visit_count')
            .where('r.user_id = :userId', { userId })
            .groupBy('p.ui_category')
            .getRawMany<{ ui_category: string; visit_count: string }>();

        const regionalMasteries = regionalRows
            .filter((r) => parseInt(r.visit_count, 10) >= 3)
            .map((r) => ({
                badge: `${r.city} Uzmanı`,
                city: r.city,
                country_code: r.country_code,
                verified_visits: parseInt(r.visit_count, 10),
            }));

        const thematicBadges: string[] = [];
        for (const row of categoryRows) {
            const count = parseInt(row.visit_count, 10);
            if (row.ui_category === 'FOOD' && count >= 3) {
                thematicBadges.push('Gurme Gezgin');
            }
            if (row.ui_category === 'DESTINATION' && count >= 3) {
                thematicBadges.push('Tarih ve Doğa Kaşifi');
            }
            if (row.ui_category === 'ACCOMMODATION' && count >= 3) {
                thematicBadges.push('Konaklama Gurusu');
            }
        }

        return {
            user_id: userId,
            regional_masteries: regionalMasteries,
            thematic_badges: thematicBadges,
        };
    }

    /**
     * Kullanıcının `user_regional_scores` tablosundaki Kıta, Ülke ve Şehir bazlı skorlarını getirir.
     */
    async getUserRegionalScores(userId: string) {
        if (!this.regionalScoreRepo) {
            return { user_id: userId, items: [], count: 0 };
        }

        const scores = await this.regionalScoreRepo.find({
            where: { user_id: userId },
            order: { points: 'DESC' },
        });

        return {
            user_id: userId,
            items: scores,
            count: scores.length,
        };
    }
}
