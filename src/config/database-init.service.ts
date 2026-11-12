import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
    private readonly logger = new Logger(DatabaseInitService.name);

    constructor(private readonly dataSource: DataSource) {}

    async onModuleInit(): Promise<void> {
        if (!this.dataSource.isInitialized) {
            return;
        }

        try {
            // 1. Coğrafi sorgular için PostGIS, yazım hataları için pg_trgm ve aksanlar için unaccent eklentileri
            await this.dataSource.query(
                'CREATE EXTENSION IF NOT EXISTS postgis;',
            );
            await this.dataSource.query(
                'CREATE EXTENSION IF NOT EXISTS pg_trgm;',
            );
            await this.dataSource.query(
                'CREATE EXTENSION IF NOT EXISTS unaccent;',
            );

            // 2. Türkçe (İ, ı, ş, ğ, ç, ö, ü) ve uluslararası aksanları normalize eden IMMUTABLE yardımcı fonksiyon
            await this.dataSource.query(`
                CREATE OR REPLACE FUNCTION normalize_search_text(input_text text)
                RETURNS text
                LANGUAGE sql
                IMMUTABLE
                AS $$
                    SELECT lower(
                        unaccent(
                            translate(
                                COALESCE(input_text, ''),
                                'İIıŞşĞğÜüÖöÇç',
                                'iiissgguuoocc'
                            )
                        )
                    );
                $$;
            `);

            // 3. Çoklu dil JSONB GIN indeksi ve Trigram (Fuzzy Search) GIN indeksi
            await this.dataSource.query(
                'CREATE INDEX IF NOT EXISTS "IDX_PLACE_NAME_TRANSLATIONS" ON "places" USING GIN ("name_translations");',
            );
            await this.dataSource.query(
                'CREATE INDEX IF NOT EXISTS "IDX_PLACE_DEFAULT_NAME_TRGM" ON "places" USING GIN (normalize_search_text("default_name") gin_trgm_ops);',
            );

            this.logger.log(
                'PostGIS, pg_trgm, unaccent extensions and GIN/Trigram indexes verified.',
            );
        } catch (error) {
            this.logger.warn(
                `Could not verify database extensions/indexes on startup: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
}
