# **Been Here - NestJS Teknik Mimarisi ve Veritabanı Şeması (TRD)** 

Bu doküman, **Been Here - Travelog Manifesto** dosyasında tanımlanan iş kurallarının (Business Logic) NestJS, TypeORM ve PostgreSQL/PostGIS üzerinde nasıl kodlanacağını belirleyen **Teknik Spesifikasyon (Technical Blueprint)** belgesidir. AI kodlama ajanları (Gemini Argon vb.) tarafından doğrudan referans alınmak üzere tasarlanmıştır. 

## **1. Teknoloji Yığını ve Altyapı (Tech Stack & Infrastructure)** 

|Bileşen|Teknoloji / Kütüphane|Konfigürasyon & Kullanım Amacı|
|---|---|---|
|**Backend Framework**|NestJS|Node.js / TypeScript (Strict Mode)|
|**Veritabanı**|PostgreSQL 16+ & PostGIS 3+|CREATE EXTENSION IF NOT<br>EXISTS postgis;spatial analiz<br>motoru|
|**ORM**|TypeORM (0.3.x)|Data Mapper & Repository Pattern|
|**Kimlik Doğrulama**|Firebase Admin SDK|Client'tan iletilen Firebase ID<br>Token doğrulaması|
|**Nesne Depolama**|Cloudflare R2|@aws-sdk/client-s3ve@aws-<br>sdk/s3-request-presignerile<br>S3 uyumlu Presigned URL<br>mimarisi|
|**Önbellek & Kuyruk**|Redis + BullMQ|30 günlük Google Places Lazy<br>Refresh ve puan/rütbe işleri|
|**Validasyon & Şema**|class-validator, class-transformer|DTO katmanı veri doğrulama ve tip<br>dönüşümleri|



## **2. NestJS Klasör ve Modül Mimarisi (Feature-First / Modular Structure)** 

Kod tabanı, spagetti kod oluşumunu engellemek için **Domain/Feature** bazlı modüllere ayrılmalıdır:t 

src/ 

- ├── common/ │ ├── decorators/       # @CurrentUser(), @Roles(), @Public() │ ├── guards/           # FirebaseAuthGuard, SubscriptionTierGuard │ ├── interceptors/     # TransformInterceptor, LoggingInterceptor │ └── filters/          # AllExceptionsFilter 

- ├── config/               # Database, Firebase, R2, GooglePlaces env configs 

- ├── modules/ 

- │ ├── users/            # User entity, profil, rütbe ve rozet yönetimi 

- │ ├── places/           # Place entity, PostGIS sorguları, Google API & Lazy Refresh 

- │ ├── routes/           # Route, RouteStop, RouteStay entity'leri, Forking & Swipe-Pick 

- │ ├── memories/         # Memory (Anı), EXIF eşleştirme ve kişisel günlük kayıtları 

- │ ├── gamification/     # Puan motoru, liderlik tablosu, Trust Score hesaplamaları 

- │ └── media/            # Cloudflare R2 Presigned URL üretimi ve kota kontrolü 

- └── app.module.ts 

## 3. Veritabanı Şeması ve TypeORM Entity Modelleri 

### 3.1. Enum Tanımlamaları (Shared Enums) 

```typescript 

export enum SubscriptionTier { 

FREE = 'FREE', 

PREMIUM = 'PREMIUM', 

} 

export enum GlobalRank { 

WANDERER = 'WANDERER',           // Seviye 1: Çaylak (0 - 500) 

EXPLORER = 'EXPLORER',           // Seviye 2: Gezgin (500 - 2.500) 

PATHFINDER = 'PATHFINDER',       // Seviye 3: Kaşif (2.500 - 10.000) 

ELITE_TRAVELER = 'ELITE_TRAVELER', // Seviye 4: Elit Gezgin (10.000 - 50.000) 

MASTER_OF_ROUTES = 'MASTER_OF_ROUTES', // Seviye 5: Rota Üstadı (50.000+) 

} 

export enum PlaceStatus { 

ACTIVE = 'ACTIVE', 

CLOSED_TEMPORARILY = 'CLOSED_TEMPORARILY', 

CLOSED_PERMANENTLY = 'CLOSED_PERMANENTLY', 

} 

export enum VerificationType { 

GEO_VERIFIED = 'GEO_VERIFIED',     // Anlık GPS / Geofence doğrulaması (+50 Puan) 

PHOTO_VERIFIED = 'PHOTO_VERIFIED', // EXIF GPS + Timestamp doğrulaması (+20 Puan) 

MANUAL = 'MANUAL',                 // Doğrulanmamış manuel giriş (+5 Puan, Hype etkilemez) } export enum RouteStatus { DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED', ARCHIVED = 'ARCHIVED', } export enum StayType { PINNED_PLACE = 'PINNED_PLACE', HOTEL_3_STAR = 'HOTEL_3_STAR', HOTEL_5_STAR = 'HOTEL_5_STAR', BOUTIQUE_BUNGALOW = 'BOUTIQUE_BUNGALOW', CAMPING_CARAVAN = 'CAMPING_CARAVAN', HOSTEL_PENSION = 'HOSTEL_PENSION', FRIEND_FAMILY = 'FRIEND_FAMILY', } 

### **3.2. User Entity (users Tablosu)** 

Firebase UID ile eşleşen, gamification puanlarını, gizli güven skorunu ve üyelik tipini tutan ana tablodur.import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm'; 

import { SubscriptionTier, GlobalRank } from '../../common/enums'; 

@Entity('users') export class User { @PrimaryGeneratedColumn('uuid') id: string; @Column({ unique: true }) 

@Index() 

firebase_uid: string; @Column({ unique: true, nullable: true }) email: string; @Column({ unique: true, length: 50 }) @Index() 

username: string; 

@Column({ nullable: true }) display_name: string; @Column({ nullable: true }) avatar_url: string; 

@Column({ type: 'enum', enum: SubscriptionTier, default: SubscriptionTier.FREE }) subscription_tier: SubscriptionTier; 

@Column({ type: 'timestamptz', nullable: true }) subscription_expires_at: Date; 

// Gamification & Ranking @Column({ type: 'int', default: 0 }) 

@Index() 

global_points: number; 

@Column({ type: 'enum', enum: GlobalRank, default: GlobalRank.WANDERER }) global_rank: GlobalRank; 

// Arka planda çalışan görünmez güven skoru (50'nin altı Keşif Destesi'nde shadowban yer) @Column({ type: 'int', default: 100 }) trust_score: number; 

// Onboarding sırasında seçilen ilgi alanları: ["#Tarih", "#Doğa", "#YerelLezzet"] @Column({ type: 'jsonb', default: [] }) onboarding_preferences: string[]; 

// Sosyal medya linkleri: { "instagram": "...", "youtube": "..." } @Column({ type: 'jsonb', default: {} }) social_links: Record<string, string>; @CreateDateColumn({ type: 'timestamptz' }) created_at: Date; @UpdateDateColumn({ type: 'timestamptz' }) 

updated_at: Date; } 

### **3.3. Place Entity (places Tablosu - PostGIS & Çoklu Dil JSONB)** 

DB-First stratejisinin kalbidir. Spatial (konumsal) sorgular için geography(Point, 4326) ve çoklu dil aramaları için JSONB kullanır.import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'; 

import type { Point } from 'geojson'; 

import { PlaceStatus } from '../../common/enums'; 

@Entity('places') 

export class Place { 

@PrimaryGeneratedColumn('uuid') id: string; 

// Evrensel tekillik kalkanı: Aynı mekan farklı dilde aransa bile asla mükerrer kaydedilmez @Column({ unique: true }) @Index() 

google_place_id: string; 

// DB'ye ilk kaydedildiği dildeki varsayılan isim (Fallback) 

@Column() 

default_name: string; 

// Çoklu dil sözlüğü: { "tr": "Saat Kulesi", "en": "Clock Tower", "de": "Uhrturm" } @Column({ type: 'jsonb', default: {} }) 

@Index('IDX_PLACE_NAME_TRANSLATIONS', { synchronize: false }) // GIN Index ile hızlı arama name_translations: Record<string, string>; 

// PostGIS Coğrafi Konum Sütunu (Metre bazlı ST_DWithin sorguları için geography tipi) 

@Column({ 

type: 'geography', spatialFeatureType: 'Point', srid: 4326, }) @Index({ spatial: true }) location: Point; @Column({ nullable: true }) country_code: string; // Örn: 'TR', 'IT' @Column({ nullable: true }) @Index() city: string; // Örn: 'İzmir' @Column({ nullable: true }) district: string; // Örn: 'Konak' 

// Google'dan gelen esnek etiketler: ["restaurant", "bakery", "point_of_interest"] @Column({ type: 'jsonb', default: [] }) google_types: string[]; 

// Sunum katmanı (UI) ana kategorisi: 'FOOD' | 'ACCOMMODATION' | 'DESTINATION' 

@Column({ length: 30, default: 'DESTINATION' }) 

@Index() 

ui_category: string; 

// Topluluk tarafından verilen Vibe etiketleri ve oy sayıları: { "Gün Batımı": 42, "Sessiz": 15 } 

@Column({ type: 'jsonb', default: {} }) 

community_vibes: Record<string, number>; 

// Sadece GEO_VERIFIED ve PHOTO_VERIFIED ziyaretlerle artan manipüle edilemez popülerlik puanı 

@Column({ type: 'int', default: 0 }) 

@Index() 

verified_hype_score: number; 

@Column({ type: 'enum', enum: PlaceStatus, default: PlaceStatus.ACTIVE }) 

status: PlaceStatus; 

// Google Places API'den dönen ham veri 

@Column({ type: 'jsonb', nullable: true }) raw_google_payload: Record<string, any>; 

// 30 Günlük Lazy Refresh kontrolü için son senkronizasyon tarihi 

@Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) 

last_synced_at: Date; 

@CreateDateColumn({ type: 'timestamptz' }) 

created_at: Date; 

@UpdateDateColumn({ type: 'timestamptz' }) 

updated_at: Date; 

} 

### **3.4. Route, RouteStop ve RouteStay Entity'leri (routes, route_stops, route_stays)** 

Gezginlerin oluşturduğu rotaları, durakları, medya/feedback verilerini ve esnek konaklama bilgilerini tutar.t @Entity('routes') export class Route { @PrimaryGeneratedColumn('uuid') id: string; 

@Column('uuid') @Index() user_id: string; 

// Eğer başka bir gezginin rotası kopyalandıysa (Forking), orijinal rotanın ID'si @Column({ type: 'uuid', nullable: true }) forked_from_route_id: string; 

@Column({ length: 150 }) title: string; @Column({ type: 'text', nullable: true }) description: string; 

@Column({ type: 'enum', enum: RouteStatus, default: RouteStatus.DRAFT }) @Index() status: RouteStatus; 

// Esnek tarih yapısı: Kesin tarih aralığı veya sadece ay/yıl ("2026-08", "ALL_YEAR") @Column({ type: 'date', nullable: true }) start_date: Date; 

@Column({ type: 'date', nullable: true }) end_date: Date; 

@Column({ length: 20, nullable: true }) flexible_period: string; 

// Hızlı Yayınlama Modalı (Smart Expense) bütçe verileri @Column({ length: 3, default: 'TRY' }) currency: string; 

@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) estimated_total_budget: number; 

// Kategori bazlı yuvarlak bütçe: { "food": 1500, "activity": 500, "stay": 3000 } @Column({ type: 'jsonb', default: {} }) budget_breakdown: Record<string, number>; 

// İstatistikler (Gamification çarpanları için) @Column({ type: 'int', default: 0 }) fork_count: number; 

@Column({ type: 'int', default: 0 }) swipe_right_count: number; @Column({ type: 'int', default: 0 }) swipe_left_count: number; 

@Column({ type: 'boolean', default: false }) is_boosted: boolean; @CreateDateColumn({ type: 'timestamptz' }) created_at: Date; } 

```typescript @Entity('route_stops') export class RouteStop { @PrimaryGeneratedColumn('uuid') id: string; 

@Column('uuid') @Index() 

route_id: string; @Column('uuid') @Index() 

place_id: string; @Column({ type: 'int', default: 0 }) order_index: number; 

@Column({ type: 'int', nullable: true }) day_number: number; // Opsiyonel: Kullanıcı gün gün ayırmak isterse 

@Column({ type: 'enum', enum: VerificationType, default: VerificationType.MANUAL }) 

verification_type: VerificationType; 

@Column({ type: 'smallint', nullable: true }) rating: number; // 1 - 5 arası yıldız (Yayınlamak için zorunlu) @Column({ type: 'text', nullable: true }) comment: string; // Kullanıcının bu durak için seçtiği Vibe etiketleri: ["Gün Batımı", "Yerel Lezzet"] @Column({ type: 'jsonb', default: [] }) selected_vibes: string[]; 

// Cloudflare R2 medya linkleri (Free: max 2 foto, Premium: sınırsız foto + kısa video) @Column({ type: 'jsonb', default: [] }) media_urls: string[]; } @Entity('route_stays') export class RouteStay { @PrimaryGeneratedColumn('uuid') id: string; @Column('uuid') @Index() route_id: string; @Column({ type: 'enum', enum: StayType }) stay_type: StayType; 

// Eğer tam konum paylaşılmak istenirse Place ID bağlanır, gizlilik istenirse null kalır @Column({ type: 'uuid', nullable: true }) 

place_id: string; 

@Column({ nullable: true }) 

region_name: string; // Örn: "Kaş Merkez", "Fethiye" 

@Column({ type: 'int', default: 1 }) 

nights_count: number; // "2 Gece kaldım" (Takvim zorunluluğu yok) 

} 

### **3.5. Memory (Anı) Entity'si (memories Tablosu)** 

Paylaşım zorunluluğu olmayan, EXIF veya Geofence ile oluşturulan kişisel seyahat günlüğü kayıtlarıdır.@Entity('memories') 

export class Memory { 

@PrimaryGeneratedColumn('uuid') id: string; 

@Column('uuid') @Index() user_id: string; @Column('uuid') @Index() 

place_id: string; // Eğer bu anı sonradan bir rotaya dahil edildiyse @Column({ type: 'uuid', nullable: true }) route_id: string; @Column({ type: 'timestamptz' }) visited_at: Date; @Column({ type: 'enum', enum: VerificationType }) verification_type: VerificationType; @Column({ type: 'text', nullable: true }) 

personal_note: string; 

// Cloudflare R2 URL'leri (1080p WebP) @Column({ type: 'jsonb', default: [] }) media_urls: string[]; 

@CreateDateColumn({ type: 'timestamptz' }) 

created_at: Date; 

} 

## **4. Kritik Backend Algoritmaları ve Sorgu Desenleri (Core Logic Specs)** 

Argon kod üretirken aşağıdaki 3 temel servis mantığını birebir uygulamalıdır: 

### **4.1. PostGIS + Çoklu Dil JSONB Arama Sorgusu** 

**(PlacesService.searchPlaces)** 

Kullanıcı arama yaptığında önce kendi veritabanımızda (Maliyet: $0) hem çoklu dil JSONB objesinde hem de coğrafi yarıçapta arama yapılır:// Örnek TypeORM QueryBuilder Deseni 

const places = await this.placeRepo 

.createQueryBuilder('place') 

.where('place.status = :status', { status: PlaceStatus.ACTIVE }) 

.andWhere( 

`(place.default_name ILIKE :q OR place.name_translations - **>** :lang ILIKE :q)`, 

{ q: `%${searchQuery}%`, lang: userLanguage } // lang: 'tr', 'en' vb. ) .andWhere( 

`ST_DWithin(place.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`, { lng, lat, radius: radiusInMeters } // Örn: 5000 metre (5 km) ) 

.orderBy('place.verified_hype_score', 'DESC') 

.limit(20) 

.getMany(); 

### **4.2. Google Places API Upsert & 30 Günlük Lazy Refresh** 

### **(PlacesService.upsertFromGoogle)** 

- **Adım 1 (API Çağrısı):** Kullanıcı "Google Maps ile daha fazla gör" aksiyonunu tetiklediğinde Google Places API (language=${userLang}) çağrılır. 

- **Adım 2 (Upsert Mekanizması):** Dönen her mekan için google_place_id kontrolü gerçekleştirilir: 

   - _Kayıt Yoksa:_ Yeni Place oluşturulur, name_translations: { [userLang]: googleName } olarak yazılır. 

   - _Kayıt Varsa (Upsert):_ Mevcut kaydın name_translations JSONB alanına yeni dil eklenir (name_translations || '{"en": "Clock Tower"}'::jsonb), last_synced_at = NOW() güncellenir. 

- **Adım 3 (Lazy Refresh Kuralı):** Bir kullanıcı mekan detayına (GET /places/:id) tıkladığında, eğer NOW() - place.last_synced_at > 30 days ise yanıt kullanıcıya anında dönülür; arka planda BullMQ kuyruğuna refresh-place-data işi atılarak Google'dan güncel durum (CLOSED_PERMANENTLY vb.) sessizce çekilir. 

### **4.3. Üyelik Kotaları ve Guard Mimarisi (SubscriptionTierGuard)** 

- **Kayıtsız Ziyaretçi:** Sadece @Public() işaretli GET endpoint'lerine (Keşif destesi önizleme, rota/mekan inceleme) erişebilir. 

- **Ücretsiz Üye (Free):** 

   - _Taslak Rota Limiti:_ Taslak rota (status = 'DRAFT') oluşturulurken: COUNT(routes WHERE user_id = X AND status = 'DRAFT') >= 3 ise sistem 403 Forbidden (Upgrade to Premium) döner. 

   - _Medya Kotası:_ Cloudflare R2 Presigned URL isteğinde durak başına maksimum 2, rota genelinde maksimum 10 fotoğraf yükleme hakkı tanınır; MIME type olarak sadece image/webp veya image/jpeg kabul edilir. Video yükleme 

(video/mp4) engellenir. 

- **Premium Üye:** Tüm kotalar devre dışı bırakılır, kısa video yükleme desteği ve arka planda çalışan toplu Geofence senkronizasyon (POST /memories/batch-geofencesync) endpoint'i erişime açılır. 

