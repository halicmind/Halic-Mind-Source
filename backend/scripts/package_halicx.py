"""Package the reviewed extension without keys or browser data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

def main():
    root=Path(__file__).resolve().parents[2]
    source=root/'extension'/'halicx'
    output=root/'frontend'/'public'/'halicx-extension.zip'
    with ZipFile(output,'w',ZIP_DEFLATED) as archive:
        for name in ['manifest.json','background.js','content.js','popup.html','popup.css','popup.js']:
            archive.write(source/name,name)
    print('HaliçX extension packaged.')

if __name__=='__main__':main()
