from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from shared.utils.database import apply_lightweight_migrations


def test_apply_lightweight_migrations_adds_memory_organization_id():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE memory_records (id VARCHAR(64) PRIMARY KEY, namespace VARCHAR(64))"))

    apply_lightweight_migrations(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("memory_records")}
    assert "organization_id" in columns
