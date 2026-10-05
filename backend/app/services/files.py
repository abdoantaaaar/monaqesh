import hashlib
import stat
import zipfile
from pathlib import Path, PurePosixPath
from uuid import uuid4

from fastapi import HTTPException

from app.core.config import get_settings

ALLOWED = {
    "source_code": {".zip"},
    "documentation": {".pdf"},
    "presentation": {".pdf", ".pptx"},
    "readme": {".txt", ".md"},
}


def validate_archive(path, *, pptx=False):
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            if (
                not members
                or len(members) > 2000
                or sum(m.file_size for m in members) > 100 * 1024 * 1024
            ):
                raise ValueError("Empty archive or expanded archive exceeds 100 MB / 2000 entries")
            for member in members:
                name = member.filename.replace("\\", "/")
                parts = PurePosixPath(name)
                if (
                    parts.is_absolute()
                    or ".." in parts.parts
                    or ":" in name
                    or "\x00" in name
                    or stat.S_ISLNK(member.external_attr >> 16)
                    or member.flag_bits & 1
                ):
                    raise ValueError("Unsafe or encrypted archive entry")
            if archive.testzip() is not None:
                raise ValueError("Corrupted archive")
            if pptx and (
                "[Content_Types].xml" not in archive.namelist()
                or not any(n.startswith("ppt/") for n in archive.namelist())
            ):
                raise ValueError("Not a PowerPoint file")
    except (ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise HTTPException(422, f"Invalid archive: {exc}")


def save_upload(upload, kind):
    settings = get_settings()
    name = Path((upload.filename or "").replace("\\", "/")).name
    if not name or len(name) > 255 or any(ord(c) < 32 for c in name):
        raise HTTPException(422, "Invalid filename")
    extension = Path(name).suffix.lower()
    if extension not in ALLOWED[kind]:
        raise HTTPException(422, f"Allowed extensions: {', '.join(sorted(ALLOWED[kind]))}")
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = str(uuid4()) + extension
    path = settings.upload_dir / stored_name
    digest = hashlib.sha256()
    size = 0
    try:
        with path.open("xb") as output:
            while chunk := upload.file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_mb * 1024 * 1024:
                    raise HTTPException(413, "File exceeds maximum upload size")
                digest.update(chunk)
                output.write(chunk)
        if not size:
            raise HTTPException(422, "Empty files are not accepted")
        if extension in {".zip", ".pptx"}:
            validate_archive(path, pptx=extension == ".pptx")
        elif extension == ".pdf":
            with path.open("rb") as source:
                if source.read(5) != b"%PDF-":
                    raise HTTPException(422, "File does not have a PDF signature")
        else:
            try:
                path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                raise HTTPException(422, "README must be UTF-8 text")
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {
        "original_name": name,
        "stored_name": stored_name,
        "size_bytes": size,
        "sha256": digest.hexdigest(),
    }
