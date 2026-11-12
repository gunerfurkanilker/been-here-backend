export type ContinentCode =
    | 'GLOBAL'
    | 'EUROPE'
    | 'ASIA'
    | 'NORTH_AMERICA'
    | 'SOUTH_AMERICA'
    | 'AFRICA'
    | 'OCEANIA';

export interface CountryMetadata {
    code: string;
    name_tr: string;
    name_en: string;
    continent: Exclude<ContinentCode, 'GLOBAL'>;
}

export const CONTINENT_LABELS: Record<
    ContinentCode,
    { name_tr: string; name_en: string }
> = {
    GLOBAL: { name_tr: 'Global', name_en: 'Global' },
    EUROPE: { name_tr: 'Avrupa', name_en: 'Europe' },
    ASIA: { name_tr: 'Asya', name_en: 'Asia' },
    NORTH_AMERICA: { name_tr: 'Kuzey Amerika', name_en: 'North America' },
    SOUTH_AMERICA: { name_tr: 'Güney Amerika', name_en: 'South America' },
    AFRICA: { name_tr: 'Afrika', name_en: 'Africa' },
    OCEANIA: { name_tr: 'Okyanusya', name_en: 'Oceania' },
};

export const COUNTRIES_CATALOG: CountryMetadata[] = [
    // EUROPE
    {
        code: 'TR',
        name_tr: 'Türkiye',
        name_en: 'Turkey',
        continent: 'EUROPE',
    },
    {
        code: 'DE',
        name_tr: 'Almanya',
        name_en: 'Germany',
        continent: 'EUROPE',
    },
    {
        code: 'FR',
        name_tr: 'Fransa',
        name_en: 'France',
        continent: 'EUROPE',
    },
    {
        code: 'BE',
        name_tr: 'Belçika',
        name_en: 'Belgium',
        continent: 'EUROPE',
    },
    {
        code: 'IT',
        name_tr: 'İtalya',
        name_en: 'Italy',
        continent: 'EUROPE',
    },
    {
        code: 'ES',
        name_tr: 'İspanya',
        name_en: 'Spain',
        continent: 'EUROPE',
    },
    {
        code: 'NL',
        name_tr: 'Hollanda',
        name_en: 'Netherlands',
        continent: 'EUROPE',
    },
    {
        code: 'GB',
        name_tr: 'İngiltere',
        name_en: 'United Kingdom',
        continent: 'EUROPE',
    },
    {
        code: 'GR',
        name_tr: 'Yunanistan',
        name_en: 'Greece',
        continent: 'EUROPE',
    },
    {
        code: 'AT',
        name_tr: 'Avusturya',
        name_en: 'Austria',
        continent: 'EUROPE',
    },
    {
        code: 'CH',
        name_tr: 'İsviçre',
        name_en: 'Switzerland',
        continent: 'EUROPE',
    },
    {
        code: 'PT',
        name_tr: 'Portekiz',
        name_en: 'Portugal',
        continent: 'EUROPE',
    },
    {
        code: 'CZ',
        name_tr: 'Çekya',
        name_en: 'Czechia',
        continent: 'EUROPE',
    },
    // ASIA
    {
        code: 'RU',
        name_tr: 'Rusya',
        name_en: 'Russia',
        continent: 'ASIA',
    },
    {
        code: 'TH',
        name_tr: 'Tayland',
        name_en: 'Thailand',
        continent: 'ASIA',
    },
    {
        code: 'JP',
        name_tr: 'Japonya',
        name_en: 'Japan',
        continent: 'ASIA',
    },
    {
        code: 'KR',
        name_tr: 'Güney Kore',
        name_en: 'South Korea',
        continent: 'ASIA',
    },
    {
        code: 'ID',
        name_tr: 'Endonezya',
        name_en: 'Indonesia',
        continent: 'ASIA',
    },
    {
        code: 'AE',
        name_tr: 'Birleşik Arap Emirlikleri',
        name_en: 'United Arab Emirates',
        continent: 'ASIA',
    },
    {
        code: 'CN',
        name_tr: 'Çin',
        name_en: 'China',
        continent: 'ASIA',
    },
    {
        code: 'IN',
        name_tr: 'Hindistan',
        name_en: 'India',
        continent: 'ASIA',
    },
    // NORTH_AMERICA
    {
        code: 'US',
        name_tr: 'Amerika Birleşik Devletleri',
        name_en: 'United States',
        continent: 'NORTH_AMERICA',
    },
    {
        code: 'CA',
        name_tr: 'Kanada',
        name_en: 'Canada',
        continent: 'NORTH_AMERICA',
    },
    {
        code: 'MX',
        name_tr: 'Meksika',
        name_en: 'Mexico',
        continent: 'NORTH_AMERICA',
    },
    // SOUTH_AMERICA
    {
        code: 'BR',
        name_tr: 'Brezilya',
        name_en: 'Brazil',
        continent: 'SOUTH_AMERICA',
    },
    {
        code: 'AR',
        name_tr: 'Arjantin',
        name_en: 'Argentina',
        continent: 'SOUTH_AMERICA',
    },
    {
        code: 'CL',
        name_tr: 'Şili',
        name_en: 'Chile',
        continent: 'SOUTH_AMERICA',
    },
    {
        code: 'PE',
        name_tr: 'Peru',
        name_en: 'Peru',
        continent: 'SOUTH_AMERICA',
    },
    {
        code: 'CO',
        name_tr: 'Kolombiya',
        name_en: 'Colombia',
        continent: 'SOUTH_AMERICA',
    },
    // AFRICA
    {
        code: 'EG',
        name_tr: 'Mısır',
        name_en: 'Egypt',
        continent: 'AFRICA',
    },
    {
        code: 'MA',
        name_tr: 'Fas',
        name_en: 'Morocco',
        continent: 'AFRICA',
    },
    {
        code: 'ZA',
        name_tr: 'Güney Afrika',
        name_en: 'South Africa',
        continent: 'AFRICA',
    },
    // OCEANIA
    {
        code: 'AU',
        name_tr: 'Avustralya',
        name_en: 'Australia',
        continent: 'OCEANIA',
    },
    {
        code: 'NZ',
        name_tr: 'Yeni Zelanda',
        name_en: 'New Zealand',
        continent: 'OCEANIA',
    },
];

/**
 * Verilen ülke kodunu ("DE") veya ülke adını ("Almanya", "Germany") standart CountryMetadata nesnesine çözer.
 */
export function resolveCountryMetadata(
    input?: string | null,
): CountryMetadata | null {
    if (!input) return null;
    const normalized = input.trim().toLowerCase();
    if (!normalized || normalized === 'all' || normalized === 'tümü') {
        return null;
    }

    return (
        COUNTRIES_CATALOG.find(
            (c) =>
                c.code.toLowerCase() === normalized ||
                c.name_tr.toLowerCase() === normalized ||
                c.name_en.toLowerCase() === normalized,
        ) ?? null
    );
}

/**
 * Bir kıtaya ait tüm ülke kodlarını ("DE", "FR", "BE"...) ve ülke isimlerini ("Almanya", "Fransa"...) döner.
 */
export function getContinentCountryMatchers(continent?: ContinentCode): {
    codes: string[];
    namesAndCodesLower: string[];
} {
    if (!continent || continent === 'GLOBAL') {
        return { codes: [], namesAndCodesLower: [] };
    }
    const matching = COUNTRIES_CATALOG.filter((c) => c.continent === continent);
    const codes = matching.map((c) => c.code.toUpperCase());
    const namesAndCodesLower = matching.flatMap((c) => [
        c.code.toLowerCase(),
        c.name_tr.toLowerCase(),
        c.name_en.toLowerCase(),
    ]);
    return { codes, namesAndCodesLower };
}

/**
 * Tekil veya çoklu ülke girdisini ("Almanya,Fransa" veya "DE") hem ISO ülke kodlarına hem de küçük harfli isim/kod listesine dönüştürür.
 */
export function parseMultiCountryFilter(rawCountries?: string): {
    codes: string[];
    namesAndCodesLower: string[];
} {
    if (!rawCountries) {
        return { codes: [], namesAndCodesLower: [] };
    }

    const tokens = rawCountries
        .split(',')
        .map((t) => t.trim())
        .filter(
            (t) =>
                Boolean(t) &&
                t.toLowerCase() !== 'all' &&
                t.toLowerCase() !== 'tümü',
        );

    const codes = new Set<string>();
    const namesAndCodesLower = new Set<string>();

    for (const token of tokens) {
        const meta = resolveCountryMetadata(token);
        if (meta) {
            codes.add(meta.code.toUpperCase());
            namesAndCodesLower.add(meta.code.toLowerCase());
            namesAndCodesLower.add(meta.name_tr.toLowerCase());
            namesAndCodesLower.add(meta.name_en.toLowerCase());
        } else {
            codes.add(token.toUpperCase());
            namesAndCodesLower.add(token.toLowerCase());
        }
    }

    return {
        codes: Array.from(codes),
        namesAndCodesLower: Array.from(namesAndCodesLower),
    };
}
