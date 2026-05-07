from shared.utils.config import load_settings
from shared.utils.database import initialize_schema

from seed_validation_data import seed_validation_data
from sqlalchemy.orm import Session


def main():
    settings = load_settings("schema-bootstrap", 0)
    engine = initialize_schema(settings.database_url)
    with Session(engine) as session:
        seed_validation_data(session)
    print("schema bootstrap complete")


if __name__ == "__main__":
    main()
