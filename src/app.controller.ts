import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators';

@ApiTags('Health')
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public()
    @Get()
    @ApiOperation({ summary: 'Servis karşılama mesajı (Public)' })
    getHello(): string {
        return this.appService.getHello();
    }

    @Public()
    @Get('health')
    @ApiOperation({ summary: 'Sistem sağlık durumu kontrolü (Public)' })
    getHealth() {
        return {
            status: 'ok',
            service: 'been-here-backend',
            timestamp: new Date().toISOString(),
        };
    }
}
