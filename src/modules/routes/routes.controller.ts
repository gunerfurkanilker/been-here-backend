import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoutesService } from './routes.service';
import {
    AnswerRouteQuestionDto,
    BatchGeofenceSyncDto,
    CreateRouteDto,
    CreateRouteQuestionDto,
    CreateRouteStayInputDto,
    CreateRouteStopInputDto,
    DismissPlaceInRouteDto,
    DiscoveryDeckQueryDto,
    ForkRouteDto,
    MatchExifRequestDto,
    PublishRouteDto,
    RestoreDismissedPlaceDto,
    SwipeRouteDto,
    UpdateRouteDto,
    UpdateRouteQaSettingsDto,
    UpdateRouteStopDto,
    UserQuestionsQueryDto,
    UserRoutesFilterQueryDto,
} from './dto/routes.dto';
import {
    CurrentUser,
    Public,
    RequireSubscription,
} from '../../common/decorators';
import { SubscriptionTier } from '../../common/enums';
import { User } from '../users/entities/user.entity';

@ApiTags('Routes')
@Controller('routes')
export class RoutesController {
    constructor(private readonly routesService: RoutesService) {}

    @Public()
    @Get('discovery-deck')
    @ApiOperation({
        summary: 'Keşif Destesi (Swipe & Pick / Discovery Deck) (Public)',
        description:
            'Kayıtsız ziyaretçiler dahil herkes için bölge, kategori, vibe, bütçe ve Elit Gezgin filtreli kart destesi döner. Trust Score < 50 olan içerikleri otomatik filtreler.',
    })
    getDiscoveryDeck(
        @Query() query: DiscoveryDeckQueryDto,
        @CurrentUser() user?: User | null,
    ) {
        return this.routesService.getDiscoveryDeck(query, user);
    }

    @ApiBearerAuth('bearer')
    @Get('me')
    @ApiOperation({
        summary:
            'Kullanıcının kendi taslak (DRAFT), özel anı (PRIVATE_MEMORY) ve yayınlanmış (PUBLISHED) rotalarını ülke/şehir/tarih filtresiyle listele',
    })
    getMyRoutes(
        @CurrentUser() user: User,
        @Query() filter: UserRoutesFilterQueryDto,
    ) {
        return this.routesService.getUserRoutes(user.id, true, filter);
    }

    @ApiBearerAuth('bearer')
    @Get('memories/me')
    @ApiOperation({
        summary:
            'Kullanıcının anılaştırılmış rotalarını (PRIVATE_MEMORY + PUBLISHED) ülke/şehir/tarih filtresiyle ve kalan Private Anı kotasıyla getir',
    })
    getMyMemories(
        @CurrentUser() user: User,
        @Query() filter: UserRoutesFilterQueryDto,
    ) {
        return this.routesService.getMyMemoryRoutes(user, filter);
    }

    @Public()
    @Get('user/:userId')
    @ApiOperation({
        summary:
            'Belirli bir gezginin paylaştığı (PUBLISHED) rotaları ülke/şehir ve tarih filtresiyle getir (Public Profil)',
    })
    getUserPublicRoutes(
        @Param('userId') userId: string,
        @Query() filter: UserRoutesFilterQueryDto,
    ) {
        return this.routesService.getUserRoutes(userId, false, filter);
    }

    @ApiBearerAuth('bearer')
    @Get('qa/me')
    @ApiOperation({
        summary:
            'Kullanıcının kendi profilindeki "Soru & Cevap (Q&A)" sekmesi: Rotalarına sorulan tüm soruları getir',
    })
    getMyReceivedQuestions(
        @CurrentUser() user: User,
        @Query() query: UserQuestionsQueryDto,
    ) {
        return this.routesService.getMyReceivedQuestions(user, query);
    }

    @ApiBearerAuth('bearer')
    @Patch('qa/:questionId/answer')
    @ApiOperation({
        summary:
            'Kullanıcının kendi profilindeki Soru & Cevap (Q&A) sekmesinden sorulan bir soruyu cevaplaması',
    })
    answerRouteQuestion(
        @CurrentUser() user: User,
        @Param('questionId') questionId: string,
        @Body() dto: AnswerRouteQuestionDto,
    ) {
        return this.routesService.answerRouteQuestion(user, questionId, dto);
    }

    @ApiBearerAuth('bearer')
    @Post('match-exif')
    @ApiOperation({
        summary:
            'Cihaz içi (Client-Side) ayrıştırılan EXIF koordinatlarını PostGIS mekanlarıyla eşleştir',
        description:
            'Ayrı bir memories tablosu kullanmaz; fotoğrafların koordinatlarını PostGIS mekanlarıyla eşleştirerek rotaya (RouteStop) eklenecek mekan gruplarını döner.',
    })
    matchExif(@CurrentUser() user: User, @Body() dto: MatchExifRequestDto) {
        return this.routesService.matchExifCoordinates(user, dto);
    }

    @ApiBearerAuth('bearer')
    @RequireSubscription(SubscriptionTier.PREMIUM)
    @Post('batch-geofence-sync')
    @ApiOperation({
        summary:
            '[Sadece PREMIUM] Arka planda biriken Geofence ziyaretlerini doğrudan rotaya / anıya senkronize et',
        description:
            'Cihazda gün içinde biriken konum ziyaretlerini doğrudan hedef rotaya (veya yeni bir PRIVATE_MEMORY anı rotasına) GEO_VERIFIED durak (RouteStop) olarak ekler.',
    })
    batchGeofenceSync(
        @CurrentUser() user: User,
        @Body() dto: BatchGeofenceSyncDto,
    ) {
        return this.routesService.batchGeofenceSync(user, dto);
    }

    @Public()
    @Get(':id')
    @ApiOperation({
        summary:
            'Rota detayını, duraklarını ve esnek konaklama bilgilerini getir (Public)',
        description:
            'Kapanmış mekanları geçmiş rotalarda silmeden özel uyarı rozetiyle döner; fotoğraflı durakları işaretler.',
    })
    getRouteById(@Param('id') id: string) {
        return this.routesService.getRouteDetails(id);
    }

    @ApiBearerAuth('bearer')
    @Post()
    @ApiOperation({
        summary:
            'Yeni taslak (DRAFT) rota oluştur (Free üye sınırı: max 3 taslak)',
    })
    createDraftRoute(@CurrentUser() user: User, @Body() dto: CreateRouteDto) {
        return this.routesService.createDraftRoute(user, dto);
    }

    @ApiBearerAuth('bearer')
    @Patch(':id')
    @ApiOperation({
        summary:
            'Mevcut bir rotanın başlık, tarih ve bütçe bilgilerini düzenle (Taslak kotası denetimli)',
    })
    updateRoute(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: UpdateRouteDto,
    ) {
        return this.routesService.updateRoute(user, routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/unpublish')
    @ApiOperation({
        summary:
            'Yayınlanmış (PUBLISHED) bir rotayı düzenlemek üzere tekrar DRAFT statüsüne çek (3 + 1 Ek Kontenjan)',
        description:
            'Kullanıcının mevcut 3 normal taslağını ezmez; yayınlanmış rotadan taslağa çekilen rotalar için tanımlanan +1 ek kontenjanı kullanır.',
    })
    unpublishRouteToDraft(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
    ) {
        return this.routesService.unpublishRouteToDraft(user, routeId);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/stops')
    @ApiOperation({
        summary: 'Rotaya yeni mekan durağı (RouteStop) ekle',
    })
    addStop(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: CreateRouteStopInputDto,
    ) {
        return this.routesService.addStopToRoute(user, routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Patch(':id/stops/:stopId')
    @ApiOperation({
        summary:
            'Rotadaki mevcut bir durağı (sıra, gün, puan, yorum, medya) düzenle (Kota denetimli)',
    })
    updateStop(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Param('stopId') stopId: string,
        @Body() dto: UpdateRouteStopDto,
    ) {
        return this.routesService.updateRouteStop(user, routeId, stopId, dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/stays')
    @ApiOperation({
        summary:
            'Rotaya esnek konaklama (RouteStay - Tam Konum veya Gizlilik Dostu Jenerik Tip) ekle',
    })
    addStay(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: CreateRouteStayInputDto,
    ) {
        return this.routesService.addStayToRoute(user, routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/publish')
    @ApiOperation({
        summary:
            'Rotayı Toplulukla Paylaş (PUBLIC - Sınırsız Kota + Smart Expense & Feedback Kontrolü)',
        description:
            'Durak puanlamalarını ve tahmini toplam/kategorik bütçeyi doğrulayarak rotayı PUBLISHED durumuna geçirir (hem toplulukta hem kullanıcının anılarında yer alır) ve gamification puanlarını tetikler.',
    })
    publishRoute(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: PublishRouteDto,
    ) {
        return this.routesService.publishRoute(user, routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/save-as-memory')
    @ApiOperation({
        summary:
            'Rotayı Kişiye Özel Anı Olarak Sakla (PRIVATE_MEMORY - Free Üye Toplam Maks. 5 Adet)',
        description:
            'GitHub Private Repo mantığıyla rotayı toplulukla paylaşmadan (puan/bütçe şartı olmadan) kullanıcının özel anı defterine kaydeder. Free üyeler toplam 5 özel anı saklayabilir.',
    })
    saveAsPrivateMemory(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
    ) {
        return this.routesService.saveRouteAsPrivateMemory(user, routeId);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/fork')
    @ApiOperation({
        summary:
            'Başka bir gezginin rotasındaki durakları sağa kaydırarak (Swipe Right) kendi rotana ekle (Fork Stops)',
        description:
            'Komple yeni bir rota oluşturmaz; kaynak rotadan sağa kaydırılarak seçilen durakları (selected_stop_ids) kullanıcının kendi mevcut taslak rotasına (target_route_id) ekler. 20 durak sınırı aşılırsa Premium uyarısı döner.',
    })
    forkRoute(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: ForkRouteDto,
    ) {
        return this.routesService.forkRoute(user, routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/swipe')
    @ApiOperation({
        summary:
            'Keşif Destesinde rotayı sağa (RIGHT) veya sola (LEFT) kaydırma etkileşimini kaydet',
        description:
            'Sağa/sola kaydırma sayaçlarını günceller ve rota sahibinin görünmez Trust Score değerini yeniden hesaplar.',
    })
    swipeRoute(@Param('id') routeId: string, @Body() dto: SwipeRouteDto) {
        return this.routesService.recordSwipe(routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/dismissed-places')
    @ApiOperation({
        summary:
            'Rota oluşturma esnasında sola kaydırılan (pas geçilen) mekanı rotaya kaydet',
        description:
            'A gezgininin rotasında sola kaydırılan mekanın B gezgininin rotasında tekrar gösterilmemesini sağlar ve kullanıcının sonradan fikrini değiştirip rotaya ekleyebilmesi için pas geçilenler listesinde tutar.',
    })
    dismissPlaceInRoute(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: DismissPlaceInRouteDto,
    ) {
        return this.routesService.dismissPlaceInRoute(user, routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Get(':id/dismissed-places')
    @ApiOperation({
        summary:
            'Bu rota oluşturulurken sola kaydırılan (pas geçilen) mekanları listele',
    })
    getDismissedPlaces(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
    ) {
        return this.routesService.getDismissedPlaces(user, routeId);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/dismissed-places/:placeId/restore')
    @ApiOperation({
        summary:
            'Sola kaydırılan (pas geçilen) bir mekanla ilgili fikrini değiştirip rotaya durak (RouteStop) olarak ekle',
    })
    restoreDismissedPlace(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Param('placeId') placeId: string,
        @Body() dto: RestoreDismissedPlaceDto,
    ) {
        return this.routesService.restoreDismissedPlaceToRoute(
            user,
            routeId,
            placeId,
            dto,
        );
    }

    @Public()
    @Get(':id/questions')
    @ApiOperation({
        summary:
            'İlgili rotaya sorulan Soru & Cevap (Q&A) kayıtlarını listele (Public)',
    })
    getRouteQuestions(@Param('id') routeId: string) {
        return this.routesService.getRouteQuestions(routeId);
    }

    @ApiBearerAuth('bearer')
    @Post(':id/questions')
    @ApiOperation({
        summary:
            'Rotaya soru sor (Rota sahibi Q&A özelliğini kapattıysa izin verilmez)',
    })
    askRouteQuestion(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: CreateRouteQuestionDto,
    ) {
        return this.routesService.askRouteQuestion(user, routeId, dto);
    }

    @ApiBearerAuth('bearer')
    @Patch(':id/qa-settings')
    @ApiOperation({
        summary:
            'Rota sahibinin kendi profilinden ilgili rotanın Q&A (Soru & Cevap) özelliğini açıp kapatması',
    })
    updateRouteQaSettings(
        @CurrentUser() user: User,
        @Param('id') routeId: string,
        @Body() dto: UpdateRouteQaSettingsDto,
    ) {
        return this.routesService.updateRouteQaSettings(user, routeId, dto);
    }
}
