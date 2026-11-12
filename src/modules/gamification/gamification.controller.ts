import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { Public } from '../../common/decorators';
import type { ContinentCode } from '../../common/constants/geography.constants';

@ApiTags('Gamification')
@Controller('gamification')
export class GamificationController {
    constructor(private readonly gamificationService: GamificationService) {}

    @Public()
    @Get('geography-tree')
    @ApiOperation({
        summary:
            'Kıta > Ülke Hiyerarşisi (En çok rota bulunan ülkeler üstte + Ülke Arama) (Public)',
        description:
            'Hem Ligler (tekil seçim) hem de Anasayfa (çoklu seçim) için Global > Kıta (Avrupa, Asya, Kuzey Amerika, Güney Amerika...) > Ülkeler (Tümü, Almanya, Fransa...) ağacını rota sayılarına göre büyükten küçüğe sıralı döner.',
    })
    @ApiQuery({
        name: 'q',
        required: false,
        description: 'Ülke adı veya kodu araması (Örn: Almanya, Tayland)',
    })
    getGeographyTree(@Query('q') q?: string) {
        return this.gamificationService.getGeographyHierarchy(q);
    }

    @Public()
    @Get('leaderboard')
    @ApiOperation({
        summary:
            'Gezgin Liderlik Tablosu (Global veya Kıta > Tekil Ülke Bazlı Adil Bölgesel Sıralama) (Public)',
        description:
            'Global seçildiğinde global_points sıralanır; Kıta (Avrupa > Tümü) veya Ülke (Avrupa > Almanya) seçildiğinde yalnızca o bölge içindeki durak/rota etkileşimlerinden kazanılan bölgesel puan (regional_points) sıralanır.',
    })
    @ApiQuery({
        name: 'period',
        required: false,
        enum: ['ALL_TIME', 'MONTHLY', 'SEASONAL'],
    })
    @ApiQuery({
        name: 'continent',
        required: false,
        enum: [
            'GLOBAL',
            'EUROPE',
            'ASIA',
            'NORTH_AMERICA',
            'SOUTH_AMERICA',
            'AFRICA',
            'OCEANIA',
        ],
    })
    @ApiQuery({
        name: 'country',
        required: false,
        description: 'Tekil ülke seçimi (Örn: ALL, DE, Almanya, TH, Tayland)',
    })
    @ApiQuery({ name: 'city', required: false, description: 'Örn: İzmir' })
    @ApiQuery({ name: 'limit', required: false, example: 20 })
    getLeaderboard(
        @Query('period') period?: 'ALL_TIME' | 'MONTHLY' | 'SEASONAL',
        @Query('continent') continent?: ContinentCode,
        @Query('country') country?: string,
        @Query('city') city?: string,
        @Query('limit') limit?: string,
    ) {
        return this.gamificationService.getLeaderboard({
            period,
            continent,
            country,
            city,
            limit: limit ? parseInt(limit, 10) : 20,
        });
    }

    @Public()
    @Get('users/:userId/badges')
    @ApiOperation({
        summary:
            'Kullanıcının Bölgesel Uzmanlık (Regional Mastery) ve Tematik Rozetlerini getir (Public)',
    })
    getUserBadges(@Param('userId') userId: string) {
        return this.gamificationService.getUserBadgesAndMastery(userId);
    }

    @Public()
    @Get('users/:userId/regional-scores')
    @ApiOperation({
        summary:
            'Kullanıcının Kıta, Ülke ve Şehir bazlı puanlarını (`user_regional_scores` tablosundan) getir (Public)',
    })
    getUserRegionalScores(@Param('userId') userId: string) {
        return this.gamificationService.getUserRegionalScores(userId);
    }
}
