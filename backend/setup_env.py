"""Create .env once, without displaying database credentials."""

import argparse
import getpass
import secrets
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Prepare local configuration")
    parser.add_argument("--local", action="store_true", help="Use SQLite for a local demo only")
    args = parser.parse_args()
    if Path(".env").exists():
        parser.exit(1, ".env already exists. Edit it directly; it was not overwritten.\n")
    url = (
        "sqlite:///./monaqesh.db"
        if args.local
        else getpass.getpass("Paste Neon connection string (hidden): ").strip()
    )
    if not args.local and not url.startswith(
        ("postgresql://", "postgres://", "postgresql+psycopg://")
    ):
        parser.exit(1, "Expected a PostgreSQL connection string. Nothing was written.\n")
    lines = Path(".env.example").read_text(encoding="utf-8").splitlines()
    result = []
    for line in lines:
        if line.startswith("DATABASE_URL="):
            line = f"DATABASE_URL={url}"
        elif line.startswith("SECRET_KEY="):
            line = f"SECRET_KEY={secrets.token_hex(32)}"
        result.append(line)
    path = Path(".env")
    with path.open("x", encoding="utf-8") as output:
        output.write("\n".join(result) + "\n")
    path.chmod(0o600)
    print("Created .env with a new random secret. Next: alembic upgrade head")


if __name__ == "__main__":
    main()
