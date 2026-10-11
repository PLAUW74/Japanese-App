# Builds the compact data files the app loads (data/dict.json, data/kanji.json)
# from the raw sources in data-src/. Needs only Windows PowerShell.
#
#   powershell -ExecutionPolicy Bypass -File tools\build-data.ps1
#
# Sources (downloaded automatically when missing):
#   JMdict + KANJIDIC2 as JSON  https://github.com/scriptin/jmdict-simplified
#   JLPT word lists             https://github.com/stephenmk/yomitan-jlpt-vocab
param(
    [string]$Release = '3.6.2+20261005200550'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'data-src'
$out = Join-Path $root 'data'
New-Item -ItemType Directory -Force $src, $out | Out-Null

$version = $Release.Split('+')[0]
$tag = [Uri]::EscapeDataString($Release)
$base = "https://github.com/scriptin/jmdict-simplified/releases/download/$tag"
foreach ($name in 'jmdict-eng', 'kanjidic2-en') {
    $json = Join-Path $src "$name-$version.json"
    if (-not (Test-Path $json)) {
        $zip = Join-Path $src "$name.json.zip"
        Write-Host "Downloading $name..."
        Invoke-WebRequest "$base/$name-$tag.json.zip" -OutFile $zip
        Expand-Archive $zip -DestinationPath $src -Force
    }
}
foreach ($n in 1..5) {
    $csv = Join-Path $src "n$n.csv"
    if (-not (Test-Path $csv)) {
        Invoke-WebRequest "https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/main/original_data/n$n.csv" -OutFile $csv
    }
}

Add-Type -ReferencedAssemblies 'System.Web.Extensions' -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

public static class DictBuilder
{
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    static void Esc(StringBuilder sb, string s)
    {
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\t': sb.Append("\\t"); break;
                case '\r': break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }

    static void EscList(StringBuilder sb, List<string> items)
    {
        sb.Append('[');
        for (int i = 0; i < items.Count; i++)
        {
            if (i > 0) sb.Append(',');
            Esc(sb, items[i]);
        }
        sb.Append(']');
    }

    static object[] Arr(Dictionary<string, object> d, string key)
    {
        object v;
        if (d.TryGetValue(key, out v) && v is object[]) return (object[])v;
        return new object[0];
    }

    static bool Has(object[] items, string value)
    {
        foreach (object o in items) if ((o as string) == value) return true;
        return false;
    }

    // Entries sit one per line; the last one carries the array's closing bracket.
    static string Entry(string line)
    {
        if (line.EndsWith(",")) return line.Substring(0, line.Length - 1);
        if (line.EndsWith("]")) return line.Substring(0, line.Length - 1);
        return line;
    }

    static int Int(object o)
    {
        return o == null ? 0 : Convert.ToInt32(o);
    }

    // jmdict_seq -> JLPT level (5 = easiest). A word on two lists keeps the easier level.
    static Dictionary<int, int> LoadJlpt(string srcDir)
    {
        var map = new Dictionary<int, int>();
        for (int level = 1; level <= 5; level++)
        {
            string path = Path.Combine(srcDir, "n" + level + ".csv");
            if (!File.Exists(path)) continue;
            foreach (string line in File.ReadLines(path, Encoding.UTF8))
            {
                int comma = line.IndexOf(',');
                int seq;
                if (comma <= 0 || !int.TryParse(line.Substring(0, comma), out seq)) continue;
                map[seq] = level;
            }
        }
        return map;
    }

    // Word row: [id, [kanji], [kana], [[pos, [gloss], tags], ...], common, jlpt, [searchOnlyForms]]
    public static string BuildWords(string jsonPath, string srcDir, string outPath)
    {
        var ser = new JavaScriptSerializer();
        ser.MaxJsonLength = int.MaxValue;
        var jlpt = LoadJlpt(srcDir);
        Dictionary<string, object> allTags = null;
        var usedTags = new HashSet<string>();
        string dictDate = "";
        int count = 0, jlptCount = 0;
        var sb = new StringBuilder();

        using (var w = new StreamWriter(outPath, false, Utf8))
        {
            w.Write("{\"words\":[\n");
            foreach (string raw in File.ReadLines(jsonPath, Encoding.UTF8))
            {
                if (raw.StartsWith("\"tags\""))
                {
                    string body = raw.Substring(raw.IndexOf('{')).TrimEnd(',');
                    allTags = (Dictionary<string, object>)ser.DeserializeObject(body);
                    continue;
                }
                if (raw.StartsWith("\"dictDate\""))
                {
                    dictDate = raw.Split('"')[3];
                    continue;
                }
                if (!raw.StartsWith("{\"id\"")) continue;

                var d = (Dictionary<string, object>)ser.DeserializeObject(Entry(raw));
                int id = int.Parse((string)d["id"]);
                bool common = false;
                var kanji = new List<string>();
                var kana = new List<string>();
                var hidden = new List<string>();

                foreach (object o in Arr(d, "kanji"))
                {
                    var k = (Dictionary<string, object>)o;
                    if (Has(Arr(k, "tags"), "sK")) { hidden.Add((string)k["text"]); continue; }
                    kanji.Add((string)k["text"]);
                    if ((bool)k["common"]) common = true;
                }
                foreach (object o in Arr(d, "kana"))
                {
                    var k = (Dictionary<string, object>)o;
                    if (Has(Arr(k, "tags"), "sk")) { hidden.Add((string)k["text"]); continue; }
                    kana.Add((string)k["text"]);
                    if ((bool)k["common"]) common = true;
                }
                if (kana.Count == 0) continue;

                sb.Length = 0;
                if (count > 0) sb.Append(",\n");
                sb.Append('[').Append(id).Append(',');
                EscList(sb, kanji);
                sb.Append(',');
                EscList(sb, kana);
                sb.Append(",[");
                bool firstSense = true;
                foreach (object o in Arr(d, "sense"))
                {
                    var s = (Dictionary<string, object>)o;
                    var gloss = new List<string>();
                    foreach (object g in Arr(s, "gloss"))
                    {
                        string text = ((Dictionary<string, object>)g)["text"] as string;
                        if (!string.IsNullOrEmpty(text)) gloss.Add(text);
                    }
                    if (gloss.Count == 0) continue;
                    var pos = new List<string>();
                    foreach (object p in Arr(s, "partOfSpeech")) { pos.Add((string)p); usedTags.Add((string)p); }
                    var tags = new List<string>();
                    foreach (string key in new[] { "misc", "field", "dialect" })
                        foreach (object t in Arr(s, key)) { tags.Add((string)t); usedTags.Add((string)t); }

                    if (!firstSense) sb.Append(',');
                    firstSense = false;
                    sb.Append('[');
                    Esc(sb, string.Join(",", pos));
                    sb.Append(',');
                    EscList(sb, gloss);
                    sb.Append(',');
                    Esc(sb, string.Join(",", tags));
                    sb.Append(']');
                }
                if (firstSense) continue;

                int level;
                if (!jlpt.TryGetValue(id, out level)) level = 0; else jlptCount++;
                sb.Append("],").Append(common ? 1 : 0).Append(',').Append(level);
                if (hidden.Count > 0) { sb.Append(','); EscList(sb, hidden); }
                sb.Append(']');
                w.Write(sb.ToString());
                count++;
            }

            sb.Length = 0;
            sb.Append("\n],\"tags\":{");
            bool firstTag = true;
            if (allTags != null)
            {
                foreach (var kv in allTags)
                {
                    if (!usedTags.Contains(kv.Key)) continue;
                    if (!firstTag) sb.Append(',');
                    firstTag = false;
                    Esc(sb, kv.Key);
                    sb.Append(':');
                    Esc(sb, (string)kv.Value);
                }
            }
            sb.Append("},\"date\":");
            Esc(sb, dictDate);
            sb.Append('}');
            w.Write(sb.ToString());
        }
        return count + " words (" + jlptCount + " with a JLPT level), dictionary date " + dictDate;
    }

    // Kanji map: { "字": [[meanings], [on], [kun], strokes, grade, frequency] }
    public static string BuildKanji(string jsonPath, string outPath)
    {
        var ser = new JavaScriptSerializer();
        ser.MaxJsonLength = int.MaxValue;
        int count = 0;
        var sb = new StringBuilder();

        using (var w = new StreamWriter(outPath, false, Utf8))
        {
            w.Write("{");
            foreach (string raw in File.ReadLines(jsonPath, Encoding.UTF8))
            {
                if (!raw.StartsWith("{\"literal\"")) continue;
                var d = (Dictionary<string, object>)ser.DeserializeObject(Entry(raw));
                var meanings = new List<string>();
                var on = new List<string>();
                var kun = new List<string>();

                object rmObj;
                d.TryGetValue("readingMeaning", out rmObj);
                var rm = rmObj as Dictionary<string, object>;
                if (rm != null)
                {
                    foreach (object go in Arr(rm, "groups"))
                    {
                        var g = (Dictionary<string, object>)go;
                        foreach (object ro in Arr(g, "readings"))
                        {
                            var r = (Dictionary<string, object>)ro;
                            string type = r["type"] as string;
                            if (type == "ja_on") on.Add((string)r["value"]);
                            else if (type == "ja_kun") kun.Add((string)r["value"]);
                        }
                        foreach (object mo in Arr(g, "meanings"))
                        {
                            var m = (Dictionary<string, object>)mo;
                            if ((m["lang"] as string) == "en") meanings.Add((string)m["value"]);
                        }
                    }
                }
                if (meanings.Count == 0 && on.Count == 0 && kun.Count == 0) continue;

                var misc = (Dictionary<string, object>)d["misc"];
                object[] strokes = Arr(misc, "strokeCounts");
                object grade, freq;
                misc.TryGetValue("grade", out grade);
                misc.TryGetValue("frequency", out freq);

                sb.Length = 0;
                if (count > 0) sb.Append(",\n");
                Esc(sb, (string)d["literal"]);
                sb.Append(":[");
                EscList(sb, meanings);
                sb.Append(',');
                EscList(sb, on);
                sb.Append(',');
                EscList(sb, kun);
                sb.Append(',').Append(strokes.Length > 0 ? Int(strokes[0]) : 0);
                sb.Append(',').Append(Int(grade));
                sb.Append(',').Append(Int(freq));
                sb.Append(']');
                w.Write(sb.ToString());
                count++;
            }
            w.Write("}");
        }
        return count + " kanji";
    }
}
'@

$timer = [Diagnostics.Stopwatch]::StartNew()
$words = [DictBuilder]::BuildWords((Join-Path $src "jmdict-eng-$version.json"), $src, (Join-Path $out 'dict.json'))
$kanji = [DictBuilder]::BuildKanji((Join-Path $src "kanjidic2-en-$version.json"), (Join-Path $out 'kanji.json'))
Write-Host "dict.json : $words"
Write-Host "kanji.json: $kanji"
Get-ChildItem $out | ForEach-Object { '{0,-12} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB) }
Write-Host ("Done in {0:N0}s" -f $timer.Elapsed.TotalSeconds)
