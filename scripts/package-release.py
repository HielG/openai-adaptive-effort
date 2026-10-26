"""Build a clean local ZIP using only the Python standard library."""
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
release = root.parent / "releases" / f"openai-adaptive-effort-{version}"
# Append, rather than replacing a dotted semantic-version suffix.
archive = Path(str(release) + ".zip")
if release.exists() or archive.exists():
    raise SystemExit("Release output already exists; refusing to replace it")
destination = release / "openai-adaptive-effort"
destination.mkdir(parents=True)
names = [".agents", ".codex-plugin", ".gitignore", "plugin.json", "package.json", "LICENSE", "README.md", "src", "bin", "hooks", "skills", "scripts", "tests", "docs"]
for name in names:
    source, target = root / name, destination / name
    if source.is_dir():
        shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    else:
        shutil.copy2(source, target)
(destination / "evidence").mkdir()
for source in (root / "evidence").iterdir():
    if source.is_file() and source.suffix in {".json", ".log"}:
        shutil.copy2(source, destination / "evidence" / source.name)
files = sorted(p for p in destination.rglob("*") if p.is_file())
manifest = {str(p.relative_to(destination)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
identity = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
(destination / "evidence" / "source-sha256.json").write_text(identity, encoding="utf-8")
(root / "evidence" / "source-sha256.json").write_text(identity, encoding="utf-8")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for source in sorted(p for p in destination.rglob("*") if p.is_file()):
        bundle.write(source, source.relative_to(release).as_posix())
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert len(bundle.namelist()) == len(files) + 1
    for name, digest in manifest.items():
        assert hashlib.sha256(bundle.read("openai-adaptive-effort/" + name)).hexdigest() == digest
    assert not any("local-smoke" in name or "auth.json" in name or name.endswith(".sqlite") for name in bundle.namelist())
record = {"archive": str(archive), "extracted": str(destination), "files": len(files) + 1, "bytes": archive.stat().st_size, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "integrityVerified": True}
(root / "evidence" / "release.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record, indent=2))
