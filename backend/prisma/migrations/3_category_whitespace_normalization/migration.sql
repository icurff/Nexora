BEGIN;

CREATE OR REPLACE FUNCTION normalize_label(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(normalize(value, NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION set_category_name_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := regexp_replace(
    regexp_replace(normalize(NEW.name, NFC), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  );
  NEW.name_key := normalize_label(NEW.name);
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

COMMIT;
