import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    /*
     * Ne yapar? Farklı bir porttan veya domainden (örneğin Flutter Web localhost:8080'den veya Swagger/admin panelinden localhost:3000'e) istek atıldığında
     * tarayıcıların güvenlik amacıyla isteği engellemesini (CORS hatasını) önler.
     * Not: Mobil cihazda çalışan native Flutter (iOS/Android) uygulaması CORS kuralına takılmaz, ancak Flutter Web veya tarayıcı tabanlı testlerde şarttır.
     * */
    app.enableCors();

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true, // Gelen istekta DTO'lar ile eşleşmeyen veriler varsa bunları istekten otomatik kaldırır
            forbidNonWhitelisted: true, // Bu parametre true olduğunda DTO'lar ile eşleşmeyen bir veri varsa 400 Bad Request hatası fırlatır
            transform: true, // URL'den gelen string şekilde gelen parametreleri DTO'da belirtilen tiplere dönüştürür
        }),
    );

    // Uygulamanın herhangi bir yerinde (Guard'da, Pipe'ta, Service'te veya veritabanında) bir hata fırlatıldığında devreye girer.
    // İstek atan istemciye standartları belirli şekilde hata fırlatmak için kullanılır
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(
        new LoggingInterceptor(), // Amacı istek yaşam döngüsü içerisinde ne kadar süre geçtiğinin hesaplanmasıdır
        new TransformInterceptor(), // Servisin döndüğü standart olmayan veriyi standart response cevaplarına dönüştürür
    );

    const swaggerConfig = new DocumentBuilder()
        .setTitle('Been Here — Travelog Backend API El Kitabı')
        .setDescription(
            [
                '**Been Here** seyahat deneyimi paylaşma, interaktif rota oluşturma (Swipe & Pick), DB-First PostGIS mekan arama ve EXIF/Geofence tabanlı kişisel anı günlüğü (Travelog) API dokümantasyonu.',
                '',
                '### Kimlik Doğrulama (Authorize Kullanımı)',
                '- **Kayıtsız Ziyaretçi (Read-Only):** `@Public()` olan GET uç noktaları herhangi bir token gerektirmeden doğrudan çağrılabilir.',
                '- **Geliştirme Modu (Dev Fallback):** Sağ üstteki **Authorize** butonuna tıklayarak aşağıdaki hazır geliştirme anahtarlarını girebilirsiniz:',
                '  - Ücretsiz (Free) Gezgin: `dev:user-1`',
                '  - Premium Gezgin: `dev:premium:user-2`',
                '- **Canlı Ortam (Production):** Firebase Authentication üzerinden alınan `Firebase ID Token` kullanılır.',
            ].join('\n'),
        )
        .setVersion('1.0.0')
        .addBearerAuth(
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description:
                    'Firebase ID Token veya geliştirme modunda "dev:user-1" (Free) / "dev:premium:user-2" (Premium) giriniz.',
            },
            'bearer',
        )
        .addTag('Health', 'Sistem sağlık ve durum kontrolü')
        .addTag('Users', 'Kullanıcı profili, üyelik paketi ve tercih yönetimi')
        .addTag(
            'Places',
            'DB-First PostGIS arama, Çoklu Dil JSONB, On-Demand Google Places Upsert ve Vibe etiketleri',
        )
        .addTag(
            'Routes',
            'Rotalar, Kişisel Anılar (PRIVATE_MEMORY), Duraklar, EXIF Eşleştirme, Geofence Senkronizasyonu, Forking ve Keşif Destesi',
        )
        .addTag(
            'Media',
            'Cloudflare R2 Presigned Upload URL üretimi ve Free/Premium medya kotası denetimi',
        )
        .addTag(
            'Gamification',
            'Gezgin rütbeleri (GlobalRank), bölgesel/tematik uzmanlık rozetleri ve liderlik tabloları',
        )
        .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
            docExpansion: 'list',
            filter: true,
        },
        customSiteTitle: 'Been Here API Docs',
    });

    await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
