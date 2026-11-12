import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
    CreateProfileHighlightDto,
    UpdateProfileDto,
    UpdateProfileHighlightDto,
    UpdateSubscriptionDto,
} from './dto/update-profile.dto';
import { CurrentUser, Public } from '../../common/decorators';
import { User } from './entities/user.entity';

@ApiTags('Users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @ApiBearerAuth('bearer')
    @Post('sync')
    @ApiOperation({
        summary:
            'Firebase giriş sonrası kullanıcıyı DB ile senkronize et / oluştur',
        description:
            'Geçerli Bearer token ile ilk kez giriş yapan kullanıcıyı veritabanında otomatik oluşturur, mevcutsa profilini döner.',
    })
    syncCurrentUser(@CurrentUser() user: User): User {
        return user;
    }

    @ApiBearerAuth('bearer')
    @Get('me')
    @ApiOperation({
        summary:
            'Giriş yapmış kullanıcının kendi profil, kota ve rütbe bilgilerini getir',
    })
    getMe(@CurrentUser() user: User): User {
        return user;
    }

    @ApiBearerAuth('bearer')
    @Patch('me')
    @ApiOperation({
        summary:
            'Kullanıcı profilini, onboarding ilgi alanlarını ve sosyal linklerini güncelle',
    })
    updateMe(
        @CurrentUser() user: User,
        @Body() dto: UpdateProfileDto,
    ): Promise<User> {
        return this.usersService.updateProfile(user.id, dto);
    }

    @ApiBearerAuth('bearer')
    @Patch('me/subscription')
    @ApiOperation({
        summary: 'Üyelik paketini (FREE / PREMIUM) güncelle',
    })
    updateSubscription(
        @CurrentUser() user: User,
        @Body() dto: UpdateSubscriptionDto,
    ): Promise<User> {
        return this.usersService.updateSubscription(user.id, dto);
    }

    @ApiBearerAuth('bearer')
    @Post('me/highlights')
    @ApiOperation({
        summary:
            'Profilde rütbenin altında yatay Story tarzı "Öne Çıkarılan Fotoğraf Dizisi" oluştur (Kotasız)',
    })
    createHighlight(
        @CurrentUser() user: User,
        @Body() dto: CreateProfileHighlightDto,
    ) {
        return this.usersService.createProfileHighlight(user.id, dto);
    }

    @ApiBearerAuth('bearer')
    @Patch('me/highlights/:highlightId')
    @ApiOperation({
        summary: 'Öne çıkarılan fotoğraf dizisini düzenle',
    })
    updateHighlight(
        @CurrentUser() user: User,
        @Param('highlightId') highlightId: string,
        @Body() dto: UpdateProfileHighlightDto,
    ) {
        return this.usersService.updateProfileHighlight(
            user.id,
            highlightId,
            dto,
        );
    }

    @ApiBearerAuth('bearer')
    @Delete('me/highlights/:highlightId')
    @ApiOperation({
        summary: 'Öne çıkarılan fotoğraf dizisini sil',
    })
    deleteHighlight(
        @CurrentUser() user: User,
        @Param('highlightId') highlightId: string,
    ) {
        return this.usersService.deleteProfileHighlight(user.id, highlightId);
    }

    @Public()
    @Get(':username')
    @ApiOperation({
        summary:
            'Kullanıcı adına (@username) göre herkese açık gezgin profilini, 3 profil fotoğrafını ve öne çıkarılan fotoğraf dizilerini getir (Public)',
    })
    async getPublicProfile(
        @Param('username') username: string,
    ): Promise<Partial<User>> {
        const user = await this.usersService.findByUsername(username);
        return {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            avatar_urls: user.avatar_urls,
            profile_highlights: user.profile_highlights,
            global_points: user.global_points,
            global_rank: user.global_rank,
            onboarding_preferences: user.onboarding_preferences,
            social_links: user.social_links,
            created_at: user.created_at,
        };
    }
}
