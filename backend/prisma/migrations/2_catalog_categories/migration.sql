BEGIN;

CREATE FUNCTION normalize_label(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(btrim(normalize(value, NFC)), '[[:space:]]+', ' ', 'g'))
$$;

CREATE TABLE categories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(100) NOT NULL,
  name_key text NOT NULL DEFAULT '',
  slug varchar(150) NOT NULL,
  parent_id bigint,
  attribute_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categories_name_key_key UNIQUE (name_key),
  CONSTRAINT categories_slug_key UNIQUE (slug),
  CONSTRAINT categories_parent_fk FOREIGN KEY (parent_id)
    REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT categories_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT categories_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT categories_not_own_parent_check CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT categories_attribute_config_object_check CHECK (jsonb_typeof(attribute_config) = 'object')
);

CREATE FUNCTION set_category_name_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := normalize(NEW.name, NFC);
  NEW.name_key := normalize_label(NEW.name);
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER categories_normalize_name
BEFORE INSERT OR UPDATE OF name ON categories
FOR EACH ROW EXECUTE FUNCTION set_category_name_key();

CREATE INDEX categories_parent_active_idx ON categories(parent_id, is_active);

COMMIT;
