# Builds the Chinese data files the app loads (data/zh/) from the published HSK 3.0 lists
# and CC-CEDICT. Downloads whatever is missing into data-src/zh/, then runs
# tools/build_zh_data.py, which needs only the Python standard library.
#
#   powershell -ExecutionPolicy Bypass -File tools\build-zh-data.ps1
#
# Add -Force to fetch the sources again (CC-CEDICT is rebuilt daily).
#
# Sources
#   HSK 3.0 word, character, handwriting and grammar lists, and the BCT lists
#     https://github.com/krmanik/HSK-3.0
#   CC-CEDICT, for English meanings           https://www.mdbg.net/  (CC BY-SA 4.0)
#
# The HSK lists come in two editions that disagree. The 2021 standard (GF 0025-2021) sets
# each word's band, because its totals are the published ones; the 2025 exam syllabus
# supplies the word classes, the handwriting list and the grammar, and its own band for a
# word is kept alongside. tools/build_zh_data.py explains the matching in full.
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'data-src/zh'
$out = Join-Path $root 'data/zh'
New-Item -ItemType Directory -Force $src, (Join-Path $src 'v2021'), $out | Out-Null

$repo = 'https://raw.githubusercontent.com/krmanik/HSK-3.0/main'
$v2021 = "$repo/New%20HSK%20(2021)"
$v2025 = "$repo/New%20HSK%20(2025)"

function Get-Source([string]$Url, [string]$Path) {
    if ((Test-Path $Path) -and -not $Force) { return }
    Write-Host "Downloading $(Split-Path -Leaf $Path)..."
    Invoke-WebRequest $Url -OutFile $Path
}

foreach ($n in 1..6) {
    # The 2021 standard: the bands, and the syllabus's own pinyin (in the Anki export).
    Get-Source "$v2021/HSK%20List/HSK%20$n.txt"                     (Join-Path $src "v2021/words_$n.txt")
    Get-Source "$v2021/HSK%20Hanzi/HSK%20$n.txt"                    (Join-Path $src "v2021/hanzi_$n.txt")
    Get-Source "$v2021/HSK%20List%20(Meaning)/Anki%20xiehanzi__HSK%20$n.tsv" (Join-Path $src "v2021/pin_$n.tsv")
    # The 2025 exam syllabus: word classes, its own bands, and the grammar.
    Get-Source "$v2025/HSK%20Words/temp/HSK_Level_${n}_words.txt"    (Join-Path $src "words_$n.tsv")
    Get-Source "$v2025/HSK%20Grammar/json/HSK%20$n.json"             (Join-Path $src "grammar_$n.json")
}

# The characters that have to be written by hand, not only recognised.
Get-Source "$v2025/HSK%20Handwritten/HSK_Level_1-2_handwritten.txt" (Join-Path $src 'handwritten_1-2.txt')
foreach ($n in 3..6) {
    Get-Source "$v2025/HSK%20Handwritten/HSK_Level_${n}_handwritten.txt" (Join-Path $src "handwritten_$n.txt")
}

Get-Source "$repo/BCT/BCTB_cihui.txt" (Join-Path $src 'bct_b.txt')
Get-Source 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz' (Join-Path $src 'cedict.txt.gz')

$python = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue) }
if (-not $python) { throw 'Python 3 is needed to build the Chinese data. Install it from python.org.' }

& $python.Source -I -X utf8 (Join-Path $PSScriptRoot 'build_zh_data.py') --src $src --out $out
if ($LASTEXITCODE -ne 0) { throw "The build failed (exit $LASTEXITCODE)." }
