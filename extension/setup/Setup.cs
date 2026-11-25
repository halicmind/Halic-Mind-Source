using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Windows.Forms;

[assembly: AssemblyTitle("HalicMind HalicX Setup")]
[assembly: AssemblyProduct("HalicMind")]
[assembly: AssemblyDescription("Prepares the HalicX extension and opens Chrome installation instructions.")]
[assembly: AssemblyVersion("1.0.0.0")]

public static class ExtensionPackage {
    const string ExpectedHash = "__ZIP_SHA256__";
    static readonly string[] Names = {"manifest.json", "background.js", "content.js", "connect.js", "popup.html", "popup.css", "popup.js"};

    public static byte[] ReadVerified() {
        using (var input = Assembly.GetExecutingAssembly().GetManifestResourceStream("extension.zip"))
        using (var memory = new MemoryStream()) {
            if (input == null) throw new InvalidDataException("Uzantı paketi bulunamadı.");
            input.CopyTo(memory);
            var bytes = memory.ToArray();
            using (var hash = SHA256.Create()) {
                var actual = BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "");
                if (!String.Equals(actual, ExpectedHash, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Uzantı paketi doğrulanamadı.");
            }
            using (var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read)) {
                if (zip.Entries.Count != Names.Length || Names.Any(n => zip.Entries.Count(e => e.FullName == n) != 1))
                    throw new InvalidDataException("Uzantı dosyaları beklenen yapıda değil.");
            }
            return bytes;
        }
    }

    public static string Prepare(string destination) {
        var bytes = ReadVerified();
        destination = Path.GetFullPath(destination);
        // Refuse directory links: never install through a redirect to another location.
        for (var directory = new DirectoryInfo(destination); directory != null; directory = directory.Parent) {
            if (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Kurulum klasörü bir bağlantı olamaz.");
        }
        Directory.CreateDirectory(destination);
        using (var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read)) {
            // Check every destination before updating any file; manifest is written last.
            foreach (var name in Names) {
                var path = Path.Combine(destination, name);
                if (Directory.Exists(path) || (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0))
                    throw new IOException("Kurulum hedefinde beklenmeyen dosya bağlantısı var.");
            }
            foreach (var name in Names.Where(n => n != "manifest.json").Concat(new[]{"manifest.json"})) {
                using (var input = zip.GetEntry(name).Open())
                using (var output = new FileStream(Path.Combine(destination, name), FileMode.Create, FileAccess.Write, FileShare.None))
                    input.CopyTo(output);
            }
        }
        return destination;
    }
}

public class SetupWindow : Form {
    readonly Label message = new Label();
    readonly TextBox folder = new TextBox();
    readonly Button copy = new Button();
    readonly Button chrome = new Button();
    readonly Button account = new Button();
    string target;

    public SetupWindow() {
        Text = "Haliç Mind · HaliçX kurulumu";
        ClientSize = new Size(650, 490);
        MinimumSize = new Size(600, 490);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(248, 248, 245);
        var title = new Label {Text="HaliçX bağlantını hazırlıyoruz", Left=28, Top=26, Width=590, Height=38, Font=new Font("Segoe UI", 19, FontStyle.Bold), ForeColor=Color.FromArgb(20, 32, 74)};
        message.SetBounds(28, 76, 590, 185);
        message.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        message.Text = "Uzantı dosyaları doğrulanıyor…";
        folder.SetBounds(28, 275, 590, 30); folder.ReadOnly=true;
        folder.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        copy.Text="Klasör yolunu kopyala"; copy.SetBounds(28, 319, 205, 40);
        chrome.Text="Chrome kurulumunu aç"; chrome.SetBounds(245, 319, 220, 40);
        account.Text="Kurulumu yaptım · Hesabıma dön"; account.SetBounds(28, 382, 380, 48);
        copy.Enabled=chrome.Enabled=account.Enabled=false;
        copy.Click += (s,e) => CopyFolder();
        chrome.Click += (s,e) => OpenChrome();
        account.Click += (s,e) => OpenUrl("https://halicmind.com/app/#/connections");
        Controls.AddRange(new Control[]{title,message,folder,copy,chrome,account});
        Shown += (s,e) => BeginInstall();
    }

    void BeginInstall() {
        try {
            target = ExtensionPackage.Prepare(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HalicMind", "HalicX-Extension"));
            folder.Text=target;
            message.Text = "Dosyalar hazır. Klasör yolu panoya kopyalandı.\r\n\r\n1. Chrome’da sağ üstte Geliştirici modu’nu aç.\r\n2. Paketlenmemiş öğe yükle’ye bas.\r\n3. Açılan pencerede adres çubuğuna klasör yolunu yapıştır\r\n    (Ctrl+V, Enter) ve Klasör Seç’e bas.\r\n\r\nEski uzantı başka klasörden kuruluysa önce onu kaldır.\r\nBu klasörü silme; uzantı buradan çalışır.";
            copy.Enabled=chrome.Enabled=account.Enabled=true;
            CopyFolder();
            try { Process.Start("explorer.exe", "\""+target+"\""); } catch { }
            OpenChrome();
        } catch {
            message.Text="Dosyalar hazırlanamadı. Disk alanını ve klasör yazma iznini kontrol et. Güvenlik yazılımını kapatma. ZIP ile kurulum için halicmind.com’daki Bağlantılar ekranını kullan.";
        }
    }

    void CopyFolder() {
        try { Clipboard.SetText(target); copy.Text="Kopyalandı"; }
        catch { folder.Focus(); folder.SelectAll(); copy.Text="Yolu seçip Ctrl+C yap"; }
    }
    void OpenChrome() {
        var roots = new[]{Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)};
        var executable = roots.Select(r => Path.Combine(r,"Google","Chrome","Application","chrome.exe")).FirstOrDefault(File.Exists);
        if (executable == null) {
            MessageBox.Show("Chrome bulunamadı. Chrome’u açıp adres çubuğuna chrome://extensions yaz.",Text);
            return;
        }
        try {Process.Start(executable, "chrome://extensions/");}
        catch {MessageBox.Show("Chrome adres çubuğuna chrome://extensions yaz.",Text);}
    }
    void OpenUrl(string url) {
        try {Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}
        catch {MessageBox.Show("Tarayıcında https://halicmind.com/app/#/connections adresini aç.",Text);}
    }

    [STAThread]
    public static int Main(string[] args) {
        if (args.Length==1 && args[0]=="--verify") {
            try {ExtensionPackage.ReadVerified();return 0;}catch{return 1;}
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SetupWindow());
        return 0;
    }
}
