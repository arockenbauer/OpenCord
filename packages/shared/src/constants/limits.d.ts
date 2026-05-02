export declare const LIMITS: {
    readonly MAX_USERNAME_LENGTH: 32;
    readonly MIN_USERNAME_LENGTH: 2;
    readonly MAX_PASSWORD_LENGTH: 128;
    readonly MIN_PASSWORD_LENGTH: 8;
    readonly MAX_EMAIL_LENGTH: 254;
    readonly MAX_MESSAGE_LENGTH: 2000;
    readonly MAX_BIO_LENGTH: 190;
    readonly MAX_BIO_LENGTH_PREMIUM: 4000;
    readonly MAX_CUSTOM_STATUS_LENGTH: 128;
    readonly MAX_GUILD_NAME_LENGTH: 100;
    readonly MIN_GUILD_NAME_LENGTH: 2;
    readonly MAX_GUILD_DESCRIPTION_LENGTH: 120;
    readonly MAX_CHANNEL_NAME_LENGTH: 100;
    readonly MIN_CHANNEL_NAME_LENGTH: 1;
    readonly MAX_CHANNEL_TOPIC_LENGTH: 1024;
    readonly MAX_ROLE_NAME_LENGTH: 100;
    readonly MAX_NICKNAME_LENGTH: 32;
    readonly MAX_ATTACHMENTS_PER_MESSAGE: 10;
    readonly MAX_EMBED_TITLE_LENGTH: 256;
    readonly MAX_EMBED_DESCRIPTION_LENGTH: 4096;
    readonly MAX_EMBED_FIELDS: 25;
    readonly MAX_EMBED_FIELD_NAME_LENGTH: 256;
    readonly MAX_EMBED_FIELD_VALUE_LENGTH: 1024;
    readonly MAX_EMBEDS_PER_MESSAGE: 10;
    readonly MAX_EMOJI_NAME_LENGTH: 32;
    readonly MIN_EMOJI_NAME_LENGTH: 2;
    readonly MAX_STICKER_NAME_LENGTH: 30;
    readonly MIN_STICKER_NAME_LENGTH: 2;
    readonly MAX_STICKER_DESCRIPTION_LENGTH: 100;
    readonly MAX_STICKER_TAGS_LENGTH: 200;
    readonly MAX_GUILDS_PER_USER: 100;
    readonly MAX_CHANNELS_PER_GUILD: 500;
    readonly MAX_ROLES_PER_GUILD: 250;
    readonly MAX_MEMBERS_PER_GUILD: 500000;
    readonly MAX_INVITE_CODE_LENGTH: 10;
    readonly MIN_INVITE_CODE_LENGTH: 6;
    readonly MAX_BAN_REASON_LENGTH: 512;
    readonly MAX_AUDIT_LOG_REASON_LENGTH: 512;
    readonly MAX_GROUP_DM_MEMBERS: 10;
    readonly MAX_AUTOMOD_RULES_PER_GUILD: 6;
    readonly MAX_AUTOMOD_REGEX_PATTERNS: 10;
    readonly MAX_AUTOMOD_REGEX_LENGTH: 75;
    readonly MAX_AUTOMOD_CUSTOM_MESSAGE_LENGTH: 150;
    readonly MAX_TIMEOUT_DURATION_SECONDS: 2419200;
    readonly DISCRIMINATOR_MIN: 1;
    readonly DISCRIMINATOR_MAX: 9999;
    readonly MIN_AGE: 13;
    readonly MAX_FILE_SIZE: 8388608;
    readonly MAX_FILE_SIZE_PREMIUM: 26214400;
    readonly MAX_AVATAR_SIZE: 8388608;
    readonly MAX_AVATAR_SIZE_PREMIUM: 10485760;
    readonly MAX_EMOJI_SIZE: 262144;
    readonly MAX_STICKER_SIZE: 524288;
    readonly BULK_DELETE_MAX: 100;
    readonly BULK_DELETE_MAX_AGE_DAYS: 14;
};
export declare const BOOST_TIERS: {
    readonly TIER_0: {
        readonly level: 0;
        readonly boostsRequired: 0;
    };
    readonly TIER_1: {
        readonly level: 1;
        readonly boostsRequired: 2;
    };
    readonly TIER_2: {
        readonly level: 2;
        readonly boostsRequired: 7;
    };
    readonly TIER_3: {
        readonly level: 3;
        readonly boostsRequired: 14;
    };
};
export declare const EMOJI_LIMITS_BY_TIER: {
    readonly 0: {
        readonly static: 50;
        readonly animated: 50;
    };
    readonly 1: {
        readonly static: 100;
        readonly animated: 100;
    };
    readonly 2: {
        readonly static: 150;
        readonly animated: 150;
    };
    readonly 3: {
        readonly static: 250;
        readonly animated: 250;
    };
};
export declare const STICKER_LIMITS_BY_TIER: {
    readonly 0: 5;
    readonly 1: 15;
    readonly 2: 30;
    readonly 3: 60;
};
//# sourceMappingURL=limits.d.ts.map