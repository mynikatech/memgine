
-- Allow Stage 2A announcement animation styles.
-- Retain the existing constraint name and all other constraints.

ALTER TABLE "${schemaName}".organization_branding
    DROP CONSTRAINT ck_organization_branding_v2_announcement_style;

ALTER TABLE "${schemaName}".organization_branding
    ADD CONSTRAINT ck_organization_branding_v2_announcement_style
    CHECK (
        announcement_style IN (
            'STATIC',
            'FADE',
            'SLIDE',
            'TICKER',
            'TYPEWRITER',
            'REVEAL',
            'PULSE'
        )
    );
