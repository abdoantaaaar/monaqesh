"""Account provisioning is a local admin command, never a public register API."""

import argparse
import csv
import getpass
import re

from sqlalchemy import select

from app.core.security import hash_password
from app.db import SessionLocal
from app.models import User


def add_user(db, university_id, email, name, role, password):
    university_id = university_id.strip().lower()
    email = email.strip().lower()
    name = name.strip()
    if not university_id or len(university_id) > 60 or "@" in university_id:
        raise ValueError("University ID must be 1-60 characters, without @")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
        raise ValueError("Invalid email address")
    if not name or len(name) > 120 or role not in {"student", "ta", "professor"}:
        raise ValueError("Invalid name or role")
    if not 8 <= len(password) <= 256:
        raise ValueError("Use a password of 8-256 characters")
    existing = db.scalar(
        select(User).where((User.university_id == university_id) | (User.email == email))
    )
    if existing:
        if (existing.university_id, existing.email, existing.name, existing.role) != (
            university_id,
            email,
            name,
            role,
        ):
            raise ValueError("Existing account differs; do not overwrite an account silently")
        return False  # Never replace an existing user's password on a second import.
    db.add(
        User(
            university_id=university_id,
            email=email,
            name=name,
            role=role,
            password_hash=hash_password(password),
        )
    )
    db.flush()
    return True


def main():
    parser = argparse.ArgumentParser(description="Provision Monaqesh accounts")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user")
    create.add_argument("--id", required=True, dest="university_id")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--role", required=True, choices=["student", "ta", "professor"])
    importer = commands.add_parser("import-users")
    importer.add_argument("file", help="UTF-8 CSV: university_id,email,name,role,password")
    commands.add_parser("seed-demo", help="Create university demo accounts with documented demo passwords")
    args = parser.parse_args()
    try:
        with SessionLocal() as db:
            added = 0
            if args.command == "create-user":
                added = int(
                    add_user(
                        db,
                        args.university_id,
                        args.email,
                        args.name,
                        args.role,
                        getpass.getpass("Password (at least 8 characters): "),
                    )
                )
            elif args.command == "import-users":
                with open(args.file, encoding="utf-8-sig", newline="") as source:
                    reader = csv.DictReader(source)
                    required = {"university_id", "email", "name", "role", "password"}
                    if set(reader.fieldnames or []) != required:
                        raise ValueError(
                            "CSV columns must be: university_id,email,name,role,password"
                        )
                    for row in reader:
                        added += int(add_user(db, **row))
            else:
                for university_id, name, role in [
                    ("heba", "Dr. Heba Ahmed", "professor"),
                    ("noha", "Noha Mohamed", "ta"),
                    ("2301141", "Ahmed Mohamed", "student"),
                    ("2301142", "Kareem Ali", "student"),
                    ("2301143", "Shahd Mohamed", "student"),
                    ("2301144", "Abdo Hassan", "student"),
                ]:
                    added += int(
                        add_user(
                            db,
                            university_id,
                            f"{university_id}@rst.edu.eg",
                            name,
                            role,
                            f"{university_id}@sis",
                        )
                    )
            db.commit()
            print(f"Created {added} account(s). Identical existing accounts were skipped.")
    except ValueError as exc:
        parser.exit(1, f"Import failed; no changes were committed: {exc}\n")


if __name__ == "__main__":
    main()
