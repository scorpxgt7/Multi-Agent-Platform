from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from shared.db import Base


def initialize_schema(database_url: str):
    engine = create_engine(database_url, future=True, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    return engine


def create_session_factory(database_url: str):
    engine = create_engine(database_url, future=True, pool_pre_ping=True)
    return sessionmaker(bind=engine, expire_on_commit=False, class_=Session)
