"""Build the Windows helper with a hash-checked, embedded extension; no credentials."""
from pathlib import Path
import hashlib
import os
import subprocess

def main():
    root = Path(__file__).resolve().parents[2]
    compiler = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    package = root / 'frontend/public/halicx-extension.zip'
    source = (root / 'extension/setup/Setup.cs').read_text(encoding='utf-8')
    source = source.replace('__ZIP_SHA256__', hashlib.sha256(package.read_bytes()).hexdigest())
    build = root / '.local/setup-build'
    build.mkdir(parents=True, exist_ok=True)
    generated = build / 'Setup.cs'
    generated.write_text(source, encoding='utf-8-sig')
    output = root / 'frontend/public/halicx-setup-windows.exe'
    subprocess.run([str(compiler), '/nologo', '/target:winexe', '/optimize+',
                    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
                    '/reference:System.IO.Compression.dll', '/out:' + str(output),
                    '/resource:' + str(package) + ',extension.zip', str(generated)], check=True)
    subprocess.run([str(output), '--verify'], check=True)
    print('Windows helper built and embedded package verified.')

if __name__ == '__main__':
    main()
