import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
} from 'class-validator';

export class RequestPresignedUrlDto {
    @IsString()
    file_name!: string;

    @IsString()
    @IsIn([
        'image/webp',
        'image/jpeg',
        'video/mp4',
        'video/webm',
        'video/quicktime',
    ])
    mime_type!: string;

    @IsOptional()
    @IsIn(['ROUTE_STOP', 'MEMORY', 'AVATAR'])
    target_type?: 'ROUTE_STOP' | 'MEMORY' | 'AVATAR' = 'ROUTE_STOP';

    @IsOptional()
    @IsUUID()
    route_id?: string;

    @IsOptional()
    @IsUUID()
    stop_id?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(20)
    requested_count?: number = 1;
}

export class AttachStopMediaDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    media_urls!: string[];
}

export class RemoveStopMediaDto {
    @IsString()
    media_url!: string;
}
