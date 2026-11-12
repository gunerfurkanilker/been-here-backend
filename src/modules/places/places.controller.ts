import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlacesService } from './places.service';
import {
    AddPlaceToListDto,
    AddPlaceVibesDto,
    AddPlaceWarningsDto,
    CreatePlaceListDto,
    FetchGooglePlacesDto,
    NearbyPlacesQueryDto,
    PlaceRelatedRoutesQueryDto,
    PlacesFeedQueryDto,
    SearchPlacesQueryDto,
} from './dto/places.dto';
import { CurrentUser, Public } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import { Place } from './entities/place.entity';
import { PlaceList } from './entities/place-list.entity';
import { PlaceListItem } from './entities/place-list-item.entity';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
    constructor(private readonly placesService: PlacesService) {}

    @Public()
    @Get('feed')
    @ApiOperation({
        summary:
            'Arama Ekranı İlk Açılış Mekan Vitrini (Tercih Öncelikli + Rastgele Infinite Scroll)',
        description:
            'Kullanıcı arama ekranını açtığında (henüz arama yapmadan önce) alt alta (%80-%20 görünürlükle) sonsuz kaydırma (Infinite Scroll) şeklinde mekanları döner. Kullanıcının daha önce rotalarına eklediği veya flaglediği mekan türlerini önceliklendirir.',
    })
    getPlacesFeed(
        @Query() query: PlacesFeedQueryDto,
        @CurrentUser() user?: User | null,
    ) {
        return this.placesService.getPersonalizedPlacesFeed(query, user);
    }

    @Public()
    @Get('search')
    @ApiOperation({
        summary:
            'DB-First Mekan Arama ("1 - Yakınımdaki Konumları Göster" [NEARBY] veya "2 - Konum Bağımsız Genel Arama" [GLOBAL])',
        description:
            'Önce yerel PostgreSQL/PostGIS veritabanında ($0 maliyetle) arama yapar. Sonuçlarla birlikte kullanıcının sahibinden.com tarzı flag durumunu ve 3+ karakter girildiyse "Aradığınız mekanı bulamadınız mı? Google Haritalar\'da Ara" tetikleyicisini döner.',
    })
    searchPlaces(
        @Query() query: SearchPlacesQueryDto,
        @CurrentUser() user?: User | null,
    ) {
        return this.placesService.searchPlaces(query, user);
    }

    @ApiBearerAuth('bearer')
    @Get('lists/me')
    @ApiOperation({
        summary:
            'Kullanıcının kişisel mekan listelerini (Flag / Kaydedilenler) ve kota durumunu getir',
        description:
            'Üye olmayan ziyaretçiler erişemez. Free üyeler en fazla 3 liste (liste başı 10 mekan), Premium üyeler sınırsız liste oluşturabilir.',
    })
    getMyPlaceLists(@CurrentUser() user: User) {
        return this.placesService.getMyPlaceLists(user);
    }

    @ApiBearerAuth('bearer')
    @Post('lists')
    @ApiOperation({
        summary:
            'Yeni kişisel mekan listesi oluştur (Varsayılan öneri: "Favori Liste 1", "Favori Liste 2"...)',
        description:
            'title boş bırakılırsa otomatik olarak sıradaki "Favori Liste X" adını alır. Free üye için maksimum 3 liste kotası uygulanır.',
    })
    createPlaceList(
        @CurrentUser() user: User,
        @Body() dto: CreatePlaceListDto,
    ): Promise<PlaceList> {
        return this.placesService.createPlaceList(user, dto);
    }

    @ApiBearerAuth('bearer')
    @Get('lists/:listId')
    @ApiOperation({
        summary:
            'Belirli bir mekan listesinin içindeki mekanları ve uyarılarını getir',
    })
    getPlaceListDetails(
        @CurrentUser() user: User,
        @Param('listId') listId: string,
    ) {
        return this.placesService.getPlaceListDetails(user, listId);
    }

    @ApiBearerAuth('bearer')
    @Post('lists/:listId/items')
    @ApiOperation({
        summary:
            'Seçili listeye mekan ekle / flagle (Free üye kotası: Liste başına maks. 10 mekan)',
    })
    addPlaceToList(
        @CurrentUser() user: User,
        @Param('listId') listId: string,
        @Body() dto: AddPlaceToListDto,
    ): Promise<PlaceListItem> {
        return this.placesService.addPlaceToList(user, listId, dto);
    }

    @ApiBearerAuth('bearer')
    @Delete('lists/:listId/items/:placeId')
    @ApiOperation({
        summary: 'Listeden mekanı çıkar (Unflag)',
    })
    removePlaceFromList(
        @CurrentUser() user: User,
        @Param('listId') listId: string,
        @Param('placeId') placeId: string,
    ) {
        return this.placesService.removePlaceFromList(user, listId, placeId);
    }

    @ApiBearerAuth('bearer')
    @Delete('lists/:listId')
    @ApiOperation({
        summary: 'Kişisel mekan listesini tamamen sil',
    })
    deletePlaceList(
        @CurrentUser() user: User,
        @Param('listId') listId: string,
    ) {
        return this.placesService.deletePlaceList(user, listId);
    }

    @Public()
    @Get(':id')
    @ApiOperation({
        summary:
            'Mekan detayını getir ve 30 günü geçmişse arka planda Lazy Refresh tetikle (Public)',
        description:
            'Mekan verisini anında döner. Eğer last_synced_at > 30 gün ise BullMQ kuyruğuna sessizce yenileme işi bırakır.',
    })
    getPlaceById(@Param('id') id: string): Promise<Place> {
        return this.placesService.findById(id, true);
    }

    @Public()
    @Get(':id/routes')
    @ApiOperation({
        summary:
            'Mekanın İlintili Olduğu Rotalar (Mekan Kartındaki Sekme / Çekmece)',
        description:
            'Seçili mekanın durak (RouteStop) olarak yer aldığı yayınlanmış (PUBLISHED) rotaları listeler.',
    })
    getPlaceRelatedRoutes(
        @Param('id') id: string,
        @Query() query: PlaceRelatedRoutesQueryDto,
    ) {
        return this.placesService.getPlaceRelatedRoutes(id, query);
    }

    @Public()
    @Get(':id/nearby')
    @ApiOperation({
        summary:
            'Yakındaki Benzer Noktalar (Contextual Nearby Discovery) (Public)',
        description:
            'Seçili mekanın koordinatını merkez alarak 2-5 km yarıçapta aynı UI kategorisindeki popüler mekanları listeler.',
    })
    getNearbyPlaces(
        @Param('id') id: string,
        @Query() query: NearbyPlacesQueryDto,
    ) {
        return this.placesService.findNearbyContextual(id, query);
    }

    @ApiBearerAuth('bearer')
    @Post('fetch-google')
    @ApiOperation({
        summary:
            'Kullanıcı Tetiklemeli Google Places API Arama ve Çoklu Dil JSONB Upsert',
        description:
            'Kullanıcı "Google Maps ile daha fazla gör" butonuna bastığında çalışır. Aynı google_place_id varsa yeni dil çevirisini JSONB içine ekler, yoksa yeni mekan oluşturur.',
    })
    fetchFromGoogle(@Body() dto: FetchGooglePlacesDto): Promise<Place[]> {
        return this.placesService.fetchAndUpsertFromGoogle(dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/vibes')
    @ApiOperation({
        summary: 'Mekana topluluk Vibe / Atmosfer etiketi ekle ve oyla',
        description:
            '"Gün Batımı", "Sessiz", "Evcil Hayvan Dostu" gibi topluluk etiketlerinin oy sayısını artırır.',
    })
    addCommunityVibes(
        @Param('id') id: string,
        @Body() dto: AddPlaceVibesDto,
    ): Promise<Place> {
        return this.placesService.addCommunityVibes(id, dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/warnings')
    @ApiOperation({
        summary:
            'Mekana topluluk Saha Uyarısı (Yüksek UV, Dik Tırmanış, Yabani Yaşam vb.) ekle ve oyla',
        description:
            'Gezginlerin diğer ziyaretçileri uyarmak için seçtiği saha uyarılarının (community_warnings) oy sayısını artırır.',
    })
    addCommunityWarnings(
        @Param('id') id: string,
        @Body() dto: AddPlaceWarningsDto,
    ): Promise<Place> {
        return this.placesService.addCommunityWarnings(id, dto);
    }
}
