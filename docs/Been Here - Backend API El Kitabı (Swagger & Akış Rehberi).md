# **Been Here — Backend API El Kitabı (Swagger & Akış Rehberi)**

Bu doküman, **Been Here** NestJS backend servislerinin interaktif **Swagger UI** kullanımını, kimlik doğrulama kurallarını ve Flutter istemcisinin hangi ekranda hangi uç noktayı (endpoint) çağıracağını açıklayan başvuru rehberidir.

---

## **1. İnteraktif Swagger Arayüzüne Erişim**

Backend uygulaması çalıştığında (`npm run start:dev`) Swagger arayüzü ve OpenAPI JSON şeması otomatik olarak yayınlanır:

- **Swagger UI (Tarayıcı):** `http://localhost:3000/api/docs`
- **OpenAPI 3.0 JSON Şeması:** `http://localhost:3000/api/docs-json`

---

## **2. Kimlik Doğrulama ve Test Anahtarları (Authorize)**

Uygulama 3 farklı kullanıcı seviyesini destekler. Swagger sağ üst köşedeki **`Authorize`** butonuna tıklayarak test geçişlerini anında yapabilirsiniz:

| Kullanıcı Tipi | Swagger `Bearer` Değeri | Yetkiler ve Kotalar |
|---|---|---|
| **Kayıtsız Ziyaretçi (Read-Only)** | *(Boş bırakılır)* | Sadece `@Public()` olan `GET` servislerine (Keşif Destesi, Mekan Arama, Rota Detayı, Liderlik Tablosu) erişebilir. |
| **Ücretsiz Üye (Free)** | `dev:user-1` | Maksimum **3 taslak rota**, durak başı **max 2** / rota başı **max 10 fotoğraf**, aylık **20 anı**. Video yükleme ve toplu Geofence senkronizasyonu kapalıdır (`403 Forbidden`). |
| **Premium Üye (Premium)** | `dev:premium:user-2` | Sınırsız taslak rota, sınırsız fotoğraf + **kısa video (`video/mp4`)**, arka plan **Geofence toplu senkronizasyonu** ve Keşif Destesi'nde **Boost** önceliği. |

> **Not:** Canlı ortamda (`DEV_MOCK_EXTERNAL_SERVICES=false`) `Bearer` başlığına doğrudan Flutter Firebase Auth'tan alınan `Firebase ID Token` gönderilir.

---

## **3. Standart API Yanıt Formatı**

Tüm başarılı yanıtlar `TransformInterceptor` tarafından aşağıdaki zarf (envelope) yapısıyla döner:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-10-22T02:30:00.000Z"
}
```

Hata durumlarında `AllExceptionsFilter` standart hata yanıtı üretir:

```json
{
  "success": false,
  "statusCode": 403,
  "timestamp": "2026-10-22T02:30:00.000Z",
  "path": "/routes",
  "message": "Ücretsiz üyelikte en fazla 3 adet taslak rota bulundurabilirsiniz (Upgrade to Premium)."
}
```

---

## **4. Modül Bazlı Servis Rehberi ve İş Akışları**

### **4.1. Users (`/users`) — Profil ve Üyelik Yönetimi**

| Metot & Path | Erişim | Açıklama |
|---|---|---|
| `POST /users/sync` | Free / Premium | Firebase login sonrası kullanıcıyı DB'de oluşturur veya mevcut kaydı döner. |
| `GET /users/me` | Free / Premium | Giriş yapmış kullanıcının rütbe (`global_rank`), puan (`global_points`) ve üyelik bilgilerini döner. |
| `PATCH /users/me` | Free / Premium | `username`, `display_name`, `onboarding_preferences` (`["#Tarih", "#Doğa"]`) ve `social_links` günceller. |
| `PATCH /users/me/subscription` | Free / Premium | Kullanıcının üyelik paketini (`FREE` / `PREMIUM`) günceller. |
| `GET /users/:username` | **Public** | Gezginin herkese açık profilini döner (`trust_score` gizlenir). |

---

### **4.2. Places (`/places`) — DB-First PostGIS Arama & Google Places Upsert**

**İş Akışı (DB-First + On-Demand Google Fetch):**
1. Kullanıcı arama yaptığında önce `GET /places/search` çağrılır (Maliyet: `$0`).
2. Listenin sonunda *"Aradığın mekanı bulamadın mı? Google Maps ile daha fazla gör"* kartı gösterilir.
3. Kullanıcı sadece bu butona bastığında `POST /places/fetch-google` çağrılır; dönen mekanlar `google_place_id` üzerinden çoklu dil `name_translations` JSONB sözlüğüne Upsert edilir.
4. Kullanıcı bir mekanın detayına tıkladığında (`GET /places/:id`), mekanın `last_synced_at` tarihi **30 günden eskiyse** yanıt bekletilmeden dönülür ve arka planda **BullMQ (`place-refresh`)** kuyruğu ile Google'dan güncel durumu (`CLOSED_PERMANENTLY` vb.) çekilir.

| Metot & Path | Erişim | Açıklama |
|---|---|---|
| `GET /places/search` | **Public** | `q`, `lang`, `lat`, `lng`, `radius`, `ui_category` (`FOOD`, `ACCOMMODATION`, `DESTINATION`), `vibe`, `city` parametreleriyle PostGIS + JSONB arama yapar. |
| `GET /places/:id` | **Public** | Mekan detayını getirir; >30 gün ise arka planda Lazy Refresh başlatır. |
| `GET /places/:id/nearby` | **Public** | Seçili mekanın 2-5 km çevresindeki aynı kategorideki benzer popüler mekanları listeler. |
| `POST /places/fetch-google` | Free / Premium | Google Places API'den mekan arar ve çoklu dil JSONB Upsert yapar. |
| `POST /places/:id/vibes` | Free / Premium | Mekana topluluk atmosfer etiketi (`{"vibes": ["Gün Batımı", "Sessiz"]}`) oyu ekler. |

---

### **4.3. Routes (`/routes`) — Rotalar, Smart Expense, Forking & Keşif Destesi**

| Metot & Path | Erişim | Açıklama |
|---|---|---|
| `GET /routes/discovery-deck` | **Public** | **Swipe & Pick Keşif Destesi:** `mode=ROUTES` veya `mode=PLACES`, `lat/lng/radius`, `ui_category`, `vibe`, `elite_only=true`, `max_budget` filtreleriyle kart destesi döner. `trust_score < 50` olanları otomatik eler. |
| `GET /routes/me` | Free / Premium | Kullanıcının kendi taslak (`DRAFT`) ve yayınlanmış (`PUBLISHED`) rotalarını getirir. |
| `GET /routes/:id` | **Public** | Rota detayını, duraklarını ve konaklamalarını getirir. Kapanmış mekanları özel uyarı rozetiyle korur. |
| `POST /routes` | Free / Premium | Yeni taslak rota oluşturur (Free üye max 3 taslak sınırına tabidir). |
| `POST /routes/:id/stops` | Free / Premium | Rotaya durak (`RouteStop`) ekler. |
| `POST /routes/:id/stays` | Free / Premium | Rotaya esnek konaklama (`PINNED_PLACE`, `HOTEL_3_STAR`, `CAMPING_CARAVAN`, `FRIEND_FAMILY` vb. + `nights_count`) ekler. |
| `POST /routes/:id/publish` | Free / Premium | **Smart Expense Modal:** Durak puanlarını ve tahmini toplam/kategorik bütçeyi alarak rotayı `PUBLISHED` yapar (+30 puan). |
| `POST /routes/:id/fork` | Free / Premium | **Forking & Swipe-Trim:** Başka bir rotayı (veya `selected_stop_ids` ile sağa kaydırılan duraklarını) kullanıcının taslaklarına kopyalar; orijinal rota sahibine +25 puan kazandırır. |
| `POST /routes/:id/swipe` | Free / Premium | Keşif Destesi'nde sağa (`RIGHT`) veya sola (`LEFT`) kaydırmayı kaydeder ve rota sahibinin `trust_score` değerini günceller. |

---

### **4.4. Memories (`/memories`) — Kişisel Günlük, EXIF Eşleştirme & Geofence**

| Metot & Path | Erişim | Açıklama |
|---|---|---|
| `GET /memories/me` | Free / Premium | Kullanıcının dışarıya kapalı kişisel anı günlüğünü listeler. |
| `POST /memories/match-exif` | Free / Premium | **Privacy-First EXIF Eşleştirme:** Cihazda ayrıştırılan `{ photo_local_id, lat, lng, timestamp }[]` listesini PostGIS ile eşleştirir; eşleşenleri mekan altında gruplar (`PHOTO_VERIFIED`), eşleşmeyenler için aktif rotadaki aday mekanları döner. |
| `POST /memories` | Free / Premium | Kişisel anı kaydeder (`GEO_VERIFIED`: +50p, `PHOTO_VERIFIED`: +20p, `MANUAL`: +5p). |
| `POST /memories/batch-geofence-sync` | **Sadece Premium** | Arka planda biriken Geofence ziyaretlerini topluca `GEO_VERIFIED` anıya dönüştürür ve istenirse aktif rotaya (`append_to_route_id`) durak olarak ekler. |

---

### **4.5. Media (`/media`) — Cloudflare R2 Presigned Upload URL**

| Metot & Path | Erişim | Açıklama |
|---|---|---|
| `POST /media/presigned-url` | Free / Premium | İstemcinin doğrudan Cloudflare R2'ye yükleme yapabilmesi için süreli `upload_url` ve `public_url` döner. Free üyeler için `video/*` isteklerini ve durak başı >2 / rota başı >10 fotoğrafı engeller. |

---

### **4.6. Gamification (`/gamification`) — Rozetler ve Liderlik Tablosu**

| Metot & Path | Erişim | Açıklama |
|---|---|---|
| `GET /gamification/leaderboard` | **Public** | `period` (`ALL_TIME`, `MONTHLY`, `SEASONAL`) ve `city` filtrelerine göre liderlik tablosunu döner. |
| `GET /gamification/users/:userId/badges` | **Public** | Kullanıcının kazandığı Bölgesel Uzmanlık (*İzmir Uzmanı* vb.) ve Tematik (*Gurme Gezgin*, *Tarih ve Doğa Kaşifi*) rozetlerini döner. |
