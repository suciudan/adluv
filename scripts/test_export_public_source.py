"""Safety checks for the release exporter; only uses temporary repositories."""

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "export_public_source", Path(__file__).with_name("export-public-source.py")
)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "source"
        self.root.mkdir()
        self.destination = Path(self.temp.name) / "public"
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)

    def write(self, name, content):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        return target

    def test_ignores_tracked_credentials_and_storage_and_keeps_current_source(self):
        self.write(".gitignore", ".env*\n!.env.example\n**/cdn/storage/\n")
        self.write(".env.local", "LOCAL_ONLY=placeholder\n")
        self.write("apps/cms/apps/cdn/storage/avatar.txt", "private upload")
        self.write(".env.example", "LOCAL_ONLY=\n")
        source = self.write("app.txt", "old content")
        removed = self.write("removed.txt", "removed")
        subprocess.run(["git", "-C", str(self.root), "add", "--force", "."], check=True)
        source.write_text("current content")
        removed.unlink()
        self.write("new.txt", "new source")

        self.assertEqual(exporter.export_source(self.root, self.destination), 4)
        self.assertEqual((self.destination / "app.txt").read_text(), "current content")
        self.assertTrue((self.destination / "new.txt").exists())
        for name in [".git", ".env.local", "apps", "removed.txt"]:
            self.assertFalse((self.destination / name).exists(), name)

    def test_refuses_existing_or_nested_destination(self):
        self.write("app.txt", "source")
        self.destination.mkdir()
        with self.assertRaises(ValueError):
            exporter.export_source(self.root, self.destination)
        with self.assertRaises(ValueError):
            exporter.export_source(self.root, self.root / "nested")

    def test_refuses_symlink_before_creating_export(self):
        external = Path(self.temp.name) / "private.txt"
        external.write_text("private")
        (self.root / "linked.txt").symlink_to(external)
        with self.assertRaises(ValueError):
            exporter.export_source(self.root, self.destination)
        self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()
