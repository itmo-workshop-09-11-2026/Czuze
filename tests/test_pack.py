"""Filesystem error must preserve the previous archive."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import pack

class PackTests(unittest.TestCase):
    def test_unreadable_directory_preserves_previous_zip(self):
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                Path('site/blocked').mkdir(parents=True)
                Path('site/index.html').write_text('hello')
                Path('shop.zip').write_bytes(b'previous archive')
                original = os.scandir
                def scandir(path):
                    if Path(path).name == 'blocked': raise PermissionError('access denied')
                    return original(path)
                with patch('os.scandir', side_effect=scandir):
                    with self.assertRaises(PermissionError): pack(Path('site'))
                self.assertEqual(Path('shop.zip').read_bytes(), b'previous archive')
            finally:
                os.chdir(previous)

if __name__=='__main__': unittest.main()
