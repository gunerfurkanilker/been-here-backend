import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MediaService } from './media.service';
import {
    AttachStopMediaDto,
    RemoveStopMediaDto,
    RequestPresignedUrlDto,
} from './dto/media.dto';
import { CurrentUser } from '../../common/decorators';
import { User } from '../users/entities/user.entity';

@ApiTags('Media')
@ApiBearerAuth('bearer')
@Controller('media')
export class MediaController {
    constructor(private readonly mediaService: MediaService) {}

    @Post('presigned-url')
    @ApiOperation({
        summary: 'Cloudflare R2 doğrudan yükleme için Presigned PUT URL üret',
        description:
            'Free üyeler yalnızca image/webp ve image/jpeg yükleyebilir (durak başı max 2, rota başı max 10 foto; video yasak). Premium üyeler sınırsız fotoğraf ve kısa video (video/mp4, video/webm) yükleyebilir.',
    })
    createPresignedUrl(
        @CurrentUser() user: User,
        @Body() dto: RequestPresignedUrlDto,
    ) {
        return this.mediaService.createPresignedUploadUrl(user, dto);
    }

    @Get('routes/:routeId/quota')
    @ApiOperation({
        summary:
            'Rotanın ve duraklarının anlık kalan fotoğraf/video yükleme kotasını getir',
        description:
            'Mobil arayüz fotoğraf seçiciyi açmadan önce bu uçtan kalan durak ve rota fotoğraf hakkını öğrenerek kullanıcıyı en başta bilgilendirir.',
    })
    getRouteMediaQuota(
        @CurrentUser() user: User,
        @Param('routeId') routeId: string,
    ) {
        return this.mediaService.getRouteMediaQuotaStatus(user, routeId);
    }

    @Post('routes/:routeId/stops/:stopId/attach')
    @ApiOperation({
        summary:
            'Fotoğrafı rota kaydedilmeyi beklemeden anında durağa ekle ve kotayı doğrula',
        description:
            'Kullanıcı fotoğrafı seçip yüklediği anda çalışır; kota aşımı varsa daha tüm rotayı doldurmadan o saniye uyarı verir ve kalan kotayı döner.',
    })
    attachMediaToStop(
        @CurrentUser() user: User,
        @Param('routeId') routeId: string,
        @Param('stopId') stopId: string,
        @Body() dto: AttachStopMediaDto,
    ) {
        return this.mediaService.attachMediaToStop(user, routeId, stopId, dto);
    }

    @Delete('routes/:routeId/stops/:stopId/media')
    @ApiOperation({
        summary: 'Duraktan fotoğrafı kaldır ve medya kotasını anında geri aç',
    })
    removeMediaFromStop(
        @CurrentUser() user: User,
        @Param('routeId') routeId: string,
        @Param('stopId') stopId: string,
        @Body() dto: RemoveStopMediaDto,
    ) {
        return this.mediaService.removeMediaFromStop(
            user,
            routeId,
            stopId,
            dto,
        );
    }
}
