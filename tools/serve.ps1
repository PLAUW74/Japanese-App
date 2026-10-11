# Serves the app on http://localhost:<Port>/ using only Windows PowerShell.
#
#   powershell -ExecutionPolicy Bypass -File tools\serve.ps1
param(
    [int]$Port = 5173,
    [switch]$Open  # also open the app in the default browser
)

$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg' = 'image/svg+xml'
    '.png' = 'image/png'
    '.ico' = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
    $listener.Start()
}
catch {
    # The port is taken, most likely by a copy of this server that is already running.
    Write-Host "Kotoba already seems to be running at http://localhost:$Port/"
    if ($Open) { Start-Process "http://localhost:$Port/" }
    exit
}
Write-Host "Kotoba is running at http://localhost:$Port/"
Write-Host 'Keep this window open while you use the app. Close it to stop.'
if ($Open) { Start-Process "http://localhost:$Port/" }

try {
    while ($listener.IsListening) {
        # Poll so Ctrl+C is noticed between requests.
        $pending = $listener.GetContextAsync()
        while (-not $pending.Wait(200)) { }
        $ctx = $pending.Result
        $res = $ctx.Response
        try {
            $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
            if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
            $path = [IO.Path]::GetFullPath((Join-Path $root $rel))

            if (-not $path.StartsWith($root + [IO.Path]::DirectorySeparatorChar) -or -not (Test-Path $path -PathType Leaf)) {
                $res.StatusCode = 404
                $body = [Text.Encoding]::UTF8.GetBytes('Not found')
                $res.OutputStream.Write($body, 0, $body.Length)
                continue
            }

            $file = Get-Item $path
            $stamp = $file.LastWriteTimeUtc.ToString('R')
            $res.Headers['Last-Modified'] = $stamp
            $res.Headers['Cache-Control'] = 'no-cache'
            if ($ctx.Request.Headers['If-Modified-Since'] -eq $stamp) {
                $res.StatusCode = 304
                continue
            }

            $type = $types[$file.Extension.ToLower()]
            if (-not $type) { $type = 'application/octet-stream' }
            $res.ContentType = $type
            $res.ContentLength64 = $file.Length
            if ($ctx.Request.HttpMethod -ne 'HEAD') {
                $stream = [IO.File]::OpenRead($path)
                try { $stream.CopyTo($res.OutputStream) } finally { $stream.Close() }
            }
        }
        catch {
            # The browser closed the connection mid-response; nothing to recover.
        }
        finally {
            try { $res.Close() } catch { }
        }
    }
}
finally {
    $listener.Stop()
}
