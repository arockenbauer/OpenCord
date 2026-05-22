UPDATE "Role"
SET "permissions" = ("permissions" | 3145728)
WHERE "name" = '@everyone';
