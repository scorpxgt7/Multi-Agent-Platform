from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from shared.db import Base


REQUIRED_COLUMNS = {
    "memory_records": {
        "organization_id": "VARCHAR(64) NOT NULL DEFAULT ''",
    }
}


def apply_lightweight_migrations(engine):
    """Apply additive migrations needed by pre-Alembic deployments.

    The project currently uses SQLAlchemy create_all() rather than a migration
    framework. create_all() will not add columns to existing tables, so keep this
    intentionally small and additive until formal migrations are introduced.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table_name, columns in REQUIRED_COLUMNS.items():
            if table_name not in existing_tables:
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


def initialize_schema(database_url: str):
    engine = create_engine(database_url, future=True, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    apply_lightweight_migrations(engine)
    return engine


def create_session_factory(database_url: str):
    engine = create_engine(database_url, future=True, pool_pre_ping=True)
    apply_lightweight_migrations(engine)
    return sessionmaker(bind=engine, expire_on_commit=False, class_=Session)
