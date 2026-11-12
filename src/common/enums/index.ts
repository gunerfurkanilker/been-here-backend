export enum SubscriptionTier {
    FREE = 'FREE',
    PREMIUM = 'PREMIUM',
}

export enum GlobalRank {
    WANDERER = 'WANDERER', // Seviye 1: Çaylak (0 - 500)
    EXPLORER = 'EXPLORER', // Seviye 2: Gezgin (500 - 2.500)
    PATHFINDER = 'PATHFINDER', // Seviye 3: Kaşif (2.500 - 10.000)
    ELITE_TRAVELER = 'ELITE_TRAVELER', // Seviye 4: Elit Gezgin (10.000 - 50.000)
    MASTER_OF_ROUTES = 'MASTER_OF_ROUTES', // Seviye 5: Rota Üstadı (50.000+)
}

export enum PlaceStatus {
    ACTIVE = 'ACTIVE',
    CLOSED_TEMPORARILY = 'CLOSED_TEMPORARILY',
    CLOSED_PERMANENTLY = 'CLOSED_PERMANENTLY',
}

export enum VerificationType {
    GEO_VERIFIED = 'GEO_VERIFIED', // Anlık GPS / Geofence doğrulaması (+50 Puan)
    PHOTO_VERIFIED = 'PHOTO_VERIFIED', // EXIF GPS + Timestamp doğrulaması (+20 Puan)
    MANUAL = 'MANUAL', // Doğrulanmamış manuel giriş (+5 Puan, Hype etkilemez)
}

export enum RouteStatus {
    DRAFT = 'DRAFT',
    PRIVATE_MEMORY = 'PRIVATE_MEMORY', // Kişisel olarak anılaştırılmış (Private) rota (Free kotası: toplam max 5)
    PUBLISHED = 'PUBLISHED', // Toplulukla paylaşılmış (Public) ve aynı zamanda kullanıcının anılarında yer alan rota (Sınırsız)
    ARCHIVED = 'ARCHIVED',
}

export enum StayType {
    PINNED_PLACE = 'PINNED_PLACE',
    HOTEL_3_STAR = 'HOTEL_3_STAR',
    HOTEL_5_STAR = 'HOTEL_5_STAR',
    BOUTIQUE_BUNGALOW = 'BOUTIQUE_BUNGALOW',
    CAMPING_CARAVAN = 'CAMPING_CARAVAN',
    HOSTEL_PENSION = 'HOSTEL_PENSION',
    FRIEND_FAMILY = 'FRIEND_FAMILY',
}

export enum UiCategory {
    FOOD = 'FOOD',
    ACCOMMODATION = 'ACCOMMODATION',
    DESTINATION = 'DESTINATION',
}
